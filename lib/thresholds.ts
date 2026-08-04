import fs from "fs";
import path from "path";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";

const THRESHOLDS_FILE = path.join(process.cwd(), "thresholds.json");

export const DEFAULT_THRESHOLD = 0.28;

type Thresholds = Record<string, number>;
type ThresholdRow = RowDataPacket & {
  field: string;
  threshold_value: number | string;
};

let thresholds: Thresholds = {};
let initialized = false;

function loadFromFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, "utf8")) as Record<string, unknown>;
    thresholds = Object.fromEntries(
      Object.entries(parsed)
        .map(([field, value]) => [field, Number(value)])
        .filter(([, value]) => Number.isFinite(value))
    );
  } catch {
    thresholds = {};
  }
}

function persistToFile() {
  fs.writeFileSync(THRESHOLDS_FILE, JSON.stringify(thresholds, null, 2));
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

async function getAllThresholdsFromDb() {
  const pool = getPool();
  const [rows] = await pool.query<ThresholdRow[]>(
    "SELECT field, threshold_value FROM machine_thresholds ORDER BY field ASC"
  );

  return Object.fromEntries(rows.map((row) => [row.field, Number(row.threshold_value)]));
}

async function upsertThreshold(field: string, value: number) {
  const pool = getPool();

  await pool.query(
    `
      INSERT INTO machine_thresholds (field, threshold_value)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE threshold_value = VALUES(threshold_value)
    `,
    [field, value]
  );
}

async function upsertThresholds(updates: Thresholds) {
  const entries = Object.entries(updates);
  if (entries.length === 0) return;

  const pool = getPool();
  await pool.query(
    `
      INSERT INTO machine_thresholds (field, threshold_value)
      VALUES ?
      ON DUPLICATE KEY UPDATE threshold_value = VALUES(threshold_value)
    `,
    [entries]
  );
}

async function initialize() {
  if (initialized) return;

  loadFromFile();

  try {
    await ensureThresholdsTable();
    const dbThresholds = await getAllThresholdsFromDb();
    const fileOnly = Object.fromEntries(
      Object.entries(thresholds).filter(([field]) => !(field in dbThresholds))
    );

    thresholds = { ...thresholds, ...dbThresholds };

    if (Object.keys(fileOnly).length > 0) {
      await upsertThresholds(fileOnly);
    }
  } catch (error) {
    console.error(
      "Failed to initialize threshold database store, using local file fallback:",
      error instanceof Error ? error.message : error
    );
  }

  initialized = true;
}

async function persistField(field: string) {
  try {
    await upsertThreshold(field, thresholds[field]);
    return;
  } catch (error) {
    console.error(
      `Failed to persist threshold for "${field}" to database:`,
      error instanceof Error ? error.message : error
    );
  }

  persistToFile();
}

async function persistFields(fields: string[]) {
  try {
    await upsertThresholds(Object.fromEntries(fields.map((field) => [field, thresholds[field]])));
    return;
  } catch (error) {
    console.error(
      "Failed to persist thresholds to database:",
      error instanceof Error ? error.message : error
    );
  }

  persistToFile();
}

export async function getThreshold(field: string) {
  await initialize();
  return typeof thresholds[field] === "number" ? thresholds[field] : DEFAULT_THRESHOLD;
}

export function getCachedThreshold(field: string) {
  return typeof thresholds[field] === "number" ? thresholds[field] : DEFAULT_THRESHOLD;
}

export async function getAll() {
  await initialize();
  return { ...thresholds };
}

export async function registerField(field: string) {
  await initialize();

  if (!(field in thresholds)) {
    thresholds[field] = DEFAULT_THRESHOLD;
    await persistField(field);
  }
}

export async function setThreshold(field: string, value: number) {
  await initialize();
  thresholds[field] = value;
  await persistField(field);
}

export async function setMany(updates: Thresholds) {
  await initialize();
  Object.assign(thresholds, updates);
  await persistFields(Object.keys(updates));
}

export async function resetField(field: string) {
  await initialize();
  thresholds[field] = DEFAULT_THRESHOLD;
  await persistField(field);
}
