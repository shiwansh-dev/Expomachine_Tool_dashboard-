import { NextRequest, NextResponse } from "next/server";
import { setMany } from "@/lib/thresholds";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const fields = body?.fields;
  const value = Number(body?.value);

  if (!Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json({ error: "fields must be a non-empty array" }, { status: 400 });
  }

  if (fields.some((field) => typeof field !== "string" || field.trim() === "")) {
    return NextResponse.json({ error: "fields must contain only non-empty strings" }, { status: 400 });
  }

  if (Number.isNaN(value)) {
    return NextResponse.json({ error: "value must be a number" }, { status: 400 });
  }

  try {
    await setMany(Object.fromEntries(fields.map((field) => [field, value])));
    return NextResponse.json({ fields, value });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update thresholds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
