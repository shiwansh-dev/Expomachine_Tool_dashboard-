import mqtt, { type IClientOptions, type MqttClient, type IPublishPacket } from "mqtt";
import type { RowDataPacket } from "mysql2";
import { getMqttSettings } from "@/lib/app-settings";
import { getPool } from "@/lib/db";
import { addLog, setDbStatus, setMqttStatus } from "@/lib/status";
import { getDataTopic, getMqttSubscribeTopic } from "@/lib/topic-config";

const DEFAULT_THRESHOLD = 0.28;

type ThresholdRow = RowDataPacket & {
  field: string;
  threshold_value: number | string;
};

let thresholdCache: Record<string, number> = {};

const DB_RETRY_INTERVAL_MS = 30000;

declare global {
  // eslint-disable-next-line no-var
  var __factoryGenieMqttClient: MqttClient | undefined;
  // eslint-disable-next-line no-var
  var __factoryGenieMqttStarting: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __factoryGenieDbRetryTimer: NodeJS.Timeout | undefined;
}

function formatError(error: unknown): string {
  if (!error) return "Unknown error";

  if (error instanceof AggregateError) {
    return error.errors.map((item) => formatError(item)).join(" | ");
  }

  if (error instanceof Error) {
    const code = "code" in error ? String((error as Error & { code?: unknown }).code) : "";
    return code ? `${code}: ${error.message}` : error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function ensureMqttMessagesTable() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mqtt_messages (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      topic VARCHAR(255) NOT NULL,
      payload_text TEXT NOT NULL,
      payload_json JSON NULL,
      qos TINYINT NOT NULL DEFAULT 0,
      retain_flag TINYINT(1) NOT NULL DEFAULT 0,
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function ensureThresholdsTable() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS machine_thresholds (
      field VARCHAR(255) NOT NULL PRIMARY KEY,
      threshold_value DOUBLE NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

async function loadThresholdCache() {
  const pool = getPool();
  const [rows] = await pool.query<ThresholdRow[]>(
    "SELECT field, threshold_value FROM machine_thresholds"
  );

  thresholdCache = Object.fromEntries(
    rows.map((row) => [row.field, Number(row.threshold_value)])
  );
}

async function registerThresholdField(field: string) {
  if (typeof thresholdCache[field] === "number") {
    return;
  }

  thresholdCache[field] = DEFAULT_THRESHOLD;

  const pool = getPool();
  await pool.query(
    `
      INSERT IGNORE INTO machine_thresholds (field, threshold_value)
      VALUES (?, ?)
    `,
    [field, DEFAULT_THRESHOLD]
  );
}

async function initializeDatabase() {
  await ensureMqttMessagesTable();
  await ensureThresholdsTable();
  await loadThresholdCache();
  setDbStatus(true, "mysql");
}

function scheduleDatabaseRetry() {
  if (global.__factoryGenieDbRetryTimer) {
    return;
  }

  global.__factoryGenieDbRetryTimer = setInterval(async () => {
    try {
      await initializeDatabase();
      clearInterval(global.__factoryGenieDbRetryTimer);
      global.__factoryGenieDbRetryTimer = undefined;
      addLog({ type: "db-reconnect", savedToDb: false });
    } catch (error) {
      setDbStatus(false, "mysql", formatError(error));
      addLog({
        type: "db-retry-error",
        error: formatError(error),
        savedToDb: false
      });
    }
  }, DB_RETRY_INTERVAL_MS);
}

async function initializeDatabaseWithRetry() {
  try {
    await initializeDatabase();
  } catch (error) {
    setDbStatus(false, "mysql", formatError(error));
    addLog({
      type: "db-error",
      error: formatError(error),
      savedToDb: false
    });
    scheduleDatabaseRetry();
  }
}

async function flattenMeterData(payloadJson: Record<string, unknown> | null) {
  if (!payloadJson || typeof payloadJson !== "object" || Array.isArray(payloadJson)) {
    return payloadJson;
  }

  const excludedFields = new Set(["name", "VRN", "VYN", "VBN", "DT"]);
  const statusExcludedFields = new Set(["ID", "TS", "Signal", "Status", "Location"]);
  const { data, ...rootFields } = payloadJson;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return payloadJson;
  }

  const flattened: Record<string, unknown> = Object.fromEntries(
    Object.entries(rootFields).filter(([field]) => !excludedFields.has(field))
  );

  for (const [meterKey, meterValue] of Object.entries(data as Record<string, unknown>)) {
    if (!meterValue || typeof meterValue !== "object" || Array.isArray(meterValue)) {
      flattened[`meter_${meterKey}`] = meterValue;
      continue;
    }

    for (const [field, value] of Object.entries(meterValue as Record<string, unknown>)) {
      if (excludedFields.has(field)) {
        continue;
      }

      const preferredKey = Object.prototype.hasOwnProperty.call(flattened, field)
        ? `meter_${meterKey}_${field}`
        : field;

      flattened[preferredKey] = value;
    }
  }

  const machineStatus: Record<string, "ON" | "OFF"> = {};

  for (const [field, value] of Object.entries(flattened)) {
    if (statusExcludedFields.has(field)) {
      continue;
    }

    if (typeof value !== "number" || Number.isNaN(value)) {
      continue;
    }

    await registerThresholdField(field);
    machineStatus[field] = value > (thresholdCache[field] ?? DEFAULT_THRESHOLD) ? "ON" : "OFF";
  }

  flattened.status = machineStatus;

  return flattened;
}

async function insertMessage(
  topic: string,
  payloadText: string,
  payloadJson: Record<string, unknown> | null,
  packet: IPublishPacket
) {
  const pool = getPool();

  await pool.query(
    `
      INSERT INTO mqtt_messages (topic, payload_text, payload_json, qos, retain_flag)
      VALUES (?, ?, ?, ?, ?)
    `,
    [
      topic,
      payloadText,
      payloadJson ? JSON.stringify(payloadJson) : null,
      packet.qos ?? 0,
      packet.retain ? 1 : 0
    ]
  );
}

async function saveMessage(topic: string, messageBuffer: Buffer, packet: IPublishPacket) {
  const dataTopic = await getDataTopic();
  if (topic !== dataTopic) {
    addLog({
      topic,
      ignored: true,
      reason: `Only ${dataTopic} is saved`,
      savedToDb: false
    });
    return;
  }

  const rawPayloadText = messageBuffer.toString("utf8");
  const parsedPayloadJson = tryParseJson(rawPayloadText);
  const payloadJson = await flattenMeterData(parsedPayloadJson);
  const payloadText = payloadJson ? JSON.stringify(payloadJson) : rawPayloadText;

  addLog({
    topic,
    payload: payloadText,
    savedToDb: true
  });

  await insertMessage(topic, payloadText, payloadJson, packet);
}

export async function startMqttIngestion() {
  if (global.__factoryGenieMqttClient || global.__factoryGenieMqttStarting) {
    return global.__factoryGenieMqttStarting;
  }

  global.__factoryGenieMqttStarting = startMqttIngestionInternal().finally(() => {
    global.__factoryGenieMqttStarting = undefined;
  });

  return global.__factoryGenieMqttStarting;
}

export async function restartMqttIngestion() {
  if (global.__factoryGenieMqttClient) {
    global.__factoryGenieMqttClient.end(true);
    global.__factoryGenieMqttClient = undefined;
  }

  global.__factoryGenieMqttStarting = undefined;
  setMqttStatus(false, "restart");
  return startMqttIngestion();
}

async function startMqttIngestionInternal() {
  await initializeDatabaseWithRetry();

  const settings = await getMqttSettings();
  const brokerUrl = settings.mqttBrokerUrl;
  const topic = await getMqttSubscribeTopic();
  const clientId = `${settings.mqttClientId}-${process.pid}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;

  const options: IClientOptions = {
    clientId,
    username: settings.mqttUsername || undefined,
    password: settings.mqttPassword || undefined,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    resubscribe: true
  };

  const client = mqtt.connect(brokerUrl, options);
  global.__factoryGenieMqttClient = client;

  addLog({
    type: "mqtt-connect-start",
    brokerUrl,
    topic,
    clientId,
    savedToDb: false
  });

  client.on("connect", () => {
    setMqttStatus(true, "connect");
    addLog({ type: "mqtt-connect", topic, clientId, savedToDb: false });

    client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) {
        const message = formatError(error);
        setMqttStatus(false, `subscribe-error: ${message}`);
        addLog({ type: "mqtt-subscribe-error", error: message, topic, savedToDb: false });
        return;
      }

      addLog({ type: "mqtt-subscribe", topic, savedToDb: false });
    });
  });

  client.on("message", async (messageTopic, message, packet) => {
    try {
      await saveMessage(messageTopic, message, packet);
    } catch (error) {
      const messageText = formatError(error);
      setDbStatus(false, "mysql", messageText);
      addLog({
        type: "mqtt-save-error",
        topic: messageTopic,
        error: messageText,
        savedToDb: false
      });
    }
  });

  client.on("reconnect", () => {
    setMqttStatus(false, "reconnect");
  });

  client.on("close", () => {
    setMqttStatus(false, "close");
  });

  client.on("offline", () => {
    setMqttStatus(false, "offline");
  });

  client.on("error", (error) => {
    setMqttStatus(false, `error: ${formatError(error)}`);
    addLog({ type: "mqtt-error", error: formatError(error), savedToDb: false });
  });
}
