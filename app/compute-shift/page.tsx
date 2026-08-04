import ComputeShiftClient from "@/app/compute-shift/compute-shift-client";
import {
  getRecentShiftSummaries,
  getShiftComputeProgress,
  getShiftSummaryPayload
} from "@/lib/shift-compute";

export const dynamic = "force-dynamic";

export default async function ComputeShiftPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [progress, recent, initialPayload] = await Promise.all([
    Promise.resolve(getShiftComputeProgress()),
    getRecentShiftSummaries(),
    getShiftSummaryPayload(today)
  ]);

  return (
    <main className="page-shell settings-page">
      <ComputeShiftClient
        initialProgress={progress}
        initialRecent={recent}
        initialDate={today}
        initialPayload={initialPayload}
      />
    </main>
  );
}
