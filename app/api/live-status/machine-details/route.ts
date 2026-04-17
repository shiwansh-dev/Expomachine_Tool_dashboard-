import { NextRequest, NextResponse } from "next/server";
import { getMachineDetails } from "@/lib/live-status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deviceId = searchParams.get("deviceId");
    const machineName = searchParams.get("machineName");

    if (!deviceId || !machineName) {
      return NextResponse.json(
        { error: "deviceId and machineName are required" },
        { status: 400 }
      );
    }

    const details = await getMachineDetails({
      date: searchParams.get("date") ?? undefined,
      shift: (searchParams.get("shift") ?? undefined) as "all" | "morning" | "night" | undefined,
      deviceId,
      machineName
    });

    return NextResponse.json(details);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load machine details";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
