import { NextRequest, NextResponse } from "next/server";
import { getLogs } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit")) || 100;
  return NextResponse.json(getLogs(limit));
}
