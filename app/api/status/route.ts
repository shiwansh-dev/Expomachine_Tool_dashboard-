import { NextResponse } from "next/server";
import { getRuntimeStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getRuntimeStatus());
}
