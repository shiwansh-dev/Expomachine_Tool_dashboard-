import { NextResponse } from "next/server";
import { DEFAULT_THRESHOLD, getAll } from "@/lib/thresholds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      defaultThreshold: DEFAULT_THRESHOLD,
      thresholds: await getAll()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load thresholds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
