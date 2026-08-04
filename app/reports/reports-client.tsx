"use client";

import { useEffect, useMemo, useState } from "react";

type ReportShift = "morning" | "night" | "both";
type ReportMetricId = "runtimeHours" | "workingHours" | "averageHours" | "runtimeLoad" | "runtimeEfficiency";

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

type ReportResponse = {
  startDate: string;
  endDate: string;
  shift: ReportShift;
  rows: ReportRow[];
  dataSource?: {
    precomputedDays: number;
    liveDays: number;
  };
};

type MachineDayStats = {
  group: string;
  machineName: string;
  runtimeMinutes: number;
  worktimeMinutes: number;
  machineCount: number;
  currentTotal: number;
  currentCount: number;
};

const REPORT_FILTERS_KEY = "factory-genie-report-filters";
const DEFAULT_VISIBLE_METRICS: ReportMetricId[] = ["runtimeHours"];
const DEFAULT_PEAK_VALUE = 7;
const REPORT_METRICS: Array<{ id: ReportMetricId; label: string }> = [
  { id: "runtimeHours", label: "Runtime Hours" },
  { id: "workingHours", label: "Total Working Hours" },
  { id: "averageHours", label: "Average Hours" },
  { id: "runtimeLoad", label: "Runtime Load" },
  { id: "runtimeEfficiency", label: "Runtime Efficiency" }
];

function getToday() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMinutes(value: number) {
  const totalMinutes = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatHoursFromMinutes(value: number) {
  return `${(Math.max(0, Number.isFinite(value) ? value : 0) / 60).toFixed(2)} hrs`;
}

function formatPercent(value: number | null) {
  return value === null || !Number.isFinite(value) ? "-" : `${value.toFixed(2)}%`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getMachineGroup(machine: Pick<ReportRow, "group" | "machineName">) {
  const rawGroup =
    machine.group && machine.group.trim()
      ? machine.group.trim().toUpperCase()
      : machine.machineName.match(/^[A-Z]+/i)?.[0].toUpperCase() || "OTHER";

  return rawGroup === "GNC" ? "GMC" : rawGroup;
}

function getPeakValueForGroup(group: string) {
  return group === "GMC" || group === "GTC" ? DEFAULT_PEAK_VALUE : DEFAULT_PEAK_VALUE;
}

function aggregateMachines(machines: ReportRow[]) {
  const statsByMachine = new Map<string, MachineDayStats>();

  machines.forEach((machine) => {
    const existing = statsByMachine.get(machine.machineName) ?? {
      group: getMachineGroup(machine),
      machineName: machine.machineName,
      runtimeMinutes: 0,
      worktimeMinutes: 0,
      machineCount: 0,
      currentTotal: 0,
      currentCount: 0
    };

    existing.runtimeMinutes += machine.runtimeMinutes;
    existing.worktimeMinutes += machine.worktimeMinutes;
    existing.machineCount += 1;

    if (machine.averageCurrent !== null && Number.isFinite(machine.averageCurrent)) {
      existing.currentTotal += machine.averageCurrent;
      existing.currentCount += 1;
    }

    statsByMachine.set(machine.machineName, existing);
  });

  return statsByMachine;
}

function getRuntimeLoadPercentage(stats: MachineDayStats | null) {
  if (!stats || stats.currentCount === 0) return null;
  return (stats.currentTotal / stats.currentCount / getPeakValueForGroup(stats.group)) * 100;
}

function getRuntimeEfficiencyPercentage(stats: Pick<MachineDayStats, "runtimeMinutes" | "worktimeMinutes"> | null) {
  if (!stats || stats.worktimeMinutes <= 0) return null;
  return (stats.runtimeMinutes / stats.worktimeMinutes) * 100;
}

function getMetricLabel(metricId: ReportMetricId) {
  return REPORT_METRICS.find((metric) => metric.id === metricId)?.label ?? metricId;
}

function formatMetricValue(metricId: ReportMetricId, stats: MachineDayStats | null) {
  if (!stats) return "-";

  if (metricId === "runtimeHours") return formatMinutes(stats.runtimeMinutes);
  if (metricId === "workingHours") return formatHoursFromMinutes(stats.worktimeMinutes);
  if (metricId === "averageHours") {
    return formatHoursFromMinutes(stats.machineCount > 0 ? stats.runtimeMinutes / stats.machineCount : 0);
  }
  if (metricId === "runtimeLoad") return formatPercent(getRuntimeLoadPercentage(stats));
  return formatPercent(getRuntimeEfficiencyPercentage(stats));
}

function getMachineNames(days: Array<{ date: string; machines: ReportRow[] }>) {
  return Array.from(new Set(days.flatMap((day) => day.machines.map((machine) => machine.machineName)))).sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true })
  );
}

function getSummaryMetricValue(
  metricId: ReportMetricId,
  days: Array<{ date: string; machines: ReportRow[] }>,
  machineName?: string
) {
  const matchingStats = days.flatMap((day) => {
    const stats = aggregateMachines(day.machines);
    if (machineName) {
      const machineStats = stats.get(machineName);
      return machineStats ? [machineStats] : [];
    }
    return Array.from(stats.values());
  });

  const runtimeMinutes = matchingStats.reduce((sum, stats) => sum + stats.runtimeMinutes, 0);
  const worktimeMinutes = matchingStats.reduce((sum, stats) => sum + stats.worktimeMinutes, 0);

  if (metricId === "runtimeHours") return formatMinutes(runtimeMinutes);
  if (metricId === "workingHours") return formatHoursFromMinutes(worktimeMinutes);
  if (metricId === "averageHours") {
    const divisor = machineName ? Math.max(1, days.length) : Math.max(1, matchingStats.length);
    return formatHoursFromMinutes(runtimeMinutes / divisor);
  }
  if (metricId === "runtimeEfficiency") {
    return formatPercent(getRuntimeEfficiencyPercentage({ runtimeMinutes, worktimeMinutes }));
  }

  const runtimeLoadValues = matchingStats
    .map((stats) => getRuntimeLoadPercentage(stats))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  return formatPercent(
    runtimeLoadValues.length > 0
      ? runtimeLoadValues.reduce((sum, value) => sum + value, 0) / runtimeLoadValues.length
      : null
  );
}

function buildExcelTable(
  days: Array<{ date: string; machines: ReportRow[] }>,
  visibleMetrics: ReportMetricId[]
) {
  const machineNames = getMachineNames(days);
  const headerCells = machineNames
    .flatMap((machineName) =>
      visibleMetrics.map(
        (metricId) => `<th>${escapeHtml(machineName)}<br />${escapeHtml(getMetricLabel(metricId))}</th>`
      )
    )
    .join("");
  const dateRows = days
    .map((day) => {
      const statsByMachine = aggregateMachines(day.machines);
      const cells = machineNames
        .flatMap((machineName) =>
          visibleMetrics.map((metricId) => {
            const stats = statsByMachine.get(machineName) ?? null;
            return `<td>${escapeHtml(formatMetricValue(metricId, stats))}</td>`;
          })
        )
        .join("");

      return `<tr><td>${escapeHtml(day.date)}</td>${cells}</tr>`;
    })
    .join("");
  const totalCells = machineNames
    .flatMap((machineName) =>
      visibleMetrics.map(
        (metricId) => `<td>${escapeHtml(getSummaryMetricValue(metricId, days, machineName))}</td>`
      )
    )
    .join("");

  return `
    <table>
      <thead><tr><th>Date</th>${headerCells}</tr></thead>
      <tbody>
        ${dateRows}
        <tr><th>Total</th>${totalCells}</tr>
      </tbody>
    </table>`;
}

export default function ReportsClient() {
  const [startDate, setStartDate] = useState(getToday);
  const [endDate, setEndDate] = useState(getToday);
  const [shift, setShift] = useState<ReportShift>("both");
  const [visibleMetrics, setVisibleMetrics] = useState<ReportMetricId[]>(DEFAULT_VISIBLE_METRICS);
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REPORT_FILTERS_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<{
        startDate: string;
        endDate: string;
        shift: ReportShift;
        visibleMetrics: ReportMetricId[];
      }>;
      if (parsed.startDate) setStartDate(parsed.startDate);
      if (parsed.endDate) setEndDate(parsed.endDate);
      if (parsed.shift === "morning" || parsed.shift === "night" || parsed.shift === "both") setShift(parsed.shift);
      if (Array.isArray(parsed.visibleMetrics) && parsed.visibleMetrics.length > 0) {
        setVisibleMetrics(parsed.visibleMetrics.filter((metric) => REPORT_METRICS.some((item) => item.id === metric)));
      }
    } catch {
      // Ignore invalid saved filters.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(REPORT_FILTERS_KEY, JSON.stringify({ startDate, endDate, shift, visibleMetrics }));
  }, [endDate, shift, startDate, visibleMetrics]);

  async function fetchReport() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ startDate, endDate, shift });
      const response = await fetch(`/api/reports?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload?.error || "Failed to load report");

      setData(payload);
    } catch (fetchError) {
      setData(null);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = useMemo(() => {
    const byDate = new Map<string, ReportRow[]>();
    (data?.rows ?? []).forEach((row) => {
      const current = byDate.get(row.date) ?? [];
      current.push(row);
      byDate.set(row.date, current);
    });

    return Array.from(byDate.entries())
      .map(([date, machines]) => ({ date, machines }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data?.rows]);

  const machineNames = useMemo(() => getMachineNames(days), [days]);
  const reportMatrix = useMemo(
    () =>
      days.map((day) => {
        const statsByMachine = aggregateMachines(day.machines);
        return {
          date: day.date,
          values: machineNames.map((machineName) => ({
            machineName,
            stats: statsByMachine.get(machineName) ?? null
          }))
        };
      }),
    [days, machineNames]
  );
  const totals = useMemo(() => {
    const flatRows = data?.rows ?? [];
    const runtimeMinutes = flatRows.reduce((sum, row) => sum + row.runtimeMinutes, 0);
    const worktimeMinutes = flatRows.reduce((sum, row) => sum + row.worktimeMinutes, 0);
    const loadValues = flatRows
      .map((row) => {
        if (row.averageCurrent === null) return null;
        return (row.averageCurrent / getPeakValueForGroup(getMachineGroup(row))) * 100;
      })
      .filter((value): value is number => value !== null && Number.isFinite(value));

    return {
      days: days.length,
      rows: flatRows.length,
      machines: machineNames.length,
      runtimeMinutes,
      worktimeMinutes,
      averageHours: days.length > 0 ? runtimeMinutes / days.length : 0,
      runtimeLoad: loadValues.length > 0 ? loadValues.reduce((sum, value) => sum + value, 0) / loadValues.length : null,
      runtimeEfficiency:
        worktimeMinutes > 0 ? (runtimeMinutes / worktimeMinutes) * 100 : null
    };
  }, [data?.rows, days.length, machineNames.length]);

  function toggleMetric(metricId: ReportMetricId) {
    setVisibleMetrics((current) => {
      if (current.includes(metricId)) {
        return current.length === 1 ? current : current.filter((item) => item !== metricId);
      }
      return [...current, metricId];
    });
  }

  function downloadExcel() {
    setDownloading(true);
    try {
      const workbook = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="UTF-8" />
            <style>
              table { border-collapse: collapse; }
              th, td { padding: 4px 10px; white-space: nowrap; text-align: center; }
              th { font-weight: 700; }
              td:first-child, th:first-child { text-align: left; }
            </style>
          </head>
          <body>${buildExcelTable(days, visibleMetrics)}</body>
        </html>`;
      const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `machine-runtime-report-${startDate}-to-${endDate}.xls`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Machine Runtime</span>
          <h1>Day Wise Report</h1>
          <p>Review each machine runtime by day and export the same rows to Excel.</p>
        </div>
        <button className="report-download-button" type="button" onClick={downloadExcel} disabled={loading || downloading || days.length === 0}>
          {downloading ? "Downloading..." : "Download Excel"}
        </button>
      </div>

      <div className="report-filters">
        <label>
          <span>Start Date</span>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          <span>End Date</span>
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label>
          <span>Shift</span>
          <select value={shift} onChange={(event) => setShift(event.target.value as ReportShift)}>
            <option value="both">Morning + Night</option>
            <option value="morning">Morning</option>
            <option value="night">Night</option>
          </select>
        </label>
        <button type="button" onClick={fetchReport} disabled={loading}>
          {loading ? "Loading..." : "Load Report"}
        </button>
      </div>

      <fieldset className="metric-picker">
        <legend>Display Fields</legend>
        <div>
          {REPORT_METRICS.map((metric) => (
            <label key={metric.id}>
              <input
                type="checkbox"
                checked={visibleMetrics.includes(metric.id)}
                onChange={() => toggleMetric(metric.id)}
              />
              <span>{metric.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <p className="report-error">{error}</p> : null}

      {data?.dataSource ? (
        <p className="report-data-source-note">
          {data.dataSource.precomputedDays} day{data.dataSource.precomputedDays === 1 ? "" : "s"} from
          precomputed shift data
          {data.dataSource.liveDays > 0
            ? `, ${data.dataSource.liveDays} computed live (not yet precomputed by the shift-compute worker)`
            : ""}
          .
        </p>
      ) : null}

      <div className="summary-grid report-summary-grid">
        <div className="summary-card"><span>Days</span><strong>{totals.days}</strong></div>
        <div className="summary-card"><span>Machines</span><strong>{totals.machines}</strong></div>
        <div className="summary-card"><span>Rows</span><strong>{totals.rows}</strong></div>
        <div className="summary-card"><span>Total Runtime</span><strong>{formatMinutes(totals.runtimeMinutes)}</strong></div>
        <div className="summary-card"><span>Total Worktime</span><strong>{formatHoursFromMinutes(totals.worktimeMinutes)}</strong></div>
      </div>

      <div className="summary-grid report-summary-grid">
        <div className="summary-card"><span>Average Hours</span><strong>{formatHoursFromMinutes(totals.averageHours)}</strong></div>
        <div className="summary-card"><span>Runtime Load</span><strong>{formatPercent(totals.runtimeLoad)}</strong></div>
        <div className="summary-card"><span>Runtime Efficiency</span><strong>{formatPercent(totals.runtimeEfficiency)}</strong></div>
      </div>

      <div className="table-wrap report-table-wrap">
        <table className="settings-table report-table">
          <thead>
            <tr>
              <th>Date</th>
              {machineNames.flatMap((machineName) =>
                visibleMetrics.map((metricId) => (
                  <th key={`${machineName}-${metricId}`}>
                    {machineName}
                    <span className="report-column-subtitle">{getMetricLabel(metricId)}</span>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {!loading && reportMatrix.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={Math.max(1, machineNames.length * visibleMetrics.length + 1)}>
                  No runtime rows found for this date range.
                </td>
              </tr>
            ) : (
              reportMatrix.map((row) => (
                <tr key={row.date}>
                  <td>{formatDate(row.date)}</td>
                  {row.values.flatMap((value) =>
                    visibleMetrics.map((metricId) => (
                      <td key={`${row.date}-${value.machineName}-${metricId}`}>
                        {formatMetricValue(metricId, value.stats)}
                      </td>
                    ))
                  )}
                </tr>
              ))
            )}
          </tbody>
          {machineNames.length > 0 ? (
            <tfoot>
              <tr>
                <th>Total</th>
                {machineNames.flatMap((machineName) =>
                  visibleMetrics.map((metricId) => (
                    <td key={`${machineName}-${metricId}`}>{getSummaryMetricValue(metricId, days, machineName)}</td>
                  ))
                )}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}
