import ThresholdsClient from "@/app/thresholds/thresholds-client";
import { DEFAULT_THRESHOLD, getAll } from "@/lib/thresholds";

export const dynamic = "force-dynamic";

export default async function ThresholdsPage() {
  const thresholds = await getAll();

  return (
    <main className="page-shell settings-page">
      <ThresholdsClient defaultThreshold={DEFAULT_THRESHOLD} initialThresholds={thresholds} />
    </main>
  );
}
