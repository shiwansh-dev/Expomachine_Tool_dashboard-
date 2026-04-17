"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { CalenderIcon, DownloadIcon } from "@/icons";
import ThresholdGraph from "../live-status_v2/ThresholdGraph";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});
const RUNTIME_REPORT_FILTERS_KEY = "factory_genie_runtime_report_filters";

type ShiftName = "morning" | "night";
type ShiftFilter = ShiftName | "both";
type FilterMode = "week" | "month" | "custom";
type ChartViewMode = "sum" | "average";

interface ShiftSummary {
  run_time: number;
  working_time: number;
  value_sum: number;
  average: number;
  shift_time: string;
  average_threshold: number;
  setting_time: number;
}

interface ChannelSummary {
  channel_name: string;
  morning?: ShiftSummary;
  night?: ShiftSummary;
}

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

interface ThresholdGraphChannel {
  machineName?: string;
  startTime?: Partial<Record<ShiftName, string>>;
  points?: Partial<Record<ShiftName, Array<[number, number]>>>;
}

interface ThresholdGraphPayload {
  channels?: Record<string, ThresholdGraphChannel>;
}

interface RuntimeReportDocument {
  _id: string;
  deviceno: number;
  currentdate: string;
  offtime?: OfftimePayload | null;
  thresholdGraph?: ThresholdGraphPayload | null;
  ["threshold graph"]?: ThresholdGraphPayload | null;
  [key: string]: unknown;
}

interface DeviceSettings {
  [key: string]: unknown;
}

interface AggregatedRow {
  key: string;
  deviceNo: number;
  channelKey: string;
  machineName: string;
  shift: ShiftName;
  days: number;
  runtimeByDate: Record<string, number>;
}

interface ChannelOption {
  key: string;
  deviceNo: number;
  channelKey: string;
  label: string;
}

const SHIFT_OPTIONS: ShiftFilter[] = ["morning", "night", "both"];
const SHIFT_VALUE_OPTIONS: ShiftName[] = ["morning", "night"];
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
    const date = parseYYMMDDToDate(value);
    return date.toLocaleDateString("en-GB");
  }

  return new Date(value).toLocaleDateString("en-GB");
};

const formatRangeLabel = (startDate: string, endDate: string): string => {
  if (startDate === endDate) {
    return formatDisplayDate(startDate);
  }

  return `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;
};

const formatMinutes = (minutes?: number): string => {
  const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes || 0)) : 0;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
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

const extractChannelOptions = (reports: RuntimeReportDocument[]): ChannelOption[] => {
  const options = new Map<string, ChannelOption>();
  reports.forEach((report) => {
    Object.keys(report)
      .filter((key) => /^ch\d+$/.test(key) && report[key])
      .forEach((key) => {
        const channel = report[key] as ChannelSummary | undefined;
        const compositeKey = `${report.deviceno}:${key}`;
        if (!options.has(compositeKey)) {
          options.set(compositeKey, {
            key: compositeKey,
            deviceNo: report.deviceno,
            channelKey: key,
            label: channel?.channel_name || key.toUpperCase(),
          });
        }
      });
  });

  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label));
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

export default function RuntimeReportPage() {
  const [deviceNumbers, setDeviceNumbers] = useState<number[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("week");
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIso);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [customStartDate, setCustomStartDate] = useState(todayIso);
  const [customEndDate, setCustomEndDate] = useState(todayIso);
  const [selectedShift, setSelectedShift] = useState<ShiftFilter>("morning");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [selectedInspectDate, setSelectedInspectDate] = useState("");
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [runtimeChartViewMode, setRuntimeChartViewMode] = useState<ChartViewMode>("sum");
  const [machineFilterTouched, setMachineFilterTouched] = useState(false);
  const [reports, setReports] = useState<RuntimeReportDocument[]>([]);
  const [deviceSettingsMap, setDeviceSettingsMap] = useState<Record<number, DeviceSettings>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RUNTIME_REPORT_FILTERS_KEY);
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
        selectedChannel: string;
        selectedInspectDate: string;
        selectedMachines: string[];
        runtimeChartViewMode: ChartViewMode;
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
      if (parsed.selectedChannel) {
        setSelectedChannel(parsed.selectedChannel);
      }
      if (parsed.selectedInspectDate) {
        setSelectedInspectDate(parsed.selectedInspectDate);
      }
      if (Array.isArray(parsed.selectedMachines)) {
        setSelectedMachines(parsed.selectedMachines.filter((value): value is string => typeof value === "string"));
        setMachineFilterTouched(true);
      }
      if (parsed.runtimeChartViewMode && CHART_VIEW_MODES.includes(parsed.runtimeChartViewMode)) {
        setRuntimeChartViewMode(parsed.runtimeChartViewMode);
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
        RUNTIME_REPORT_FILTERS_KEY,
        JSON.stringify({
          filterMode,
          selectedMonth,
          selectedWeek,
          customStartDate,
          customEndDate,
          selectedShift,
          selectedChannel,
          selectedInspectDate,
          selectedMachines,
          runtimeChartViewMode,
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [
    customEndDate,
    customStartDate,
    filterMode,
    selectedChannel,
    selectedInspectDate,
    selectedMachines,
    selectedMonth,
    selectedShift,
    selectedWeek,
    runtimeChartViewMode,
  ]);

  const range = useMemo(
    () =>
      buildDateRange(
        filterMode,
        selectedMonth,
        selectedWeek,
        customStartDate,
        customEndDate,
      ),
    [customEndDate, customStartDate, filterMode, selectedMonth, selectedWeek],
  );

  const fetchReport = useCallback(async () => {
    if (deviceNumbers.length === 0 || !range.startDate || !range.endDate) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const deviceNoParam = deviceNumbers.join(",");
      const reportResponse = await fetch(
        `/api/factory-genie/shiftwise-data-v2?startDate=${range.startDate}&endDate=${range.endDate}&deviceNo=${deviceNoParam}`,
        { cache: "no-store" },
      );

      const settingsResponses = await Promise.all(
        deviceNumbers.map(async (deviceNo) => {
          const response = await fetch(`/api/device-settings/${deviceNo}`, { cache: "no-store" });
          if (!response.ok) {
            return null;
          }
          const json = await response.json();
          const data = Array.isArray(json.data) ? json.data[0] || null : null;
          return data ? { deviceNo, data } : null;
        }),
      );

      if (!reportResponse.ok) {
        const reportJson = await reportResponse.json().catch(() => ({}));
        throw new Error(reportJson.error || "Failed to fetch runtime report");
      }

      const reportJson = await reportResponse.json();
      const fetchedReports = Array.isArray(reportJson.data) ? reportJson.data : [];
      setReports(fetchedReports);

      const nextSettingsMap: Record<number, DeviceSettings> = {};
      settingsResponses.forEach((entry) => {
        if (entry) {
          nextSettingsMap[entry.deviceNo] = entry.data;
        }
      });
      setDeviceSettingsMap(nextSettingsMap);
    } catch (fetchError) {
      setReports([]);
      setDeviceSettingsMap({});
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch runtime report");
    } finally {
      setLoading(false);
    }
  }, [deviceNumbers, range.endDate, range.startDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => parseYYMMDDToDate(b.currentdate).getTime() - parseYYMMDDToDate(a.currentdate).getTime()),
    [reports],
  );

  const channelOptions = useMemo(() => extractChannelOptions(sortedReports), [sortedReports]);

  const availableMachines = useMemo(
    () => [...new Set(channelOptions.map((option) => option.label))].sort((a, b) => a.localeCompare(b)),
    [channelOptions],
  );

  useEffect(() => {
    if (availableMachines.length === 0) {
      setSelectedMachines([]);
      return;
    }

    setSelectedMachines((current) => {
      const validCurrent = current.filter((machine) => availableMachines.includes(machine));
      if (validCurrent.length > 0) {
        return validCurrent;
      }
      return machineFilterTouched ? validCurrent : availableMachines;
    });
  }, [availableMachines, machineFilterTouched]);

  const filteredChannelOptions = useMemo(() => {
    if (selectedMachines.length === 0) {
      return machineFilterTouched ? [] : channelOptions;
    }

    return channelOptions.filter((option) => selectedMachines.includes(option.label));
  }, [channelOptions, machineFilterTouched, selectedMachines]);

  useEffect(() => {
    if (filteredChannelOptions.length === 0) {
      setSelectedChannel("");
      return;
    }

    setSelectedChannel((current) =>
      current && filteredChannelOptions.some((option) => option.key === current) ? current : filteredChannelOptions[0].key,
    );
  }, [filteredChannelOptions]);

  useEffect(() => {
    if (sortedReports.length === 0) {
      setSelectedInspectDate("");
      return;
    }

    setSelectedInspectDate((current) => {
      if (current && sortedReports.some((report) => report.currentdate === current)) {
        return current;
      }
      return sortedReports[0].currentdate;
    });
  }, [sortedReports]);

  const selectedChannelOption = useMemo(
    () => filteredChannelOptions.find((option) => option.key === selectedChannel) || null,
    [filteredChannelOptions, selectedChannel],
  );

  const selectedReport = useMemo(() => {
    if (!selectedChannelOption) {
      return sortedReports.find((report) => report.currentdate === selectedInspectDate) || sortedReports[0] || null;
    }

    return (
      sortedReports.find(
        (report) => report.currentdate === selectedInspectDate && report.deviceno === selectedChannelOption.deviceNo,
      ) || null
    );
  }, [selectedChannelOption, selectedInspectDate, sortedReports]);

  const reportDates = useMemo(
    () =>
      [...new Set(sortedReports.map((report) => report.currentdate))].sort(
        (a, b) => parseYYMMDDToDate(a).getTime() - parseYYMMDDToDate(b).getTime(),
      ),
    [sortedReports],
  );

  const aggregatedRows = useMemo<AggregatedRow[]>(() => {
    const rowMap = new Map<string, AggregatedRow>();

    sortedReports.forEach((report) => {
      filteredChannelOptions.forEach(({ deviceNo, channelKey, label }) => {
        if (report.deviceno !== deviceNo) {
          return;
        }
        const channel = report[channelKey] as ChannelSummary | undefined;
        if (!channel) {
          return;
        }

        SHIFT_VALUE_OPTIONS.forEach((shift) => {
          const summary = channel[shift];
          if (!summary) {
            return;
          }

          const rowKey = `${report.deviceno}:${channelKey}-${shift}`;
          const existing = rowMap.get(rowKey) || {
            key: rowKey,
            deviceNo: report.deviceno,
            channelKey,
            machineName: channel.channel_name || label || channelKey.toUpperCase(),
            shift,
            days: 0,
            runtimeByDate: {},
          };

          existing.days += 1;
          existing.runtimeByDate[report.currentdate] = summary.run_time;
          rowMap.set(rowKey, existing);
        });
      });
    });

    return [...rowMap.values()].sort((a, b) => a.machineName.localeCompare(b.machineName));
  }, [filteredChannelOptions, sortedReports]);

  const shiftRows = useMemo(() => {
    if (selectedShift === "both") {
      return aggregatedRows;
    }

    return aggregatedRows.filter((row) => row.shift === selectedShift);
  }, [aggregatedRows, selectedShift]);

  const summaryStats = useMemo(() => {
    const totalRunTime = shiftRows.reduce(
      (sum, row) => sum + Object.values(row.runtimeByDate).reduce((rowSum, value) => rowSum + value, 0),
      0,
    );

    return {
      totalRunTime,
      totalDates: reportDates.length,
      totalMachines: shiftRows.length,
    };
  }, [reportDates.length, shiftRows]);

  const runtimeChartRows = useMemo(
    () =>
      reportDates.map((date) => {
        const rowsWithData = shiftRows.filter((row) => date in row.runtimeByDate);
        const totalRuntimeMinutes = rowsWithData.reduce((sum, row) => sum + (row.runtimeByDate[date] || 0), 0);
        const averageRuntimeMinutes = rowsWithData.length > 0 ? totalRuntimeMinutes / rowsWithData.length : 0;

        return {
          date,
          totalRuntimeMinutes,
          averageRuntimeMinutes,
          machineCount: rowsWithData.length,
        };
      }),
    [reportDates, shiftRows],
  );

  const runtimeSumChart = useMemo(() => {
    const categories = runtimeChartRows.map((row) => formatDisplayDate(row.date));
    const runtimeHours = runtimeChartRows.map((row) =>
      Number(
        (
          (runtimeChartViewMode === "sum" ? row.totalRuntimeMinutes : row.averageRuntimeMinutes) / 60
        ).toFixed(2),
      ),
    );

    let trendLine: number[] = [];
    if (runtimeHours.length >= 2) {
      const n = runtimeHours.length;
      const xValues = runtimeHours.map((_, index) => index);
      const sumX = xValues.reduce((sum, value) => sum + value, 0);
      const sumY = runtimeHours.reduce((sum, value) => sum + value, 0);
      const sumXY = xValues.reduce((sum, value, index) => sum + value * runtimeHours[index], 0);
      const sumXX = xValues.reduce((sum, value) => sum + value * value, 0);
      const denominator = n * sumXX - sumX * sumX;

      if (denominator !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        trendLine = xValues.map((value) => Number((slope * value + intercept).toFixed(2)));
      }
    }

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
      colors: ["#111827", "#2563EB"],
      xaxis: {
        categories,
        labels: {
          rotate: -35,
        },
      },
      yaxis: {
        title: {
          text: runtimeChartViewMode === "sum" ? "Runtime Sum (Hours)" : "Runtime Average (Hours)",
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

    const series = [
      {
        name: runtimeChartViewMode === "sum" ? "Total Runtime" : "Average Runtime",
        data: runtimeHours,
      },
      {
        name: "Trend Line",
        data: trendLine.length === runtimeHours.length ? trendLine : runtimeHours,
      },
    ];

    return { options, series };
  }, [runtimeChartRows, runtimeChartViewMode]);

  const handleMachineFilter = (machine: string) => {
    setMachineFilterTouched(true);
    setSelectedMachines((current) =>
      current.includes(machine) ? current.filter((item) => item !== machine) : [...current, machine],
    );
  };

  const handleSelectAllMachines = () => {
    setMachineFilterTouched(true);
    setSelectedMachines(availableMachines);
  };

  const handleDeselectAllMachines = () => {
    setMachineFilterTouched(true);
    setSelectedMachines([]);
  };

  const clearFilters = () => {
    setMachineFilterTouched(true);
    setSelectedShift("morning");
    setSelectedMachines(availableMachines);
  };

  const selectedOfftime = useMemo(() => {
    if (selectedShift === "both") {
      return null;
    }
    if (!selectedChannelOption) {
      return null;
    }

    return (
      selectedReport?.offtime?.results?.find(
        (item) => item.channel === selectedChannelOption.channelKey && item.shift === selectedShift,
      ) || null
    );
  }, [selectedChannelOption, selectedReport, selectedShift]);

  const thresholdPayload = selectedReport?.thresholdGraph || selectedReport?.["threshold graph"] || null;
  const selectedThresholdChannel = selectedChannelOption
    ? thresholdPayload?.channels?.[selectedChannelOption.channelKey] || null
    : null;
  const selectedGraphPoints = selectedShift === "both" ? [] : selectedThresholdChannel?.points?.[selectedShift] || [];
  const selectedGraphStartTime = selectedShift === "both" ? null : selectedThresholdChannel?.startTime?.[selectedShift] || null;
  const selectedChannelSetting =
    selectedChannelOption &&
    deviceSettingsMap[selectedChannelOption.deviceNo] &&
    typeof deviceSettingsMap[selectedChannelOption.deviceNo][selectedChannelOption.channelKey] === "object"
      ? (deviceSettingsMap[selectedChannelOption.deviceNo][selectedChannelOption.channelKey] as Record<string, unknown>)
      : {};
  const selectedChannelData = selectedChannelOption
    ? (selectedReport?.[selectedChannelOption.channelKey] as ChannelSummary | undefined)
    : undefined;
  const selectedShiftSummary = selectedShift === "both" ? null : selectedChannelData?.[selectedShift] || null;

  const modeLabel = filterMode === "week"
    ? `Week ${selectedWeek} of ${selectedMonth}`
    : filterMode === "month"
      ? `Month ${selectedMonth}`
      : "Custom Range";

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">Runtime Report</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            View week-of-month, month-wise, or custom range data from `shiftwise_data_v2`.
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
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Display Mode
            </label>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Month
              </label>
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
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Month
                </label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Week of Month
                </label>
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
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  End Date
                </label>
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
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Shift
            </label>
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

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Machine Filter
            </label>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Selected {selectedMachines.length} of {availableMachines.length}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllMachines}
                  className="text-xs font-medium text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllMachines}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Deselect All
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableMachines.map((machine) => (
                <button
                  key={machine}
                  type="button"
                  onClick={() => handleMachineFilter(machine)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                    selectedMachines.includes(machine)
                      ? "bg-gray-900 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  }`}
                >
                  {machine}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
            >
              Clear Filters
            </button>
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
          No runtime report records were found for the available devices in this range.
        </div>
      ) : null}

      {!loading && sortedReports.length > 0 ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-sm text-gray-500 dark:text-gray-400">Range</p>
            <p className="mt-2 text-lg font-semibold text-black dark:text-white">
              {formatRangeLabel(range.startDate, range.endDate)}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{modeLabel}</p>
          </div>
          <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-sm text-gray-500 dark:text-gray-400">Selected Shift</p>
            <p className="mt-2 text-lg font-semibold text-black dark:text-white">
              {selectedShift === "both" ? "Both" : selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)}
            </p>
          </div>
          <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-sm text-gray-500 dark:text-gray-400">Dates Covered</p>
            <p className="mt-2 text-lg font-semibold text-black dark:text-white">{summaryStats.totalDates}</p>
          </div>
          <div className="rounded border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Run Time</p>
            <p className="mt-2 text-lg font-semibold text-black dark:text-white">{formatMinutes(summaryStats.totalRunTime)}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Rows: {summaryStats.totalMachines} across {deviceNumbers.length} devices</p>
              </div>
        </div>
      ) : null}

      {!loading && sortedReports.length > 0 ? (
        <>
          <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-black dark:text-white">Range Summary</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Date-wise runtime for each machine in the selected range and shift.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredChannelOptions.map((option) => {
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSelectedChannel(option.key)}
                      className={`rounded-full px-3 py-2 text-sm font-medium ${
                        selectedChannel === option.key
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Machine</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Days</th>
                    {reportDates.map((date) => (
                      <th
                        key={date}
                        className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                      >
                        {formatDisplayDate(date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftRows.map((row) => (
                    <tr
                      key={`${row.key}-${row.shift}`}
                      className={`border-b border-stroke text-sm dark:border-strokedark ${
                        selectedChannel === `${row.deviceNo}:${row.channelKey}` ? "bg-blue-50/70 dark:bg-blue-500/10" : ""
                      }`}
                    >
                      <td className="px-3 py-3 font-medium text-black dark:text-white">{row.machineName}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{row.days}</td>
                      {reportDates.map((date) => (
                        <td key={`${row.key}-${date}`} className="px-3 py-3 text-gray-700 dark:text-gray-300">
                          {date in row.runtimeByDate ? formatMinutes(row.runtimeByDate[date]) : "-"}
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
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">Runtime Trend</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {runtimeChartViewMode === "sum"
                      ? "Total runtime of all selected machine-shift rows by date, shown in hours."
                      : "Average runtime per selected machine-shift row by date, shown in hours."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {CHART_VIEW_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setRuntimeChartViewMode(mode)}
                      className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                        runtimeChartViewMode === mode
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {mode === "sum" ? "Sum" : "Average"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {runtimeChartViewMode === "sum" ? "Runtime Sum (Hours)" : "Runtime Average (Hours)"}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Rows Used</th>
                  </tr>
                </thead>
                <tbody>
                  {runtimeChartRows.map((row) => (
                    <tr key={row.date} className="border-b border-stroke text-sm dark:border-strokedark">
                      <td className="px-3 py-3 font-medium text-black dark:text-white">{formatDisplayDate(row.date)}</td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                        {(
                          (runtimeChartViewMode === "sum" ? row.totalRuntimeMinutes : row.averageRuntimeMinutes) / 60
                        ).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{row.machineCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {runtimeChartRows.length > 0 ? (
              <div className="mt-6 overflow-hidden rounded border border-stroke p-3 dark:border-strokedark">
                <ReactApexChart
                  options={runtimeSumChart.options}
                  series={runtimeSumChart.series}
                  type="line"
                  height={320}
                />
              </div>
            ) : null}
          </div>

          <div className="mb-6 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
              <div>
                <h3 className="text-lg font-semibold text-black dark:text-white">Inspect Specific Date</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Range summary stays aggregated. Graph and off-time below will show the selected day.
                </p>
              </div>
              <div>
                <select
                  value={selectedInspectDate}
                  onChange={(event) => setSelectedInspectDate(event.target.value)}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                >
                  {sortedReports.map((report) => (
                    <option key={report._id} value={report.currentdate}>
                      {formatDisplayDate(report.currentdate)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">Threshold Graph</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedThresholdChannel?.machineName || selectedChannelOption?.label || "-"} | {selectedShift === "both" ? "Select Morning or Night" : selectedShift} | {selectedReport ? formatDisplayDate(selectedReport.currentdate) : "-"}
                  </p>
                </div>
                {selectedShiftSummary ? (
                  <div className="rounded border border-stroke px-3 py-2 text-xs text-gray-600 dark:border-strokedark dark:text-gray-300">
                    Shift Time {selectedShiftSummary.shift_time} | Value Sum {selectedShiftSummary.value_sum.toFixed(2)}
                  </div>
                ) : null}
              </div>

              {selectedShift === "both" ? (
                <div className="rounded border border-dashed border-stroke px-4 py-10 text-center text-sm text-gray-500 dark:border-strokedark dark:text-gray-400">
                  Select `Morning` or `Night` to inspect the threshold graph.
                </div>
              ) : selectedChannelOption && selectedReport && selectedGraphPoints.length > 0 ? (
                <ThresholdGraph
                  deviceNo={selectedChannelOption.deviceNo}
                  channelKey={selectedChannelOption.channelKey}
                  dateShift={`${selectedReport.currentdate} ${selectedShift}`}
                  backendSetting={selectedChannelSetting}
                  preloadedGraphData={selectedGraphPoints}
                  preloadedStartTime={selectedGraphStartTime}
                  onSettingsChange={() => {
                    // Read-only on report page.
                  }}
                />
              ) : (
                <div className="rounded border border-dashed border-stroke px-4 py-10 text-center text-sm text-gray-500 dark:border-strokedark dark:text-gray-400">
                  No threshold graph payload is available for this machine and selected day.
                </div>
              )}
            </div>

            <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
              <h3 className="text-lg font-semibold text-black dark:text-white">Selected Day Details</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded border border-stroke bg-gray-50 p-4 dark:border-strokedark dark:bg-white/5">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Date</p>
                  <p className="mt-1 font-semibold text-black dark:text-white">
                    {selectedReport ? formatDisplayDate(selectedReport.currentdate) : "-"}
                  </p>
                </div>
                <div className="rounded border border-stroke bg-gray-50 p-4 dark:border-strokedark dark:bg-white/5">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Machine</p>
                  <p className="mt-1 font-semibold text-black dark:text-white">
                  {selectedChannelOption?.label || "-"}
                  </p>
                </div>
                <div className="rounded border border-stroke bg-gray-50 p-4 dark:border-strokedark dark:bg-white/5">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Run Time</p>
                  <p className="mt-1 font-semibold text-black dark:text-white">
                    {selectedShiftSummary ? formatMinutes(selectedShiftSummary.run_time) : "-"}
                  </p>
                </div>
                <div className="rounded border border-stroke bg-gray-50 p-4 dark:border-strokedark dark:bg-white/5">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Working Time</p>
                  <p className="mt-1 font-semibold text-black dark:text-white">
                    {selectedShiftSummary ? formatMinutes(selectedShiftSummary.working_time) : "-"}
                  </p>
                </div>
                <div className="rounded border border-stroke bg-gray-50 p-4 dark:border-strokedark dark:bg-white/5">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Average</p>
                  <p className="mt-1 font-semibold text-black dark:text-white">
                    {selectedShiftSummary ? selectedShiftSummary.average.toFixed(2) : "-"}
                  </p>
                </div>
                <div className="rounded border border-stroke bg-gray-50 p-4 dark:border-strokedark dark:bg-white/5">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Average Threshold</p>
                  <p className="mt-1 font-semibold text-black dark:text-white">
                    {selectedShiftSummary ? selectedShiftSummary.average_threshold.toFixed(2) : "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-black dark:text-white">Off-Time Analysis</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedChannelOption?.label || "-"} | {selectedShift === "both" ? "Select Morning or Night" : selectedShift} | {selectedReport ? formatDisplayDate(selectedReport.currentdate) : "-"}
                </p>
              </div>
              {selectedOfftime ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-red-50 px-3 py-1 font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                    Count {selectedOfftime.count}
                  </span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">
                    Total {selectedOfftime.totalDuration}
                  </span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">
                    Periods {selectedOfftime.totalPeriods}
                  </span>
                </div>
              ) : null}
            </div>

            {selectedShift === "both" ? (
              <div className="rounded border border-dashed border-stroke px-4 py-10 text-center text-sm text-gray-500 dark:border-strokedark dark:text-gray-400">
                Select `Morning` or `Night` to inspect off-time periods.
              </div>
            ) : selectedOfftime && selectedOfftime.periods.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Start</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">End</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Duration</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOfftime.periods.map((period, index) => (
                      <tr key={`${period.time}-${period.endtime}-${index}`} className="border-b border-stroke text-sm dark:border-strokedark">
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{period.date}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{period.time}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{period.endtime}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{period.timediff}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                            {period.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded border border-dashed border-stroke px-4 py-10 text-center text-sm text-gray-500 dark:border-strokedark dark:text-gray-400">
                No off-time periods matched this machine and selected day.
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
