import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import mysql from "mysql2/promise";

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

type StoredDatabaseConfig = DatabaseConfig & {
  updatedAt: string;
};

const CONFIG_FILE_NAME = "database-config.json";

function getDefaultConfigDirectory() {
  return path.join(process.cwd(), ".app-config");
}

function getConfigDirectory() {
  return process.env.APP_CONFIG_DIR || getDefaultConfigDirectory();
}

function getConfigFilePath() {
  return path.join(getConfigDirectory(), CONFIG_FILE_NAME);
}

function parsePort(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3306;
}

function sanitizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeConfig(input: Partial<DatabaseConfig>): DatabaseConfig {
  return {
    host: sanitizeText(input.host),
    port: parsePort(input.port),
    user: sanitizeText(input.user),
    password: String(input.password ?? ""),
    database: sanitizeText(input.database)
  };
}

function validateConfig(config: DatabaseConfig) {
  if (!config.host) throw new Error("SQL host is required.");
  if (!config.user) throw new Error("SQL user is required.");
  if (!config.database) throw new Error("SQL database name is required.");
  if (!config.password) throw new Error("SQL password is required.");
}

function getEnvConfig(): DatabaseConfig | null {
  const host = sanitizeText(process.env.DB_HOST);
  const user = sanitizeText(process.env.DB_USER);
  const password = String(process.env.DB_PASSWORD ?? "");
  const database = sanitizeText(process.env.DB_NAME);

  if (!host || !user || !password || !database) {
    return null;
  }

  return {
    host,
    port: parsePort(process.env.DB_PORT),
    user,
    password,
    database
  };
}

export async function readStoredDatabaseConfig(): Promise<StoredDatabaseConfig | null> {
  try {
    const file = await readFile(getConfigFilePath(), "utf8");
    const parsed = JSON.parse(file) as Partial<StoredDatabaseConfig>;
    const normalized = normalizeConfig(parsed);
    validateConfig(normalized);

    return {
      ...normalized,
      updatedAt: sanitizeText(parsed.updatedAt) || new Date().toISOString()
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function getDatabaseConfig(): Promise<DatabaseConfig> {
  const stored = await readStoredDatabaseConfig();
  if (stored) {
    return stored;
  }

  const envConfig = getEnvConfig();
  if (envConfig) {
    return envConfig;
  }

  throw new Error("Database is not configured. Open the Config page and save SQL credentials.");
}

export async function saveDatabaseConfig(input: Partial<DatabaseConfig>) {
  const config = normalizeConfig(input);
  validateConfig(config);

  await mkdir(getConfigDirectory(), { recursive: true });
  const payload: StoredDatabaseConfig = {
    ...config,
    updatedAt: new Date().toISOString()
  };

  await writeFile(getConfigFilePath(), JSON.stringify(payload, null, 2), "utf8");

  return payload;
}

export async function testDatabaseConfig(input: Partial<DatabaseConfig>) {
  const config = normalizeConfig(input);
  validateConfig(config);

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database
  });

  try {
    await connection.query("SELECT 1");
  } finally {
    await connection.end();
  }

  return config;
}

export async function getDatabaseConfigSummary() {
  const stored = await readStoredDatabaseConfig();
  const envConfig = getEnvConfig();
  const source = stored ? "saved" : envConfig ? "environment" : "missing";
  const activeConfig = stored ?? envConfig;

  return {
    source,
    configured: Boolean(activeConfig),
    config: activeConfig
      ? {
          host: activeConfig.host,
          port: activeConfig.port,
          user: activeConfig.user,
          database: activeConfig.database,
          hasPassword: Boolean(activeConfig.password)
        }
      : null,
    updatedAt: stored?.updatedAt ?? null
  };
}
