import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import type { LiveStatusDashboard } from "@/lib/live-status";

const RECENT_DAYS_LIMIT = 14;

type ShiftSummaryRow = RowDataPacket & {
  date_key: string | Date;
  source_row_count: number;
  latest_source_at: string | Date | null;
  computed_at: string | Date;
  duration_ms: number;
  status: string;
  last_error: string | null;
};

type ShiftSummaryPayloadRow = RowDataPacket & {
  payload_all: LiveStatusDashboard | string;
  payload_morning: LiveStatusDashboard | string;
  payload_night: LiveStatusDashboard | string;
  computed_at: string | Date;
  source_row_count: number;
  latest_source_at: string | Date | null;
  status: string;
  last_error: string | null;
};

export type ShiftSummaryRecent = {
  date: string;
  sourceRowCount: number;
  latestSourceAt: string | null;
  computedAt: string;
  durationMs: number;
  status: string;
  lastError: string | null;
};

export type ShiftSummaryPayload = {
  date: string;
  computedAt: string;
  sourceRowCount: number;
  latestSourceAt: string | null;
  status: string;
  lastError: string | null;
  dashboards: {
    all: LiveStatusDashboard | null;
    morning: LiveStatusDashboard | null;
    night: LiveStatusDashboard | null;
  };
};

export function toMysqlDatetime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toDisplayString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return toMysqlDatetime(value.getTime());
  return String(value);
}

function parseDashboardCell(value: LiveStatusDashboard | string): LiveStatusDashboard | null {
  const parsed = typeof value === "string" ? (JSON.parse(value) as LiveStatusDashboard) : value;
  if (!parsed || !Array.isArray(parsed.machines)) return null;
  return parsed;
}

export async function ensureShiftSummaryTable() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shift_summary (
      date_key DATE NOT NULL PRIMARY KEY,
      payload_all JSON NOT NULL,
      payload_morning JSON NOT NULL,
      payload_night JSON NOT NULL,
      source_row_count INT NOT NULL DEFAULT 0,
      latest_source_at DATETIME NULL,
      computed_at DATETIME NOT NULL,
      duration_ms INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'ok',
      last_error TEXT NULL
    )
  `);
}

export async function upsertShiftSummarySuccess(params: {
  date: string;
  all: LiveStatusDashboard;
  morning: LiveStatusDashboard;
  night: LiveStatusDashboard;
  rowCount: number;
  latestSourceAt: string | null;
  durationMs: number;
}) {
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO shift_summary
        (date_key, payload_all, payload_morning, payload_night, source_row_count, latest_source_at, computed_at, duration_ms, status, last_error)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 'ok', NULL)
      ON DUPLICATE KEY UPDATE
        payload_all = VALUES(payload_all),
        payload_morning = VALUES(payload_morning),
        payload_night = VALUES(payload_night),
        source_row_count = VALUES(source_row_count),
        latest_source_at = VALUES(latest_source_at),
        computed_at = VALUES(computed_at),
        duration_ms = VALUES(duration_ms),
        status = 'ok',
        last_error = NULL
    `,
    [
      params.date,
      JSON.stringify(params.all),
      JSON.stringify(params.morning),
      JSON.stringify(params.night),
      params.rowCount,
      params.latestSourceAt,
      params.durationMs
    ]
  );
}

export async function markShiftSummaryError(date: string, durationMs: number, message: string) {
  const pool = getPool();
  await pool.query(
    `
      INSERT INTO shift_summary
        (date_key, payload_all, payload_morning, payload_night, source_row_count, latest_source_at, computed_at, duration_ms, status, last_error)
      VALUES (?, JSON_OBJECT(), JSON_OBJECT(), JSON_OBJECT(), 0, NULL, NOW(), ?, 'error', ?)
      ON DUPLICATE KEY UPDATE
        computed_at = NOW(),
        duration_ms = VALUES(duration_ms),
        status = 'error',
        last_error = VALUES(last_error)
    `,
    [date, durationMs, message]
  );
}

export async function getRecentShiftSummaries(): Promise<ShiftSummaryRecent[]> {
  await ensureShiftSummaryTable();
  const pool = getPool();
  const [rows] = await pool.query<ShiftSummaryRow[]>(
    `
      SELECT date_key, source_row_count, latest_source_at, computed_at, duration_ms, status, last_error
      FROM shift_summary
      ORDER BY date_key DESC
      LIMIT ?
    `,
    [RECENT_DAYS_LIMIT]
  );

  return rows.map((row) => {
    const dateValue = row.date_key;
    const date =
      dateValue instanceof Date ? dateValue.toISOString().slice(0, 10) : String(dateValue).slice(0, 10);

    return {
      date,
      sourceRowCount: Number(row.source_row_count),
      latestSourceAt: toDisplayString(row.latest_source_at),
      computedAt: toDisplayString(row.computed_at) ?? "-",
      durationMs: Number(row.duration_ms),
      status: String(row.status),
      lastError: row.last_error ? String(row.last_error) : null
    };
  });
}

export async function getShiftSummaryPayload(date: string): Promise<ShiftSummaryPayload | null> {
  await ensureShiftSummaryTable();
  const pool = getPool();
  const [rows] = await pool.query<ShiftSummaryPayloadRow[]>(
    `
      SELECT payload_all, payload_morning, payload_night, computed_at, source_row_count, latest_source_at, status, last_error
      FROM shift_summary
      WHERE date_key = ?
      LIMIT 1
    `,
    [date]
  );

  const row = rows[0];
  if (!row) return null;

  return {
    date,
    computedAt: toDisplayString(row.computed_at) ?? "-",
    sourceRowCount: Number(row.source_row_count),
    latestSourceAt: toDisplayString(row.latest_source_at),
    status: String(row.status),
    lastError: row.last_error ? String(row.last_error) : null,
    dashboards: {
      all: parseDashboardCell(row.payload_all),
      morning: parseDashboardCell(row.payload_morning),
      night: parseDashboardCell(row.payload_night)
    }
  };
}
