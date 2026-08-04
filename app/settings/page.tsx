import SettingsClient from "@/app/settings/settings-client";
import { getDashboardTitle, getMqttSettings } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const dashboardTitle = await getDashboardTitle();
  const mqttSettings = await getMqttSettings();

  return (
    <main className="page-shell settings-page">
      <SettingsClient initialDashboardTitle={dashboardTitle} initialMqttSettings={mqttSettings} />
    </main>
  );
}
