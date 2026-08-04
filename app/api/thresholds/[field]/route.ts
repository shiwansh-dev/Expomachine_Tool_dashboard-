import { NextRequest, NextResponse } from "next/server";
import { setThreshold } from "@/lib/thresholds";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    field: string;
  };
};

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const field = decodeURIComponent(params.field);
  const body = await request.json().catch(() => null);
  const value = Number(body?.value);

  if (Number.isNaN(value)) {
    return NextResponse.json({ error: "value must be a number" }, { status: 400 });
  }

  try {
    await setThreshold(field, value);
    return NextResponse.json({ field, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update threshold";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
