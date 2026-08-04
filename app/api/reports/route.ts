import { NextRequest, NextResponse } from "next/server";
import { getReportDashboard, type ShiftFilter } from "@/lib/live-status";

export const dynamic = "force-dynamic";

type ReportShift = "morning" | "night" | "both";

type ReportRow = {
  date: string;
  shift: "morning" | "night";
  shiftLabel: string;
  deviceId: string;
  machineName: string;
  group: string;
  status: string;
  runtimeMinutes: number;
  worktimeMinutes: number;
  runtimePercent: number;
  averageCurrent: number | null;
  lastSeen: string;
};

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const dates: string[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(formatDate(cursor));
    if (dates.length > 62) break;
  }

  return dates;
}

function getReportShift(value: string | null): ReportShift {
  if (value === "morning" || value === "night") return value;
  return "both";
}

function getShifts(value: ReportShift): Array<"morning" | "night"> {
  return value === "both" ? ["morning", "night"] : [value];
}

function toReportRow(date: string, shift: "morning" | "night", machine: Awaited<ReturnType<typeof getReportDashboard>>["machines"][number]): ReportRow {
  return {
    date,
    shift,
    shiftLabel: machine.shiftLabel,
    deviceId: machine.deviceId,
    machineName: machine.machineName,
    group: machine.group,
    status: machine.status,
    runtimeMinutes: machine.runtimeMinutes,
    worktimeMinutes: machine.worktimeMinutes,
    runtimePercent: machine.runtimePercent,
    averageCurrent: machine.averageCurrent,
    lastSeen: machine.lastSeen
  };
}

export async function GET(request: NextRequest) {
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  const selectedShift = getReportShift(request.nextUrl.searchParams.get("shift"));

  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return NextResponse.json(
      { error: "startDate and endDate must be YYYY-MM-DD" },
      { status: 400 }
    );
  }

  if ((startDate as string) > (endDate as string)) {
    return NextResponse.json({ error: "startDate cannot be after endDate" }, { status: 400 });
  }

  try {
    const dates = getDateRange(startDate as string, endDate as string);
    const shifts = getShifts(selectedShift);
    const rows: ReportRow[] = [];
    const precomputedDates = new Set<string>();
    const liveDates = new Set<string>();

    for (const date of dates) {
      for (const shift of shifts) {
        const dashboard = await getReportDashboard({ date, shift: shift as ShiftFilter });
        rows.push(...dashboard.machines.map((machine) => toReportRow(date, shift, machine)));

        if (dashboard.dataSource === "per-minute") {
          liveDates.add(date);
        } else {
          precomputedDates.add(date);
        }
      }
    }

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalRows += 1;
        acc.totalRuntimeMinutes += row.runtimeMinutes;
        acc.totalWorktimeMinutes += row.worktimeMinutes;
        if (row.status === "ON") acc.activeRows += 1;
        if (row.status === "OFF") acc.inactiveRows += 1;
        return acc;
      },
      {
        totalRows: 0,
        activeRows: 0,
        inactiveRows: 0,
        totalRuntimeMinutes: 0,
        totalWorktimeMinutes: 0
      }
    );

    return NextResponse.json({
      startDate,
      endDate,
      shift: selectedShift,
      rows,
      summary: {
        ...summary,
        totalRuntimeMinutes: Number(summary.totalRuntimeMinutes.toFixed(1)),
        totalWorktimeMinutes: Number(summary.totalWorktimeMinutes.toFixed(1))
      },
      dataSource: {
        precomputedDays: precomputedDates.size,
        liveDays: liveDates.size
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
