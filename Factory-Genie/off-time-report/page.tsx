"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { CalenderIcon, DownloadIcon } from "@/icons";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

const OFFTIME_REPORT_FILTERS_KEY = "factory_genie_offtime_report_filters";

type ShiftName = "morning" | "night";
type ShiftFilter = ShiftName | "both";
type FilterMode = "week" | "month" | "custom";
type ChartViewMode = "sum" | "average";

interface OfftimePeriod {
  date: string;
  time: string;
  status: string;
  endtime: string;
  timediff: string;
}

interface OfftimeResult {
  channel: string;
  shift: ShiftName;
  machineName: string;
  periods: OfftimePeriod[];
  count: number;
  totalPeriods: number;
  totalDuration: string;
}

interface OfftimePayload {
  results?: OfftimeResult[];
}

interface OffTimeReportDocument {
  _id: string;
  deviceno: number;
  currentdate: string;
  offtime?: OfftimePayload | null;
  [key: string]: unknown;
}

interface AggregatedMachineRow {
  key: string;
  deviceNo: number;
  channelKey: string;
  machineName: string;
  days: number;
  breakCountByDate: Record<string, number>;
  downtimeMinutesByDate: Record<string, number>;
}

const SHIFT_OPTIONS: ShiftFilter[] = ["morning", "night", "both"];
const FILTER_MODES: FilterMode[] = ["week", "month", "custom"];
const CHART_VIEW_MODES: ChartViewMode[] = ["sum", "average"];

const todayIso = () => new Date().toISOString().split("T")[0];
const currentMonthIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const parseYYMMDDToDate = (value: string): Date => {
  const [year, month, day] = value.split("/");
  return new Date(Number(`20${year}`), Number(month) - 1, Number(day));
};

const formatDisplayDate = (value: string): string => {
  if (!value) {
    return "-";
  }

  if (value.includes("/")) {
    return parseYYMMDDToDate(value).toLocaleDateString("en-GB");
  }

  return new Date(value).toLocaleDateString("en-GB");
};

const formatRangeLabel = (startDate: string, endDate: string): string => {
  if (startDate === endDate) {
    return formatDisplayDate(startDate);
  }

  return `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;
};

const parseDurationToMinutes = (value?: string): number => {
  if (!value) {
    return 0;
  }

  const [hours, minutes, seconds] = value.split(":").map((item) => Number(item) || 0);
  return hours * 60 + minutes + seconds / 60;
};

const getMonthBounds = (monthIso: string) => {
  const [year, month] = monthIso.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
};

const getWeekRangeOfMonth = (monthIso: string, weekNumber: number) => {
  const [year, month] = monthIso.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const start = new Date(year, month - 1, 1 + (weekNumber - 1) * 7);
  const end = new Date(year, month - 1, start.getDate() + 6);

  return {
    startDate: start < monthStart ? monthStart.toISOString().split("T")[0] : start.toISOString().split("T")[0],
    endDate: end > monthEnd ? monthEnd.toISOString().split("T")[0] : end.toISOString().split("T")[0],
  };
};

const getWeeksInMonth = (monthIso: string) => {
  const [year, month] = monthIso.split("-").map(Number);
  const lastDate = new Date(year, month, 0).getDate();
  return Math.ceil(lastDate / 7);
};

const buildDateRange = (
  mode: FilterMode,
  selectedMonth: string,
  selectedWeek: number,
  customStartDate: string,
  customEndDate: string,
) => {
  if (mode === "month") {
    return getMonthBounds(selectedMonth);
  }

  if (mode === "week") {
    return getWeekRangeOfMonth(selectedMonth, selectedWeek);
  }

  return { startDate: customStartDate, endDate: customEndDate };
};

const buildTrendLine = (values: number[]) => {
  if (values.length < 2) {
    return values;
  }

  const n = values.length;
  const xValues = values.map((_, index) => index);
  const sumX = xValues.reduce((sum, value) => sum + value, 0);
  const sumY = values.reduce((sum, value) => sum + value, 0);
  const sumXY = xValues.reduce((sum, value, index) => sum + value * values[index], 0);
  const sumXX = xValues.reduce((sum, value) => sum + value * value, 0);
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) {
    return values;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return xValues.map((value) => Number((slope * value + intercept).toFixed(2)));
};

export default function OffTimeReportPage() {
  const [deviceNumbers, setDeviceNumbers] = useState<number[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("week");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIso);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [customStartDate, setCustomStartDate] = useState(todayIso);
  const [customEndDate, setCustomEndDate] = useState(todayIso);
  const [selectedShift, setSelectedShift] = useState<ShiftFilter>("morning");
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("sum");
  const [reports, setReports] = useState<OffTimeReportDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OFFTIME_REPORT_FILTERS_KEY);
      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved) as Partial<{
        filterMode: FilterMode;
        selectedMonth: string;
        selectedWeek: number;
        customStartDate: string;
        customEndDate: string;
        selectedShift: ShiftFilter;
        chartViewMode: ChartViewMode;
      }>;

      if (parsed.filterMode && FILTER_MODES.includes(parsed.filterMode)) {
        setFilterMode(parsed.filterMode);
      }
      if (parsed.selectedMonth) {
        setSelectedMonth(parsed.selectedMonth);
      }
      if (typeof parsed.selectedWeek === "number") {
        setSelectedWeek(parsed.selectedWeek);
      }
      if (parsed.customStartDate) {
        setCustomStartDate(parsed.customStartDate);
      }
      if (parsed.customEndDate) {
        setCustomEndDate(parsed.customEndDate);
      }
      if (parsed.selectedShift && SHIFT_OPTIONS.includes(parsed.selectedShift)) {
        setSelectedShift(parsed.selectedShift);
      }
      if (parsed.chartViewMode && CHART_VIEW_MODES.includes(parsed.chartViewMode)) {
        setChartViewMode(parsed.chartViewMode);
      }
    } catch {
      // Ignore invalid cached filters.
    }
  }, []);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem("user");
      let parsedDevices: number[] = [];

      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (Array.isArray(parsed.deviceNo)) {
          parsedDevices = parsed.deviceNo.filter((value: unknown) => typeof value === "number");
        } else if (typeof parsed.deviceNo === "number") {
          parsedDevices = [parsed.deviceNo];
        }
      }

      const direct = localStorage.getItem("deviceNo");
      if (direct) {
        const directDevices = direct
          .split(",")
          .map((value) => parseInt(value.trim(), 10))
          .filter((value) => !Number.isNaN(value));

        if (directDevices.length > 0) {
          parsedDevices = directDevices;
        }
      }

      setDeviceNumbers(parsedDevices);
    } catch {
      setDeviceNumbers([]);
    }
  }, []);

  const weekOptions = useMemo(() => {
    const count = getWeeksInMonth(selectedMonth);
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [selectedMonth]);

  useEffect(() => {
    if (!weekOptions.includes(selectedWeek)) {
      setSelectedWeek(weekOptions[0] || 1);
    }
  }, [selectedWeek, weekOptions]);

  useEffect(() => {
    try {
      localStorage.setItem(
        OFFTIME_REPORT_FILTERS_KEY,
        JSON.stringify({
          filterMode,
          selectedMonth,
          selectedWeek,
          customStartDate,
          customEndDate,
          selectedShift,
          chartViewMode,
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [chartViewMode, customEndDate, customStartDate, filterMode, selectedMonth, selectedShift, selectedWeek]);

  const range = useMemo(
    () => buildDateRange(filterMode, selectedMonth, selectedWeek, customStartDate, customEndDate),
    [customEndDate, customStartDate, filterMode, selectedMonth, selectedWeek],
  );

  const fetchReport = useCallback(async () => {
    if (deviceNumbers.length === 0 || !range.startDate || !range.endDate) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/factory-genie/shiftwise-data-v2?startDate=${range.startDate}&endDate=${range.endDate}&deviceNo=${deviceNumbers.join(",")}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || "Failed to fetch off-time report");
      }

      const json = await response.json();
      setReports(Array.isArray(json.data) ? json.data : []);
    } catch (fetchError) {
      setReports([]);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch off-time report");
    } finally {
      setLoading(false);
    }
  }, [deviceNumbers, range.endDate, range.startDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => parseYYMMDDToDate(a.currentdate).getTime() - parseYYMMDDToDate(b.currentdate).getTime()),
    [reports],
  );

  const reportDates = useMemo(
    () =>
      [...new Set(sortedReports.map((report) => report.currentdate))].sort(
        (a, b) => parseYYMMDDToDate(a).getTime() - parseYYMMDDToDate(b).getTime(),
      ),
    [sortedReports],
  );

  const machineRows = useMemo<AggregatedMachineRow[]>(() => {
    const rowMap = new Map<string, AggregatedMachineRow>();

    sortedReports.forEach((report) => {
      (report.offtime?.results || []).forEach((result) => {
        if (selectedShift !== "both" && result.shift !== selectedShift) {
          return;
        }

        const rowKey = `${report.deviceno}:${result.channel}`;
        const existing = rowMap.get(rowKey) || {
          key: rowKey,
          deviceNo: report.deviceno,
          channelKey: result.channel,
          machineName: result.machineName || result.channel.toUpperCase(),
          days: 0,
          breakCountByDate: {},
          downtimeMinutesByDate: {},
        };

        const longBreakCount = result.periods.filter((period) => parseDurationToMinutes(period.timediff) >= 20).length;
        const downtimeMinutes = result.periods.reduce((sum, period) => {
          const duration = parseDurationToMinutes(period.timediff);
          return duration >= 5 ? sum + duration : sum;
        }, 0);

        const dateKey = report.currentdate;
        if (!(dateKey in existing.breakCountByDate) && !(dateKey in existing.downtimeMinutesByDate)) {
          existing.days += 1;
        }

        existing.breakCountByDate[dateKey] = (existing.breakCountByDate[dateKey] || 0) + longBreakCount;
        existing.downtimeMinutesByDate[dateKey] = (existing.downtimeMinutesByDate[dateKey] || 0) + downtimeMinutes;
        rowMap.set(rowKey, existing);
      });
    });

    return [...rowMap.values()].sort((a, b) => a.machineName.localeCompare(b.machineName));
  }, [selectedShift, sortedReports]);

  const summaryStats = useMemo(() => {
    const totalBreaks = machineRows.reduce(
      (sum, row) => sum + Object.values(row.breakCountByDate).reduce((innerSum, value) => innerSum + value, 0),
      0,
    );
    const totalDowntimeMinutes = machineRows.reduce(
      (sum, row) =>
        sum + Object.values(row.downtimeMinutesByDate).reduce((innerSum, value) => innerSum + value, 0),
      0,
    );

    return {
      totalBreaks,
      totalDowntimeMinutes,
      totalDates: reportDates.length,
      totalMachines: machineRows.length,
    };
  }, [machineRows, reportDates.length]);

  const breakCountByDate = useMemo(
    () =>
      reportDates.map((date) => {
        const rowsWithData = machineRows.filter((row) => date in row.breakCountByDate);
        const totalBreaks = rowsWithData.reduce((sum, row) => sum + (row.breakCountByDate[date] || 0), 0);
        return {
          date,
          totalBreaks,
          averageBreaks: rowsWithData.length > 0 ? totalBreaks / rowsWithData.length : 0,
          machineCount: rowsWithData.length,
        };
      }),
    [machineRows, reportDates],
  );

  const downtimeByDate = useMemo(
    () =>
      reportDates.map((date) => {
        const rowsWithData = machineRows.filter((row) => date in row.downtimeMinutesByDate);
        const totalDowntimeMinutes = rowsWithData.reduce((sum, row) => sum + (row.downtimeMinutesByDate[date] || 0), 0);
        return {
          date,
          totalDowntimeMinutes,
          averageDowntimeMinutes: rowsWithData.length > 0 ? totalDowntimeMinutes / rowsWithData.length : 0,
          machineCount: rowsWithData.length,
        };
      }),
    [machineRows, reportDates],
  );

  const breakCountChart = useMemo(() => {
    const categories = breakCountByDate.map((row) => formatDisplayDate(row.date));
    const seriesValues = breakCountByDate.map((row) =>
      Number((chartViewMode === "sum" ? row.totalBreaks : row.averageBreaks).toFixed(2)),
    );
    const trendValues = buildTrendLine(seriesValues);

    const options: ApexOptions = {
      chart: {
        type: "line",
        toolbar: {
          show: false,
        },
      },
      stroke: {
        width: [3, 2],
        curve: "smooth",
        dashArray: [0, 6],
      },
      colors: ["#991B1B", "#2563EB"],
      xaxis: {
        categories,
        labels: {
          rotate: -35,
        },
      },
      yaxis: {
        title: {
          text: chartViewMode === "sum" ? "Break Count Sum" : "Break Count Average",
        },
      },
      markers: {
        size: [4, 0],
      },
      dataLabels: {
        enabled: false,
      },
      grid: {
        borderColor: "#E5E7EB",
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
      },
    };

    return {
      options,
      series: [
        { name: chartViewMode === "sum" ? "Breaks > 20 Min" : "Average Breaks > 20 Min", data: seriesValues },
        { name: "Trend Line", data: trendValues },
      ],
    };
  }, [breakCountByDate, chartViewMode]);

  const downtimeChart = useMemo(() => {
    const categories = downtimeByDate.map((row) => formatDisplayDate(row.date));
    const seriesValues = downtimeByDate.map((row) =>
      Number(
        (
          (chartViewMode === "sum" ? row.totalDowntimeMinutes : row.averageDowntimeMinutes) / 60
        ).toFixed(2),
      ),
    );
    const trendValues = buildTrendLine(seriesValues);

    const options: ApexOptions = {
      chart: {
        type: "line",
        toolbar: {
          show: false,
        },
      },
      stroke: {
        width: [3, 2],
        curve: "smooth",
        dashArray: [0, 6],
      },
      colors: ["#0F766E", "#2563EB"],
      xaxis: {
        categories,
        labels: {
          rotate: -35,
        },
      },
      yaxis: {
        title: {
          text: chartViewMode === "sum" ? "Downtime Sum (Hours)" : "Downtime Average (Hours)",
        },
      },
      markers: {
        size: [4, 0],
      },
      dataLabels: {
        enabled: false,
      },
      grid: {
        borderColor: "#E5E7EB",
      },
      legend: {
        position: "top",
        horizontalAlign: "left",
      },
      tooltip: {
        y: {
          formatter: (value) => `${Number(value).toFixed(2)} h`,
        },
      },
    };

    return {
      options,
      series: [
        { name: chartViewMode === "sum" ? "Downtime Hours > 5 Min" : "Average Downtime Hours > 5 Min", data: seriesValues },
        { name: "Trend Line", data: trendValues },
      ],
    };
  }, [chartViewMode, downtimeByDate]);

  const modeLabel = filterMode === "week"
    ? `Week ${selectedWeek} of ${selectedMonth}`
    : filterMode === "month"
      ? `Month ${selectedMonth}`
      : "Custom Range";

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">OFF Time Report</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Break-frequency and downtime analysis from `offtime.results` for week, month, or custom range.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2.5 rounded-md bg-gray-900 px-4 py-2 text-center font-medium text-white hover:bg-gray-800"
        >
          <DownloadIcon />
          Print / Save PDF
        </button>
      </div>

      <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-3">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Display Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {FILTER_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterMode(mode)}
                  className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                    filterMode === mode
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {mode === "week" ? "Week" : mode === "month" ? "Month" : "Range"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={fetchReport}
              disabled={deviceNumbers.length === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2 text-white hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CalenderIcon />
              Refresh Report
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {filterMode === "month" ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Select Month</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
              />
            </div>
          ) : null}

          {filterMode === "week" ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Select Month</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Week of Month</label>
                <select
                  value={selectedWeek}
                  onChange={(event) => setSelectedWeek(Number(event.target.value))}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                >
                  {weekOptions.map((week) => (
                    <option key={week} value={week}>
                      Week {week}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {filterMode === "custom" ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                />
              </div>
            </>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Shift</label>
            <div className="flex gap-2">
              {SHIFT_OPTIONS.map((shift) => (
                <button
                  key={shift}
                  type="button"
                  onClick={() => setSelectedShift(shift)}
                  className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${
                    selectedShift === shift
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {shift === "both" ? "Both" : shift.charAt(0).toUpperCase() + shift.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-6 rounded-sm border border-stroke bg-white p-10 text-center text-sm text-gray-500 shadow-default dark:border-strokedark dark:bg-boxdark dark:text-gray-400">
          Loading report...
        </div>
      ) : null}

      {!loading && error ? (
        <div className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {!loading && !error && sortedReports.length === 0 ? (
        <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          No off-time records were found for the available devices in this range.
        </div>
      ) : null}

      {!loading && sortedReports.length > 0 ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
              <p className="text-sm text-gray-500 dark:text-gray-400">Range</p>
              <p className="mt-2 text-lg font-semibold text-black dark:text-white">{formatRangeLabel(range.startDate, range.endDate)}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{modeLabel}</p>
            </div>
            <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
              <p className="text-sm text-gray-500 dark:text-gray-400">Selected Shift</p>
              <p className="mt-2 text-lg font-semibold text-black dark:text-white">
                {selectedShift === "both" ? "Both" : selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)}
              </p>
            </div>
            <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
              <p className="text-sm text-gray-500 dark:text-gray-400">Breaks &gt; 20 Min</p>
              <p className="mt-2 text-lg font-semibold text-black dark:text-white">{summaryStats.totalBreaks}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Dates: {summaryStats.totalDates}</p>
            </div>
            <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
              <p className="text-sm text-gray-500 dark:text-gray-400">Downtime Hours &gt; 5 Min</p>
              <p className="mt-2 text-lg font-semibold text-black dark:text-white">
                {(summaryStats.totalDowntimeMinutes / 60).toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Machines: {summaryStats.totalMachines} across {deviceNumbers.length} devices</p>
            </div>
          </div>

          <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-black dark:text-white">Number of Breaks Greater Than 20 Min</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Machine-wise count of off-time periods with duration at least 20 minutes.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Machine</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Days</th>
                    {reportDates.map((date) => (
                      <th key={date} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machineRows.map((row) => (
                    <tr key={row.key} className="border-b border-stroke text-sm dark:border-strokedark">
                      <td className="px-3 py-3 font-medium text-black dark:text-white">{row.machineName}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{row.days}</td>
                      {reportDates.map((date) => (
                        <td key={`${row.key}-breaks-${date}`} className="px-3 py-3 text-gray-700 dark:text-gray-300">
                          {row.breakCountByDate[date] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-black dark:text-white">Downtime Hours Greater Than 5 Min</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Machine-wise total downtime hours from periods with duration at least 5 minutes.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Machine</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Days</th>
                    {reportDates.map((date) => (
                      <th key={date} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {machineRows.map((row) => (
                    <tr key={row.key} className="border-b border-stroke text-sm dark:border-strokedark">
                      <td className="px-3 py-3 font-medium text-black dark:text-white">{row.machineName}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{row.days}</td>
                      {reportDates.map((date) => (
                        <td key={`${row.key}-downtime-${date}`} className="px-3 py-3 text-gray-700 dark:text-gray-300">
                          {((row.downtimeMinutesByDate[date] || 0) / 60).toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">Break Count Summary</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {chartViewMode === "sum"
                      ? "Date-wise total breaks across all machines."
                      : "Date-wise average breaks per machine with data."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {CHART_VIEW_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setChartViewMode(mode)}
                      className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                        chartViewMode === mode
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {mode === "sum" ? "Sum" : "Average"}
                    </button>
                  ))}
                </div>
              </div>
              {breakCountByDate.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded border border-stroke p-3 dark:border-strokedark">
                  <ReactApexChart
                    options={breakCountChart.options}
                    series={breakCountChart.series}
                    type="line"
                    height={320}
                  />
                </div>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {chartViewMode === "sum" ? "Break Sum > 20 Min" : "Break Average > 20 Min"}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Machines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakCountByDate.map((row) => (
                      <tr key={row.date} className="border-b border-stroke text-sm dark:border-strokedark">
                        <td className="px-3 py-3 font-medium text-black dark:text-white">{formatDisplayDate(row.date)}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                          {chartViewMode === "sum" ? row.totalBreaks : row.averageBreaks.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{row.machineCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">Downtime Summary</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {chartViewMode === "sum"
                      ? "Date-wise total downtime across all machines."
                      : "Date-wise average downtime per machine with data."}
                  </p>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Shared graph mode with Break Count Summary
                </div>
              </div>
              {downtimeByDate.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded border border-stroke p-3 dark:border-strokedark">
                  <ReactApexChart
                    options={downtimeChart.options}
                    series={downtimeChart.series}
                    type="line"
                    height={320}
                  />
                </div>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {chartViewMode === "sum" ? "Downtime Sum (Hours)" : "Downtime Average (Hours)"}
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Machines</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downtimeByDate.map((row) => (
                      <tr key={row.date} className="border-b border-stroke text-sm dark:border-strokedark">
                        <td className="px-3 py-3 font-medium text-black dark:text-white">{formatDisplayDate(row.date)}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                          {(
                            (chartViewMode === "sum" ? row.totalDowntimeMinutes : row.averageDowntimeMinutes) / 60
                          ).toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{row.machineCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
