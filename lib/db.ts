import mysql, { Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __factoryGeniePool: Pool | undefined;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPool() {
  if (!global.__factoryGeniePool) {
    global.__factoryGeniePool = mysql.createPool({
      host: getRequiredEnv("DB_HOST"),
      port: Number(process.env.DB_PORT || "3306"),
      user: getRequiredEnv("DB_USER"),
      password: getRequiredEnv("DB_PASSWORD"),
      database: getRequiredEnv("DB_NAME"),
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true
    });
  }

  return global.__factoryGeniePool;
}
