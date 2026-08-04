import { NextRequest, NextResponse } from "next/server";
import { computeShiftDataNow, getShiftComputeProgress } from "@/lib/shift-compute";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : undefined;

  if (getShiftComputeProgress().running) {
    return NextResponse.json({ error: "A shift computation is already running" }, { status: 409 });
  }

  computeShiftDataNow(date).catch(() => {
    // Failure is recorded in shift compute state/history for the status endpoint.
  });

  return NextResponse.json({ started: true });
}
