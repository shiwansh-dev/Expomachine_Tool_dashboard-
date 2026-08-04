import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardTitle,
  getMqttSettings,
  setDashboardTitle,
  setMqttSettings
} from "@/lib/app-settings";
import { restartMqttIngestion } from "@/lib/mqtt-ingestion";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      dashboardTitle: await getDashboardTitle(),
      mqtt: await getMqttSettings()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const dashboardTitle = String(body?.dashboardTitle ?? "").trim();
  const mqtt = body?.mqtt ?? {};

  if (!dashboardTitle) {
    return NextResponse.json({ error: "dashboardTitle is required" }, { status: 400 });
  }

  try {
    const savedMqttSettings = await setMqttSettings({
      mqttBrokerUrl: String(mqtt.mqttBrokerUrl ?? ""),
      mqttTopic: String(mqtt.mqttTopic ?? ""),
      dataTopic: String(mqtt.dataTopic ?? ""),
      mqttClientId: String(mqtt.mqttClientId ?? ""),
      mqttUsername: String(mqtt.mqttUsername ?? ""),
      mqttPassword: String(mqtt.mqttPassword ?? "")
    });
    await restartMqttIngestion();

    return NextResponse.json({
      dashboardTitle: await setDashboardTitle(dashboardTitle),
      mqtt: savedMqttSettings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
