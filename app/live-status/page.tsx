import LiveStatusClient from "@/app/live-status/live-status-client";

export const dynamic = "force-dynamic";

export default function LiveStatusPage() {
  return <LiveStatusClient initialDate={new Date().toISOString().slice(0, 10)} />;
}
