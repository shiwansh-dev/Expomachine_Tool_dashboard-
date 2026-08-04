import { NextResponse } from "next/server";
import { getRecentShiftSummaries, getShiftComputeProgress } from "@/lib/shift-compute";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [progress, recent] = await Promise.all([
      Promise.resolve(getShiftComputeProgress()),
      getRecentShiftSummaries()
    ]);

    return NextResponse.json({ progress, recent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load shift compute status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
