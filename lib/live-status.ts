import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { getDataTopic } from "@/lib/topic-config";
import { getShiftSummaryPayload } from "@/lib/shift-summary-store";

export type ShiftFilter = "all" | "morning" | "night";

type GenericRow = RowDataPacket & Record<string, unknown>;

type ThresholdRow = RowDataPacket & {
  threshold_value: number | string;
};

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
  shift: ShiftFilter;
  shiftLabel: string;
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
  thresholdValue: number | null;
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
const DEFAULT_THRESHOLD = 0.28;

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
    const start = new Date(`${date}T20:00:01`).getTime();
    const end = endOfDay;
    const effectiveEnd = isToday ? Math.min(end, now.getTime()) : end;
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

function parseRawRow(row: GenericRow): ParsedRow | null {
  const payload = parsePayloadJson(row.payload_json ?? row.payload_text);
  if (!payload?.TS) return null;

  const timestampMs = new Date(String(payload.TS)).getTime();
  if (!Number.isFinite(timestampMs)) return null;

  return {
    topic: String(row.topic ?? "-"),
    payload,
    timestampMs
  };
}

async function getParsedRowsForDate(date: string) {
  const pool = getPool();
  const dayPrefix = `${date}T`;
  const topic = await getDataTopic();

  const [rows] = await pool.query<GenericRow[]>(
    `
      SELECT topic, payload_json, payload_text, received_at
      FROM mqtt_messages
      WHERE topic = ?
        AND payload_text LIKE ?
      ORDER BY received_at ASC
    `,
    [topic, `%"TS":"${dayPrefix}%`]
  );

  return rows.map(parseRawRow).filter((row): row is ParsedRow => row !== null);
}

export type ShiftComputeBatchInfo = {
  batchIndex: number;
  totalBatches: number;
  processedRows: number;
  totalRows: number;
};

const SHIFT_COMPUTE_BATCH_SIZE = 2000;

export async function getParsedRowsForDateBatched(
  date: string,
  onBatch?: (info: ShiftComputeBatchInfo) => void
): Promise<ParsedRow[]> {
  const pool = getPool();
  const dayPrefix = `${date}T`;
  const topic = await getDataTopic();
  const likePattern = `%"TS":"${dayPrefix}%`;

  const [countRows] = await pool.query<(GenericRow & { total: number })[]>(
    `
      SELECT COUNT(*) AS total
      FROM mqtt_messages
      WHERE topic = ?
        AND payload_text LIKE ?
    `,
    [topic, likePattern]
  );

  const totalRows = Number(countRows[0]?.total ?? 0);
  const totalBatches = totalRows === 0 ? 0 : Math.ceil(totalRows / SHIFT_COMPUTE_BATCH_SIZE);

  const result: ParsedRow[] = [];
  let lastId = 0;
  let batchIndex = 0;

  onBatch?.({ batchIndex: 0, totalBatches, processedRows: 0, totalRows });

  while (true) {
    const [rows] = await pool.query<(GenericRow & { id: number })[]>(
      `
        SELECT id, topic, payload_json, payload_text, received_at
        FROM mqtt_messages
        WHERE topic = ?
          AND payload_text LIKE ?
          AND id > ?
        ORDER BY id ASC
        LIMIT ?
      `,
      [topic, likePattern, lastId, SHIFT_COMPUTE_BATCH_SIZE]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const parsed = parseRawRow(row);
      if (parsed) result.push(parsed);
    }

    lastId = Number(rows[rows.length - 1].id);
    batchIndex += 1;

    onBatch?.({ batchIndex, totalBatches, processedRows: result.length, totalRows });

    if (rows.length < SHIFT_COMPUTE_BATCH_SIZE) break;
  }

  result.sort((a, b) => a.timestampMs - b.timestampMs);
  return result;
}

async function getMachineThreshold(machineName: string) {
  const pool = getPool();
  const [rows] = await pool.query<ThresholdRow[]>(
    "SELECT threshold_value FROM machine_thresholds WHERE field = ? LIMIT 1",
    [machineName]
  );

  if (!rows[0]) return DEFAULT_THRESHOLD;

  const value = Number(rows[0].threshold_value);
  return Number.isFinite(value) ? value : DEFAULT_THRESHOLD;
}

export function buildDashboard(rows: ParsedRow[], date: string, shift: ShiftFilter): LiveStatusDashboard {
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
        shift,
        shiftLabel: window.label,
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

export function buildAllShiftsDashboard(rows: ParsedRow[], date: string): LiveStatusDashboard {
  const morningDashboard = buildDashboard(rows, date, "morning");
  const nightDashboard = buildDashboard(rows, date, "night");
  const machines = [...morningDashboard.machines, ...nightDashboard.machines];

  const devicesById = new Map<string, LiveStatusDeviceSummary>();
  for (const device of [...morningDashboard.devices, ...nightDashboard.devices]) {
    const current = devicesById.get(device.deviceId);
    if (!current) {
      devicesById.set(device.deviceId, { ...device });
      continue;
    }

    current.activeMachines += device.activeMachines;
    current.inactiveMachines += device.inactiveMachines;
    current.warningMachines += device.warningMachines;
    current.unknownMachines += device.unknownMachines;

    if (String(device.lastSeen) > String(current.lastSeen)) {
      current.topic = device.topic;
      current.location = device.location;
      current.signal = device.signal;
      current.lastSeen = device.lastSeen;
    }
  }

  const summary = machines.reduce(
    (acc, machine) => {
      acc.totalMachines += 1;
      acc.runtimeMinutes += machine.runtimeMinutes;
      const bucket = getStatusBucket(machine.status);
      acc[bucket] += 1;
      return acc;
    },
    {
      totalDevices: devicesById.size,
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
    selectedShift: "all",
    shiftWindowLabel: "Morning + Night Shifts",
    shiftDurationMinutes: Number(
      (morningDashboard.shiftDurationMinutes + nightDashboard.shiftDurationMinutes).toFixed(1)
    ),
    devices: Array.from(devicesById.values()),
    machines,
    summary,
    inspectedAt: new Date().toISOString()
  };
}

const LATEST_SNAPSHOT_LIMIT = 500;

async function getLatestSnapshotRows(limit = LATEST_SNAPSHOT_LIMIT): Promise<ParsedRow[]> {
  const pool = getPool();
  const topic = await getDataTopic();

  const [rows] = await pool.query<GenericRow[]>(
    `
      SELECT topic, payload_json, payload_text, received_at
      FROM mqtt_messages
      WHERE topic = ?
      ORDER BY id DESC
      LIMIT ?
    `,
    [topic, limit]
  );

  return rows.map(parseRawRow).filter((row): row is ParsedRow => row !== null);
}

async function getLatestRowByDevice(): Promise<Map<string, ParsedRow>> {
  const rows = await getLatestSnapshotRows();
  const latestByDevice = new Map<string, ParsedRow>();

  for (const row of rows) {
    const deviceId = String(row.payload.ID ?? row.topic);
    if (!latestByDevice.has(deviceId)) {
      latestByDevice.set(deviceId, row);
    }
  }

  return latestByDevice;
}

function applyLiveStatusOverlay(
  dashboard: LiveStatusDashboard,
  latestByDevice: Map<string, ParsedRow>
): LiveStatusDashboard {
  const machines = dashboard.machines.map((machine) => {
    const latest = latestByDevice.get(machine.deviceId);
    const rawStatus = latest?.payload.status?.[machine.machineName];
    if (rawStatus === undefined) return machine;

    const status = formatStatus(rawStatus);
    return {
      ...machine,
      status,
      currentStatus: status,
      lastSeen: String(latest?.payload.TS ?? machine.lastSeen)
    };
  });

  const devices = dashboard.devices.map((device) => {
    const latest = latestByDevice.get(device.deviceId);
    return {
      ...device,
      signal: latest ? toNumericReading(latest.payload.Signal) ?? device.signal : device.signal,
      lastSeen: latest ? String(latest.payload.TS ?? device.lastSeen) : device.lastSeen,
      activeMachines: 0,
      inactiveMachines: 0,
      warningMachines: 0,
      unknownMachines: 0
    };
  });

  const devicesById = new Map(devices.map((device) => [device.deviceId, device]));

  for (const machine of machines) {
    const device = devicesById.get(machine.deviceId);
    if (device) {
      device[getStatusBucket(machine.status)] += 1;
    }
  }

  const summary = machines.reduce(
    (acc, machine) => {
      acc.runtimeMinutes += machine.runtimeMinutes;
      acc[getStatusBucket(machine.status)] += 1;
      return acc;
    },
    {
      totalDevices: devicesById.size,
      totalMachines: machines.length,
      activeMachines: 0,
      inactiveMachines: 0,
      warningMachines: 0,
      unknownMachines: 0,
      runtimeMinutes: 0
    }
  );

  summary.runtimeMinutes = Number(summary.runtimeMinutes.toFixed(1));

  return {
    ...dashboard,
    machines,
    devices: Array.from(devicesById.values()),
    summary,
    inspectedAt: new Date().toISOString()
  };
}

export async function getLiveStatusDashboard(
  options: DashboardOptions = {}
): Promise<LiveStatusDashboard> {
  const selectedDate = getSelectedDate(options.date);
  const selectedShift = getShiftFilter(options.shift);

  const cached = await getShiftSummaryPayload(selectedDate).catch(() => null);
  const cachedDashboard = cached?.dashboards[selectedShift] ?? null;

  if (!cachedDashboard) {
    const parsedRows = await getParsedRowsForDate(selectedDate);

    return selectedShift === "all"
      ? buildAllShiftsDashboard(parsedRows, selectedDate)
      : buildDashboard(parsedRows, selectedDate, selectedShift);
  }

  const latestByDevice = await getLatestRowByDevice();
  return applyLiveStatusOverlay(cachedDashboard, latestByDevice);
}

export async function getMachineDetails(options: {
  date?: string;
  shift?: ShiftFilter;
  deviceId: string;
  machineName: string;
}): Promise<MachineDetails> {
  const selectedDate = getSelectedDate(options.date);
  const selectedShift = getShiftFilter(options.shift);
  const parsedRows = await getParsedRowsForDate(selectedDate);
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
    thresholdValue: await getMachineThreshold(options.machineName),
    offPeriods,
    currentSeries
  };
}
