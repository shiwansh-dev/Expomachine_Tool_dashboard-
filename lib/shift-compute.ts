import {
  buildAllShiftsDashboard,
  buildDashboard,
  getParsedRowsForDateBatched,
  type LiveStatusDashboard,
  type ShiftComputeBatchInfo
} from "@/lib/live-status";
import {
  ensureShiftSummaryTable,
  getRecentShiftSummaries as getRecentShiftSummariesFromStore,
  getShiftSummaryPayload as getShiftSummaryPayloadFromStore,
  markShiftSummaryError,
  toMysqlDatetime,
  upsertShiftSummarySuccess,
  type ShiftSummaryPayload,
  type ShiftSummaryRecent
} from "@/lib/shift-summary-store";

export type { ShiftSummaryPayload, ShiftSummaryRecent } from "@/lib/shift-summary-store";

const COMPUTE_INTERVAL_MS = 10 * 60 * 1000;
const INITIAL_RUN_DELAY_MS = 5000;
const HISTORY_LIMIT = 10;

type RunRecord = {
  date: string;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  error: string | null;
  rowCount: number;
  durationMs: number;
};

type ShiftComputeState = {
  running: boolean;
  currentDate: string | null;
  phase: "idle" | "fetching" | "computing" | "saving";
  batchIndex: number;
  totalBatches: number;
  processedRows: number;
  totalRows: number;
  startedAt: string | null;
  lastRun: RunRecord | null;
  history: RunRecord[];
};

declare global {
  // eslint-disable-next-line no-var
  var __factoryGenieShiftComputeState: ShiftComputeState | undefined;
  // eslint-disable-next-line no-var
  var __factoryGenieShiftComputeTimer: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __factoryGenieShiftComputeStarted: boolean | undefined;
}

function getState(): ShiftComputeState {
  if (!global.__factoryGenieShiftComputeState) {
    global.__factoryGenieShiftComputeState = {
      running: false,
      currentDate: null,
      phase: "idle",
      batchIndex: 0,
      totalBatches: 0,
      processedRows: 0,
      totalRows: 0,
      startedAt: null,
      lastRun: null,
      history: []
    };
  }

  return global.__factoryGenieShiftComputeState;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getUtcDateString(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

async function computeAndStoreForDate(date: string) {
  const state = getState();
  const startedAt = new Date().toISOString();

  state.running = true;
  state.currentDate = date;
  state.phase = "fetching";
  state.batchIndex = 0;
  state.totalBatches = 0;
  state.processedRows = 0;
  state.totalRows = 0;
  state.startedAt = startedAt;

  const startedAtMs = Date.now();

  try {
    await ensureShiftSummaryTable();

    const rows = await getParsedRowsForDateBatched(date, (info: ShiftComputeBatchInfo) => {
      state.batchIndex = info.batchIndex;
      state.totalBatches = info.totalBatches;
      state.processedRows = info.processedRows;
      state.totalRows = info.totalRows;
    });

    state.phase = "computing";

    const all: LiveStatusDashboard = buildAllShiftsDashboard(rows, date);
    const morning = buildDashboard(rows, date, "morning");
    const night = buildDashboard(rows, date, "night");

    state.phase = "saving";

    const latestSourceAt = rows.length > 0 ? toMysqlDatetime(rows[rows.length - 1].timestampMs) : null;
    const durationMs = Date.now() - startedAtMs;

    await upsertShiftSummarySuccess({
      date,
      all,
      morning,
      night,
      rowCount: rows.length,
      latestSourceAt,
      durationMs
    });

    const finishedAt = new Date().toISOString();
    const record: RunRecord = {
      date,
      startedAt,
      finishedAt,
      success: true,
      error: null,
      rowCount: rows.length,
      durationMs
    };

    state.lastRun = record;
    state.history = [record, ...state.history].slice(0, HISTORY_LIMIT);
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    const message = formatError(error);
    const finishedAt = new Date().toISOString();

    try {
      await markShiftSummaryError(date, durationMs, message);
    } catch {
      // If we can't persist the error, in-memory state below still reflects it.
    }

    const record: RunRecord = {
      date,
      startedAt,
      finishedAt,
      success: false,
      error: message,
      rowCount: state.processedRows,
      durationMs
    };

    state.lastRun = record;
    state.history = [record, ...state.history].slice(0, HISTORY_LIMIT);

    throw error;
  } finally {
    state.running = false;
    state.currentDate = null;
    state.phase = "idle";
  }
}

export async function runShiftComputeCycle() {
  const state = getState();
  if (state.running) return;

  await ensureShiftSummaryTable();

  const today = getUtcDateString(0);
  const yesterday = getUtcDateString(-1);

  await computeAndStoreForDate(today).catch(() => {
    // Error already recorded in state/DB above.
  });

  await computeAndStoreForDate(yesterday).catch(() => {
    // Error already recorded in state/DB above.
  });
}

export async function computeShiftDataNow(date?: string) {
  const state = getState();
  if (state.running) {
    throw new Error("A shift computation is already running");
  }

  await ensureShiftSummaryTable();
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getUtcDateString(0);
  await computeAndStoreForDate(targetDate);
}

export function startShiftComputeWorker() {
  if (global.__factoryGenieShiftComputeStarted) return;
  global.__factoryGenieShiftComputeStarted = true;

  setTimeout(() => {
    runShiftComputeCycle().catch(() => {
      // Errors are captured in state/DB.
    });
  }, INITIAL_RUN_DELAY_MS);

  if (!global.__factoryGenieShiftComputeTimer) {
    global.__factoryGenieShiftComputeTimer = setInterval(() => {
      runShiftComputeCycle().catch(() => {
        // Errors are captured in state/DB.
      });
    }, COMPUTE_INTERVAL_MS);
  }
}

export type ShiftComputeProgress = {
  running: boolean;
  currentDate: string | null;
  phase: ShiftComputeState["phase"];
  batchIndex: number;
  totalBatches: number;
  processedRows: number;
  totalRows: number;
  startedAt: string | null;
  lastRun: RunRecord | null;
  history: RunRecord[];
};

export function getShiftComputeProgress(): ShiftComputeProgress {
  const state = getState();
  return {
    running: state.running,
    currentDate: state.currentDate,
    phase: state.phase,
    batchIndex: state.batchIndex,
    totalBatches: state.totalBatches,
    processedRows: state.processedRows,
    totalRows: state.totalRows,
    startedAt: state.startedAt,
    lastRun: state.lastRun,
    history: state.history
  };
}

export async function getRecentShiftSummaries(): Promise<ShiftSummaryRecent[]> {
  return getRecentShiftSummariesFromStore();
}

export async function getShiftSummaryPayload(date: string): Promise<ShiftSummaryPayload | null> {
  return getShiftSummaryPayloadFromStore(date);
}
