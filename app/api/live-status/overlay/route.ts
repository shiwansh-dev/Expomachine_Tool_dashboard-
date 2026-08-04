import { NextResponse } from "next/server";
import { getLiveStatusOverlay } from "@/lib/live-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const overlay = await getLiveStatusOverlay();
    return NextResponse.json({ devices: overlay });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load live status overlay";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
