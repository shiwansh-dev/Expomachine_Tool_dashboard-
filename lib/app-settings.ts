import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

const DASHBOARD_TITLE_KEY = "dashboard_title";
const DEFAULT_DASHBOARD_TITLE = "EXPO MACHINE & TOOL";
const DEFAULT_MQTT_BROKER_URL = "mqtt://mqtt.tranceedtechnology.com:1883";
const DEFAULT_MQTT_TOPIC = "TN-862360079075367/data";
const DEFAULT_MQTT_CLIENT_ID = "factory-genie-dashboard";

export type MqttSettings = {
  mqttBrokerUrl: string;
  mqttTopic: string;
  dataTopic: string;
  mqttClientId: string;
  mqttUsername: string;
  mqttPassword: string;
};

type SettingRow = RowDataPacket & {
  setting_value: string;
};

async function ensureSettingsTable() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(191) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function getSetting(key: string, fallback = "") {
  await ensureSettingsTable();

  const pool = getPool();
  const [rows] = await pool.query<SettingRow[]>(
    "SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1",
    [key]
  );

  return rows[0]?.setting_value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await ensureSettingsTable();

  const pool = getPool();
  await pool.query(
    `
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `,
    [key, value]
  );
}

export async function getSettings(keys: Record<string, string>) {
  await ensureSettingsTable();

  const pool = getPool();
  const keyNames = Object.keys(keys);
  if (keyNames.length === 0) return {};

  const [rows] = await pool.query<(SettingRow & { setting_key: string })[]>(
    "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?)",
    [keyNames]
  );
  const values = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));

  return Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [key, values[key] ?? fallback])
  );
}

export async function setSettings(values: Record<string, string>) {
  await ensureSettingsTable();

  const entries = Object.entries(values);
  if (entries.length === 0) return;

  const pool = getPool();
  await pool.query(
    `
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES ?
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `,
    [entries]
  );
}

export async function getDashboardTitle() {
  return getSetting(DASHBOARD_TITLE_KEY, DEFAULT_DASHBOARD_TITLE);
}

export async function setDashboardTitle(value: string) {
  const title = value.trim() || DEFAULT_DASHBOARD_TITLE;
  await setSetting(DASHBOARD_TITLE_KEY, title);
  return title;
}

export async function getMqttSettings(): Promise<MqttSettings> {
  const settings = await getSettings({
    mqtt_broker_url: DEFAULT_MQTT_BROKER_URL,
    mqtt_topic: DEFAULT_MQTT_TOPIC,
    data_topic: DEFAULT_MQTT_TOPIC,
    mqtt_client_id: DEFAULT_MQTT_CLIENT_ID,
    mqtt_username: "",
    mqtt_password: ""
  });

  return {
    mqttBrokerUrl: String(settings.mqtt_broker_url),
    mqttTopic: String(settings.mqtt_topic),
    dataTopic: String(settings.data_topic),
    mqttClientId: String(settings.mqtt_client_id),
    mqttUsername: String(settings.mqtt_username),
    mqttPassword: String(settings.mqtt_password)
  };
}

export async function setMqttSettings(values: MqttSettings) {
  const mqttBrokerUrl = values.mqttBrokerUrl.trim() || DEFAULT_MQTT_BROKER_URL;
  const mqttTopic = values.mqttTopic.trim() || DEFAULT_MQTT_TOPIC;
  const dataTopic = values.dataTopic.trim() || mqttTopic;
  const mqttClientId = values.mqttClientId.trim() || DEFAULT_MQTT_CLIENT_ID;

  await setSettings({
    mqtt_broker_url: mqttBrokerUrl,
    mqtt_topic: mqttTopic,
    data_topic: dataTopic,
    mqtt_client_id: mqttClientId,
    mqtt_username: values.mqttUsername.trim(),
    mqtt_password: values.mqttPassword
  });

  return getMqttSettings();
}
