import { NextResponse } from "next/server";
import { startMqttIngestion } from "@/lib/mqtt-ingestion";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await startMqttIngestion();
    return NextResponse.json({ started: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start MQTT ingestion";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
