import { NextRequest, NextResponse } from "next/server";
import { getShiftSummaryPayload } from "@/lib/shift-compute";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A valid date query param is required" }, { status: 400 });
  }

  try {
    const payload = await getShiftSummaryPayload(date);
    return NextResponse.json({ payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load shift summary data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
