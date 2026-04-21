import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

export type ShiftFilter = "all" | "morning" | "night";

type GenericRow = RowDataPacket & Record<string, unknown>;

type MqttPayload = {
  ID?: string;
  TS?: string;
  Signal?: number | string;
  Location?: string;
  Status?: string;
  status?: Record<string, string>;
  [key: string]: unknown;
};

type MachineSnapshot = {
  timestampMs: number;
  reading: number | null;
  status: string;
};

export type LiveStatusMachine = {
  deviceId: string;
  topic: string;
  location: string;
  signal: number | null;
  machineName: string;
  group: string;
  status: string;
  currentStatus: string;
  averageCurrent: number | null;
  runtimeMinutes: number;
  worktimeMinutes: number;
  runtimePercent: number;
  lastSeen: string;
};

export type LiveStatusDeviceSummary = {
  deviceId: string;
  topic: string;
  location: string;
  signal: number | null;
  activeMachines: number;
  inactiveMachines: number;
  warningMachines: number;
  unknownMachines: number;
  lastSeen: string;
};

export type LiveStatusDashboard = {
  tableName: string;
  selectedDate: string;
  selectedShift: ShiftFilter;
  shiftWindowLabel: string;
  shiftDurationMinutes: number;
  devices: LiveStatusDeviceSummary[];
  machines: LiveStatusMachine[];
  summary: {
    totalDevices: number;
    totalMachines: number;
    activeMachines: number;
    inactiveMachines: number;
    warningMachines: number;
    unknownMachines: number;
    runtimeMinutes: number;
  };
  inspectedAt: string;
};

export type OffPeriod = {
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export type CurrentPoint = {
  time: string;
  value: number | null;
  status: string;
};

export type MachineDetails = {
  deviceId: string;
  machineName: string;
  selectedDate: string;
  selectedShift: ShiftFilter;
  offPeriods: OffPeriod[];
  currentSeries: CurrentPoint[];
};

type DashboardOptions = {
  date?: string;
  shift?: ShiftFilter;
};

type ParsedRow = {
  topic: string;
  payload: MqttPayload;
  timestampMs: number;
};

const DEFAULT_SAMPLE_SECONDS = 30;
const MAX_VALID_CURRENT = 100;

function parsePayloadJson(value: unknown): MqttPayload | null {
  if (!value) return null;
  if (typeof value === "object") return value as MqttPayload;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as MqttPayload;
    } catch {
      return null;
    }
  }
  return null;
}

function getSelectedDate(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return new Date().toISOString().slice(0, 10);
}

function getShiftFilter(value?: string): ShiftFilter {
  if (value === "morning" || value === "night") return value;
  return "all";
}

function addDays(date: string, days: number) {
  const baseDate = new Date(`${date}T00:00:00`);
  baseDate.setDate(baseDate.getDate() + days);
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, "0");
  const day = String(baseDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatStatus(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  return text || "UNKNOWN";
}

function getStatusBucket(status: string) {
  if (["ON", "ACTIVE", "RUNNING"].includes(status)) return "activeMachines";
  if (["OFF", "STOP", "INACTIVE"].includes(status)) return "inactiveMachines";
  if (["LOW", "OUT", "WARNING", "FAULT", "ALERT"].includes(status)) return "warningMachines";
  return "unknownMachines";
}

function getMachineGroup(machineName: string) {
  const match = machineName.match(/^[A-Z]+/i);
  return match ? match[0].toUpperCase() : "OTHER";
}

function getShiftWindow(date: string, shift: ShiftFilter) {
  const now = new Date();
  const isToday = now.toISOString().slice(0, 10) === date;
  const startOfDay = new Date(`${date}T00:00:00`).getTime();
  const endOfDay = new Date(`${date}T23:59:59`).getTime();

  if (shift === "morning") {
    const start = new Date(`${date}T08:00:00`).getTime();
    const end = new Date(`${date}T20:00:00`).getTime();
    const effectiveEnd = isToday ? Math.min(end, now.getTime()) : end;
    return {
      start,
      end: effectiveEnd,
      durationMinutes: Math.max(0, (effectiveEnd - start) / 60000),
      label: "Morning Shift"
    };
  }

  if (shift === "night") {
    const nextDate = addDays(date, 1);
    const start = new Date(`${date}T20:00:00`).getTime();
    const end = new Date(`${nextDate}T08:00:00`).getTime();
    const effectiveEnd = now.getTime() >= start ? Math.min(end, now.getTime()) : end;
    return {
      start,
      end: effectiveEnd,
      durationMinutes: Math.max(0, (effectiveEnd - start) / 60000),
      label: "Night Shift"
    };
  }

  const effectiveEnd = isToday ? Math.min(endOfDay, now.getTime()) : endOfDay;
  return {
    start: startOfDay,
    end: effectiveEnd,
    durationMinutes: Math.max(0, (effectiveEnd - startOfDay) / 60000),
    label: "Full Day"
  };
}

function formatIsoLocal(timestampMs: number) {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getEstimatedCadenceSeconds(rows: ParsedRow[]) {
  const deltas = rows
    .slice(1)
    .map((row, index) => row.timestampMs - rows[index].timestampMs)
    .filter((delta) => delta > 0 && delta < 5 * 60 * 1000)
    .map((delta) => Math.round(delta / 1000))
    .sort((a, b) => a - b);

  if (deltas.length === 0) return DEFAULT_SAMPLE_SECONDS;

  const middle = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0
    ? Math.round((deltas[middle - 1] + deltas[middle]) / 2)
    : deltas[middle];
}

function toNumericReading(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeCurrentReading(value: number | null) {
  if (value === null) return null;
  if (value > MAX_VALID_CURRENT) return null;
  return value;
}

async function getParsedRowsForDate(date: string) {
  return getParsedRowsForDates([date]);
}

async function getParsedRowsForDates(dates: string[]) {
  const pool = await getPool();
  const uniqueDates = Array.from(new Set(dates));
  const likeClauses = uniqueDates.map(() => "payload_text LIKE ?").join(" OR ");
  const params = uniqueDates.map((dateValue) => `%"TS":"${dateValue}T%`);

  const [rows] = await pool.query<GenericRow[]>(
    `
      SELECT topic, payload_json, payload_text, received_at
      FROM mqtt_messages
      WHERE ${likeClauses}
      ORDER BY received_at ASC
    `,
    params
  );

  return rows
    .map((row) => {
      const payload = parsePayloadJson(row.payload_json ?? row.payload_text);
      if (!payload?.TS) return null;

      const timestampMs = new Date(String(payload.TS)).getTime();
      if (!Number.isFinite(timestampMs)) return null;

      return {
        topic: String(row.topic ?? "-"),
        payload,
        timestampMs
      };
    })
    .filter((row): row is ParsedRow => row !== null);
}

function buildDashboard(rows: ParsedRow[], date: string, shift: ShiftFilter): LiveStatusDashboard {
  const window = getShiftWindow(date, shift);
  const rowsInWindow = rows.filter((row) => row.timestampMs >= window.start && row.timestampMs <= window.end);

  const rowsByDevice = new Map<string, ParsedRow[]>();
  for (const row of rowsInWindow) {
    const deviceId = String(row.payload.ID ?? row.topic);
    const current = rowsByDevice.get(deviceId) ?? [];
    current.push(row);
    rowsByDevice.set(deviceId, current);
  }

  const machineCards: LiveStatusMachine[] = [];
  const devices: LiveStatusDeviceSummary[] = [];

  for (const [deviceId, deviceRows] of rowsByDevice.entries()) {
    deviceRows.sort((a, b) => a.timestampMs - b.timestampMs);
    const cadenceSeconds = getEstimatedCadenceSeconds(deviceRows);
    const latestRow = deviceRows[deviceRows.length - 1];
    const latestStatusMap = latestRow.payload.status ?? {};

    const snapshotsByMachine = new Map<string, MachineSnapshot[]>();
    for (const row of deviceRows) {
      const statusMap = row.payload.status ?? {};
      for (const [machineName, rawStatus] of Object.entries(statusMap)) {
        const current = snapshotsByMachine.get(machineName) ?? [];
        current.push({
          timestampMs: row.timestampMs,
          reading: sanitizeCurrentReading(toNumericReading(row.payload[machineName])),
          status: formatStatus(rawStatus)
        });
        snapshotsByMachine.set(machineName, current);
      }
    }

    const deviceSummary: LiveStatusDeviceSummary = {
      deviceId,
      topic: latestRow.topic,
      location: String(latestRow.payload.Location ?? "-"),
      signal: toNumericReading(latestRow.payload.Signal),
      activeMachines: 0,
      inactiveMachines: 0,
      warningMachines: 0,
      unknownMachines: 0,
      lastSeen: String(latestRow.payload.TS ?? "-")
    };

    for (const [machineName, snapshots] of snapshotsByMachine.entries()) {
      const latestSnapshot = snapshots[snapshots.length - 1];
      const onCount = snapshots.filter((snapshot) => snapshot.status === "ON").length;
      const workCount = snapshots.length;
      const validReadings = snapshots
        .filter((snapshot) => snapshot.status === "ON")
        .map((snapshot) => snapshot.reading)
        .filter((reading): reading is number => reading !== null && Number.isFinite(reading));
      const runtimeMinutes = Number(((onCount * cadenceSeconds) / 60).toFixed(1));
      const worktimeMinutes = Number(((workCount * cadenceSeconds) / 60).toFixed(1));
      const runtimePercent =
        worktimeMinutes > 0
          ? Math.min(100, Number(((runtimeMinutes / worktimeMinutes) * 100).toFixed(1)))
          : 0;
      const status = formatStatus(latestStatusMap[machineName] ?? latestSnapshot.status);
      const averageCurrent =
        validReadings.length > 0
          ? Number(
              (
                validReadings.reduce((total, reading) => total + reading, 0) / validReadings.length
              ).toFixed(2)
            )
          : null;

      deviceSummary[getStatusBucket(status)] += 1;

      machineCards.push({
        deviceId,
        topic: latestRow.topic,
        location: String(latestRow.payload.Location ?? "-"),
        signal: toNumericReading(latestRow.payload.Signal),
        machineName,
        group: getMachineGroup(machineName),
        status,
        currentStatus: status,
        averageCurrent,
        runtimeMinutes,
        worktimeMinutes,
        runtimePercent,
        lastSeen: String(latestRow.payload.TS ?? "-")
      });
    }

    devices.push(deviceSummary);
  }

  machineCards.sort((a, b) => {
    const groupDiff = a.group.localeCompare(b.group);
    if (groupDiff !== 0) return groupDiff;
    return a.machineName.localeCompare(b.machineName, undefined, { numeric: true });
  });

  const summary = machineCards.reduce(
    (acc, machine) => {
      acc.totalMachines += 1;
      acc.runtimeMinutes += machine.runtimeMinutes;
      const bucket = getStatusBucket(machine.status);
      acc[bucket] += 1;
      return acc;
    },
    {
      totalDevices: devices.length,
      totalMachines: 0,
      activeMachines: 0,
      inactiveMachines: 0,
      warningMachines: 0,
      unknownMachines: 0,
      runtimeMinutes: 0
    }
  );

  summary.runtimeMinutes = Number(summary.runtimeMinutes.toFixed(1));

  return {
    tableName: "mqtt_messages",
    selectedDate: date,
    selectedShift: shift,
    shiftWindowLabel: window.label,
    shiftDurationMinutes: Number(window.durationMinutes.toFixed(1)),
    devices,
    machines: machineCards,
    summary,
    inspectedAt: new Date().toISOString()
  };
}

export async function getLiveStatusDashboard(
  options: DashboardOptions = {}
): Promise<LiveStatusDashboard> {
  const selectedDate = getSelectedDate(options.date);
  const selectedShift = getShiftFilter(options.shift);
  const parsedRows = await getParsedRowsForDates(
    selectedShift === "night" ? [selectedDate, addDays(selectedDate, 1)] : [selectedDate]
  );

  return buildDashboard(parsedRows, selectedDate, selectedShift);
}

export async function getMachineDetails(options: {
  date?: string;
  shift?: ShiftFilter;
  deviceId: string;
  machineName: string;
}): Promise<MachineDetails> {
  const selectedDate = getSelectedDate(options.date);
  const selectedShift = getShiftFilter(options.shift);
  const parsedRows = await getParsedRowsForDates(
    selectedShift === "night" ? [selectedDate, addDays(selectedDate, 1)] : [selectedDate]
  );
  const window = getShiftWindow(selectedDate, selectedShift);

  const deviceRows = parsedRows
    .filter((row) => String(row.payload.ID ?? row.topic) === options.deviceId)
    .filter((row) => row.timestampMs >= window.start && row.timestampMs <= window.end)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const cadenceSeconds = getEstimatedCadenceSeconds(deviceRows);
  const currentSeries: CurrentPoint[] = deviceRows.map((row) => ({
    time: formatIsoLocal(row.timestampMs),
    value: sanitizeCurrentReading(toNumericReading(row.payload[options.machineName])),
    status: formatStatus(row.payload.status?.[options.machineName])
  }));

  const offPeriods: OffPeriod[] = [];
  let activeOffStart: number | null = null;
  let activeOffLast: number | null = null;

  for (const point of currentSeries) {
    const pointMs = new Date(point.time.replace(" ", "T")).getTime();
    if (point.status === "OFF") {
      if (activeOffStart === null) {
        activeOffStart = pointMs;
      }
      activeOffLast = pointMs;
      continue;
    }

    if (activeOffStart !== null && activeOffLast !== null) {
      const endMs = activeOffLast + cadenceSeconds * 1000;
      offPeriods.push({
        startTime: formatIsoLocal(activeOffStart),
        endTime: formatIsoLocal(endMs),
        durationMinutes: Number(((endMs - activeOffStart) / 60000).toFixed(1))
      });
      activeOffStart = null;
      activeOffLast = null;
    }
  }

  if (activeOffStart !== null && activeOffLast !== null) {
    const endMs = activeOffLast + cadenceSeconds * 1000;
    offPeriods.push({
      startTime: formatIsoLocal(activeOffStart),
      endTime: formatIsoLocal(endMs),
      durationMinutes: Number(((endMs - activeOffStart) / 60000).toFixed(1))
    });
  }

  return {
    deviceId: options.deviceId,
    machineName: options.machineName,
    selectedDate,
    selectedShift,
    offPeriods,
    currentSeries
  };
}
