import { NextResponse } from "next/server";
import { startShiftComputeWorker } from "@/lib/shift-compute";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    startShiftComputeWorker();
    return NextResponse.json({ started: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start shift compute worker";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
