"use client";

import { useEffect, useMemo, useState } from "react";

type DashboardRow = {
  deviceNo: number;
  name: string;
  currentDate: string;
  source: string | null;
  currentStatus: string | null;
  health: {
    level: "healthy" | "warning" | "problem" | "unknown";
    label: string;
  };
  latestLiveTime: string | null;
  latestLiveDate: string | null;
  morningWorkingMinutes: number;
  nightWorkingMinutes: number;
  totalWorkingMinutes: number;
  morningOutMinutes: number;
  nightOutMinutes: number;
  totalOutMinutes: number;
  hasShiftData: boolean;
};

type DashboardResponse = {
  currentDate: string;
  source: string;
  summary: {
    totalDevices: number;
    healthyDevices: number;
    warningDevices: number;
    problemDevices: number;
    unknownDevices: number;
    totalWorkingMinutes: number;
    totalOutMinutes: number;
  };
  rows: DashboardRow[];
};

const formatMinutes = (minutes: number) => {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const getCurrentDateValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toApiDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${year.slice(-2)}/${month}/${day}`;
};

export default function FactoryGenieDashboardPage() {
  const [deviceNumbers, setDeviceNumbers] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getCurrentDateValue());
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const rawUser = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      let nextDeviceNumbers: number[] = [];

      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed.deviceNo) {
          if (Array.isArray(parsed.deviceNo)) {
            nextDeviceNumbers = parsed.deviceNo.map((value: number | string) => Number(value)).filter((value: number) => !Number.isNaN(value));
          } else if (typeof parsed.deviceNo === "number") {
            nextDeviceNumbers = [parsed.deviceNo];
          }
        }
      }

      const direct = typeof window !== "undefined" ? localStorage.getItem("deviceNo") : null;
      if (direct) {
        const directDevices = direct.split(",").map((d) => parseInt(d.trim(), 10)).filter((d) => !Number.isNaN(d));
        if (directDevices.length > 0) {
          nextDeviceNumbers = directDevices;
        }
      }

      setDeviceNumbers(nextDeviceNumbers);
    } catch {
      setDeviceNumbers([]);
    }
  }, []);

  const fetchDashboard = async () => {
    if (deviceNumbers.length === 0) {
      setData(null);
      setError("No device numbers found in localStorage.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        deviceNo: deviceNumbers.join(","),
        date: toApiDate(selectedDate),
      });

      const response = await fetch(`/api/factory-genie/dashboard-overview?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Failed to fetch dashboard overview");
      }

      setData(json);
    } catch (fetchError: unknown) {
      setData(null);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch dashboard overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceNumbers.length > 0) {
      fetchDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceNumbers, selectedDate]);

  useEffect(() => {
    if (deviceNumbers.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      fetchDashboard();
    }, 60000);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceNumbers, selectedDate]);

  const sortedRows = useMemo(() => {
    const rows = data?.rows || [];
    return [...rows].sort((a, b) => {
      const severityRank = { problem: 0, warning: 1, unknown: 2, healthy: 3 };
      const severityDiff = severityRank[a.health.level] - severityRank[b.health.level];
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return a.deviceNo - b.deviceNo;
    });
  }, [data]);

  const summaryCards = [
    {
      title: "Total Devices",
      value: data?.summary.totalDevices ?? 0,
      tone: "text-slate-900 dark:text-white",
      meta: "Visible on live-status scope",
    },
    {
      title: "Working Correctly",
      value: data?.summary.healthyDevices ?? 0,
      tone: "text-green-600 dark:text-green-400",
      meta: "Current ch1 status is ON",
    },
    {
      title: "Needs Attention",
      value: (data?.summary.problemDevices ?? 0) + (data?.summary.warningDevices ?? 0),
      tone: "text-amber-600 dark:text-amber-400",
      meta: "OFF / OUT / LOW machines",
    },
    {
      title: "Ch1 Work Time",
      value: formatMinutes(data?.summary.totalWorkingMinutes ?? 0),
      tone: "text-blue-600 dark:text-blue-400",
      meta: "Morning + night total",
    },
    {
      title: "Ch1 Out Time",
      value: formatMinutes(data?.summary.totalOutMinutes ?? 0),
      tone: "text-rose-600 dark:text-rose-400",
      meta: "From offtime modal payload",
    },
  ];

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Factory Genie Dashboard
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Ch1 worktime, out-time, and current health for all machines visible on live-status.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-400">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark"
            />
          </div>
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700 dark:border-red-600 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">{card.title}</p>
            <p className={`mt-3 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{card.meta}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-black dark:text-white">Device Overview</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Source selection is automatic per device. Current live status is read from live-status data.
            </p>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-stroke bg-gray-50 text-left text-gray-700 dark:border-strokedark dark:bg-gray-800 dark:text-gray-200">
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-4 py-3">Device No</th>
                  <th className="px-4 py-3">Health</th>
                  <th className="px-4 py-3">Current Ch1 Status</th>
                  <th className="px-4 py-3">Morning Work</th>
                  <th className="px-4 py-3">Morning Out</th>
                  <th className="px-4 py-3">Night Work</th>
                  <th className="px-4 py-3">Night Out</th>
                  <th className="px-4 py-3">Total Work</th>
                  <th className="px-4 py-3">Total Out</th>
                  <th className="px-4 py-3">Last Live Packet</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      No device analytics found for the selected date.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr
                      key={row.deviceNo}
                      className="border-b border-stroke last:border-b-0 dark:border-strokedark"
                    >
                      <td className="px-4 py-4">
                        <div className="font-medium text-black dark:text-white">{row.name}</div>
                        {!row.hasShiftData ? (
                          <div className="text-xs text-red-500 dark:text-red-400">No ch1 shiftwise data</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{row.deviceNo}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            row.health.level === "healthy"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : row.health.level === "warning"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                : row.health.level === "problem"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                          }`}
                        >
                          {row.health.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-medium text-black dark:text-white">{row.currentStatus || "-"}</td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{formatMinutes(row.morningWorkingMinutes)}</td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{formatMinutes(row.morningOutMinutes)}</td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{formatMinutes(row.nightWorkingMinutes)}</td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">{formatMinutes(row.nightOutMinutes)}</td>
                      <td className="px-4 py-4 font-medium text-blue-600 dark:text-blue-400">{formatMinutes(row.totalWorkingMinutes)}</td>
                      <td className="px-4 py-4 font-medium text-rose-600 dark:text-rose-400">{formatMinutes(row.totalOutMinutes)}</td>
                      <td className="px-4 py-4 text-gray-700 dark:text-gray-300">
                        {row.latestLiveDate && row.latestLiveTime ? `${row.latestLiveDate} ${row.latestLiveTime}` : "-"}
                      </td>
                      <td className="px-4 py-4 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {row.source || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
