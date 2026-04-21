import mysql, { Pool } from "mysql2/promise";
import { getDatabaseConfig } from "@/lib/db-config";

declare global {
  // eslint-disable-next-line no-var
  var __factoryGeniePool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __factoryGeniePoolKey: string | undefined;
}

function getPoolKey(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}) {
  return JSON.stringify({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database
  });
}

export async function getPool() {
  const config = await getDatabaseConfig();
  const nextPoolKey = getPoolKey(config);

  if (global.__factoryGeniePool && global.__factoryGeniePoolKey === nextPoolKey) {
    return global.__factoryGeniePool;
  }

  if (global.__factoryGeniePool) {
    await global.__factoryGeniePool.end();
  }

  global.__factoryGeniePool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true
  });
  global.__factoryGeniePoolKey = nextPoolKey;

  return global.__factoryGeniePool;
}

export async function resetPool() {
  if (global.__factoryGeniePool) {
    await global.__factoryGeniePool.end();
  }

  global.__factoryGeniePool = undefined;
  global.__factoryGeniePoolKey = undefined;
}
