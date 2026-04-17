"use client";

import React, { useEffect, useMemo, useState } from "react";

type DeviceDataDoc = {
  _id?: string;
  deviceno?: number;
  date?: string;
  time?: string;
  longtime?: number;
  messageType?: string;
  [key: string]: string | number | undefined;
};

type DeviceDataTablePageProps = {
  title: string;
};

type ServerOption = "server1" | "server2";

type DeviceTestStatus = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
  latestAt: string | null;
};

type DeviceTestResult = {
  deviceNo: string;
  checkedRecords: number;
  checkedAtLabel: string;
  statuses: DeviceTestStatus[];
};

const DEVICE_DATA_SEARCH_STORAGE_KEY = "factory-genie-device-data-search";
const DEVICE_DATA_SERVER_STORAGE_KEY = "factory-genie-device-data-server";
const DEFAULT_SERVER: ServerOption = "server2";

function normalizeDeviceIdentifier(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;

  const hexOnly = trimmed.replace(/[^0-9a-fA-F]/g, "");
  if (hexOnly.length === 12 && /^[0-9a-fA-F]{12}$/.test(hexOnly)) {
    return String(parseInt(hexOnly, 16));
  }

  return null;
}

export default function DeviceDataTablePage({ title }: DeviceDataTablePageProps) {
  const [items, setItems] = useState<DeviceDataDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<DeviceTestResult | null>(null);

  const [deviceNo, setDeviceNo] = useState<string>("");
  const [limit, setLimit] = useState<number>(50);
  const [page, setPage] = useState<number>(1);
  const [server, setServer] = useState<ServerOption>(DEFAULT_SERVER);

  const normalizedDeviceNo = normalizeDeviceIdentifier(deviceNo);
  const hasInvalidDeviceNo = deviceNo.trim().length > 0 && normalizedDeviceNo === null;
  const issueStatuses = testResult?.statuses.filter((status) => !status.ok) ?? [];

  const fetchData = async () => {
    if (hasInvalidDeviceNo) {
      setError("Device No must be a single integer value");
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (normalizedDeviceNo) params.set("deviceNo", normalizedDeviceNo);
      params.set("limit", String(limit));
      params.set("page", String(page));
      params.set("server", server);

      const resp = await fetch(`/api/factory-genie/devicedatas?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to fetch devicedatas");
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Unexpected error";
      setError(errorMessage);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const runDeviceTest = async () => {
    if (!normalizedDeviceNo) {
      setTestError("Enter a valid device number or MAC address before testing");
      setTestResult(null);
      return;
    }

    setTestLoading(true);
    setTestError(null);
    try {
      const params = new URLSearchParams({ deviceNo: normalizedDeviceNo, server });
      const resp = await fetch(`/api/factory-genie/device-testing?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await resp.json();
      if (!resp.ok) {
        throw new Error(json?.error || "Failed to test device");
      }
      setTestResult(json);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Unexpected error";
      setTestError(errorMessage);
      setTestResult(null);
    } finally {
      setTestLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSearch = localStorage.getItem(DEVICE_DATA_SEARCH_STORAGE_KEY);
      if (savedSearch) {
        setDeviceNo((prev) => prev || savedSearch);
        return;
      }

      const direct = localStorage.getItem("deviceNo");
      if (direct && normalizeDeviceIdentifier(direct)) {
        setDeviceNo((prev) => prev || direct);
      }

      const savedServer = localStorage.getItem(DEVICE_DATA_SERVER_STORAGE_KEY);
      setServer(savedServer === "server1" || savedServer === "server2" ? savedServer : DEFAULT_SERVER);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const trimmedValue = deviceNo.trim();
    if (trimmedValue) {
      localStorage.setItem(DEVICE_DATA_SEARCH_STORAGE_KEY, deviceNo);
    } else {
      localStorage.removeItem(DEVICE_DATA_SEARCH_STORAGE_KEY);
    }
  }, [deviceNo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(DEVICE_DATA_SERVER_STORAGE_KEY, server);
  }, [server]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, server]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 15000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, deviceNo, server]);

  const columns = useMemo(() => {
    const first = items[0] || {};
    const baseOrder = ["deviceno", "date", "time"];
    const channelOrder = ["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "ch8"];
    const afterChannels = ["longtime"];
    const lastColumns = ["__v", "_copiedAt", "_originalId"];
    const keys = Object.keys(first).filter((k) => k !== "_id");

    keys.sort((a, b) => {
      const aIsLast = lastColumns.includes(a);
      const bIsLast = lastColumns.includes(b);
      if (aIsLast && bIsLast) return lastColumns.indexOf(a) - lastColumns.indexOf(b);
      if (aIsLast) return 1;
      if (bIsLast) return -1;

      const ai = baseOrder.indexOf(a);
      const bi = baseOrder.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;

      const aIsChannel = /^ch[1-8]$/.test(a);
      const bIsChannel = /^ch[1-8]$/.test(b);
      if (aIsChannel && bIsChannel) return channelOrder.indexOf(a) - channelOrder.indexOf(b);
      if (aIsChannel) return afterChannels.includes(b) ? -1 : -1;
      if (bIsChannel) return afterChannels.includes(a) ? 1 : 1;

      const aAfter = afterChannels.indexOf(a);
      const bAfter = afterChannels.indexOf(b);
      if (aAfter !== -1 && bAfter !== -1) return aAfter - bAfter;
      if (aAfter !== -1) return -1;
      if (bAfter !== -1) return 1;

      return a.localeCompare(b);
    });

    return keys;
  }, [items]);

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{title}</h2>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Device No</label>
          <input
            value={deviceNo}
            onChange={(e) => setDeviceNo(e.target.value)}
            placeholder="e.g. 25 or 0C:DC:7E:48:D1:C8"
            className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark"
          />
          {normalizedDeviceNo && normalizedDeviceNo !== deviceNo.trim() && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Using device no: {normalizedDeviceNo}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Server</label>
          <select
            value={server}
            onChange={(e) => {
              setPage(1);
              setServer(e.target.value as ServerOption);
            }}
            className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark"
          >
            <option value="server1">Server 1 - MONGODB_CNC_URI</option>
            <option value="server2">Server 2 - MONGODB_FACTORY_GENIE_LIVE_STATUS_URI</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400">Limit</label>
          <select
            value={limit}
            onChange={(e) => {
              setPage(1);
              setLimit(parseInt(e.target.value, 10));
            }}
            className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark"
          >
            {[25, 50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3 md:col-span-2">
          <button
            onClick={runDeviceTest}
            className="rounded bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            disabled={testLoading || hasInvalidDeviceNo}
          >
            {testLoading ? "Testing..." : "Test"}
          </button>
          <button
            onClick={() => {
              setPage(1);
              fetchData();
            }}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            disabled={loading || hasInvalidDeviceNo}
          >
            {loading ? "Loading..." : "Load"}
          </button>
          <button
            onClick={() => {
              setDeviceNo("");
              setPage(1);
              setLimit(50);
              setTestError(null);
              setTestResult(null);
              fetchData();
            }}
            className="rounded border border-stroke px-4 py-2 hover:bg-gray-50 dark:border-strokedark dark:hover:bg-gray-800"
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-600 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {testError && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-600 dark:bg-red-900/30 dark:text-red-200">
          {testError}
        </div>
      )}

      {testResult && (
        <div className="mb-10 rounded-lg border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="mb-4 flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-black dark:text-white">Device Test Results</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Device {testResult.deviceNo} • Checked {testResult.checkedRecords} latest records • {testResult.checkedAtLabel}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {testResult.statuses.map((status) => (
              <div
                key={status.key}
                className={`rounded-lg border p-4 ${
                  status.ok
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
                    : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-black dark:text-white">{status.label}</h4>
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold ${
                      status.ok
                        ? "bg-emerald-600 text-white"
                        : "bg-amber-600 text-white"
                    }`}
                  >
                    {status.ok ? "OK" : "Issue"}
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-200">{status.message}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-lg border border-stroke bg-gray-50 p-4 dark:border-strokedark dark:bg-black/20">
            <h4 className="mb-3 font-semibold text-black dark:text-white">Issue Details</h4>
            {issueStatuses.length === 0 ? (
              <p className="text-sm text-gray-700 dark:text-gray-200">No issues found in the current test run.</p>
            ) : (
              <div className="space-y-3">
                {issueStatuses.map((status) => (
                <div key={`${status.key}-details`} className="rounded border border-stroke bg-white p-3 dark:border-strokedark dark:bg-boxdark">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="font-medium text-black dark:text-white">{status.label}</span>
                    <span
                      className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white"
                    >
                      Issue
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{status.message}</p>
                </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-12 rounded-lg border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stroke dark:border-strokedark">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="whitespace-nowrap px-3 py-2 font-semibold text-gray-700 dark:text-gray-200">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => (
                <tr key={idx} className="border-b border-stroke last:border-0 dark:border-strokedark">
                  {columns.map((col) => {
                    const value = row[col];
                    if (/^ch[1-8]$/.test(col) && value !== undefined && value !== null && value !== "") {
                      const numValue = typeof value === "number" ? value : parseFloat(String(value));
                      if (!isNaN(numValue)) {
                        return (
                          <td key={col} className="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-200">
                            {String(numValue / 2)}
                          </td>
                        );
                      }
                    }

                    return (
                      <td key={col} className="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-200">
                        {String(value ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                    No data found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            className="rounded border border-stroke px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-strokedark dark:hover:bg-gray-800"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
          >
            Previous
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-300">Page {page}</span>
          <button
            className="rounded border border-stroke px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-strokedark dark:hover:bg-gray-800"
            onClick={() => setPage((p) => p + 1)}
            disabled={loading}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
