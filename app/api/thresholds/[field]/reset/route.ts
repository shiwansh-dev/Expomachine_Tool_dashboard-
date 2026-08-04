import { NextResponse } from "next/server";
import { getThreshold, resetField } from "@/lib/thresholds";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    field: string;
  };
};

export async function POST(_request: Request, { params }: RouteContext) {
  const field = decodeURIComponent(params.field);

  try {
    await resetField(field);
    return NextResponse.json({ field, value: await getThreshold(field) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset threshold";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
