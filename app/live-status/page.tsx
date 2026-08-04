import LiveStatusClient from "@/app/live-status/live-status-client";
import { getDashboardTitle } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

function getLocalDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default async function LiveStatusPage() {
  const dashboardTitle = await getDashboardTitle();

  return (
    <LiveStatusClient
      initialDate={getLocalDateString()}
      dashboardTitle={dashboardTitle}
    />
  );
}
