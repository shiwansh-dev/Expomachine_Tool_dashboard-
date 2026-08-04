import { getPool } from "@/lib/db";

const MAX_LOGS = 200;

type StatusState = {
  mqtt: {
    connected: boolean;
    lastEvent: string | null;
    lastEventAt: string | null;
  };
  db: {
    enabled: boolean;
    mode: string | null;
    lastError: string | null;
  };
};

export type StatusLogEntry = Record<string, unknown> & {
  receivedAt?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __factoryGenieStatusState: StatusState | undefined;
  // eslint-disable-next-line no-var
  var __factoryGenieStatusLogs: StatusLogEntry[] | undefined;
}

function getState() {
  if (!global.__factoryGenieStatusState) {
    global.__factoryGenieStatusState = {
      mqtt: {
        connected: false,
        lastEvent: null,
        lastEventAt: null
      },
      db: {
        enabled: false,
        mode: null,
        lastError: null
      }
    };
  }

  return global.__factoryGenieStatusState;
}

function getLogStore() {
  if (!global.__factoryGenieStatusLogs) {
    global.__factoryGenieStatusLogs = [];
  }

  return global.__factoryGenieStatusLogs;
}

export function setMqttStatus(connected: boolean, event: string) {
  const state = getState();
  state.mqtt.connected = connected;
  state.mqtt.lastEvent = event;
  state.mqtt.lastEventAt = new Date().toISOString();
}

export function setDbStatus(enabled: boolean, mode?: string | null, error?: string | null) {
  const state = getState();
  state.db.enabled = enabled;
  state.db.mode = mode || null;
  state.db.lastError = error || null;
}

export function getStatus() {
  const state = getState();

  return {
    mqtt: { ...state.mqtt },
    db: { ...state.db }
  };
}

export async function getRuntimeStatus() {
  const current = getStatus();

  try {
    const pool = getPool();
    await pool.query("SELECT 1");

    return {
      ...current,
      db: {
        enabled: true,
        mode: "mysql",
        lastError: null
      }
    };
  } catch (error) {
    return {
      ...current,
      db: {
        enabled: false,
        mode: "mysql",
        lastError: error instanceof Error ? error.message : "Unable to connect to database"
      }
    };
  }
}

export function addLog(entry: StatusLogEntry) {
  const logs = getLogStore();
  logs.unshift({ ...entry, receivedAt: new Date().toISOString() });

  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
}

export function getLogs(limit = MAX_LOGS) {
  const logs = getLogStore();
  return logs.slice(0, limit);
}
