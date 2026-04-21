import { NextResponse } from "next/server";
import {
  getDatabaseConfigSummary,
  saveDatabaseConfig,
  testDatabaseConfig
} from "@/lib/db-config";
import { resetPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await getDatabaseConfigSummary();
    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load database configuration.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "test" | "save";
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      database?: string;
    };

    const configInput = {
      host: body.host,
      port: body.port,
      user: body.user,
      password: body.password,
      database: body.database
    };

    await testDatabaseConfig(configInput);

    if (body.action === "save") {
      const saved = await saveDatabaseConfig(configInput);
      await resetPool();

      return NextResponse.json({
        ok: true,
        message: "Database configuration saved successfully.",
        summary: {
          source: "saved",
          configured: true,
          config: {
            host: saved.host,
            port: saved.port,
            user: saved.user,
            database: saved.database,
            hasPassword: Boolean(saved.password)
          },
          updatedAt: saved.updatedAt
        }
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Database connection successful."
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to validate database configuration.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
