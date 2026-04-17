import { NextRequest, NextResponse } from "next/server";
import { getLiveStatusDashboard } from "@/lib/live-status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dashboard = await getLiveStatusDashboard({
      date: searchParams.get("date") ?? undefined,
      shift: (searchParams.get("shift") ?? undefined) as "all" | "morning" | "night" | undefined
    });

    return NextResponse.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load live-status data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
