"use client";

import { useState, useEffect, useMemo } from "react";

type ChannelKey = `ch${number}`;

interface ChannelSettings {
  Name?: string;
  Display_Sequence?: number | "";
  Morning_shift_start?: string;
  Morning_shift_end?: string;
  Morning_shift_duration?: string;
  Night_shift_start?: string;
  Night_shift_end?: string;
  Night_shift_duration?: string;
  ON_Threshold?: number;
  LOW_Effeciency_Threshold?: number;
  Peak_value?: number;
}

type DeviceSettingsDoc = Record<string, unknown>;
type SaveState = "idle" | "saving" | "success" | "error";
type RowSaveStatus = {
  state: SaveState;
  message?: string;
};

const CHANNEL_KEY_PATTERN = /^ch\d+$/i;

const isChannelKey = (value: string): value is ChannelKey => CHANNEL_KEY_PATTERN.test(value);

const getChannelEntries = (deviceSettings: DeviceSettingsDoc) =>
  Object.entries(deviceSettings)
    .filter(([key, value]) => isChannelKey(key) && value && typeof value === "object")
    .sort(([a], [b]) => Number(a.slice(2)) - Number(b.slice(2)))
    .map(([key, value]) => [key as ChannelKey, value as ChannelSettings] as const);

const parseIntegerInput = (value: string) => {
  if (value === "") {
    return "";
  }

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : "";
};

const DEVICE_SETTINGS_API_BASE = "/api/factory-genie/live-status/device-settings";

export default function MachineSettingsPage() {
  const [deviceNumbers, setDeviceNumbers] = useState<number[]>([]);
  const [settings, setSettings] = useState<Record<number, DeviceSettingsDoc>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [rowSaveStatuses, setRowSaveStatuses] = useState<Record<string, RowSaveStatus>>({});

  useEffect(() => {
    try {
      const rawUser = typeof window !== "undefined" ? localStorage.getItem("user") : null;
      let deviceNumbers: number[] = [];
      
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed.deviceNo) {
          if (Array.isArray(parsed.deviceNo) && parsed.deviceNo.length > 0) {
            deviceNumbers = parsed.deviceNo;
          } else if (typeof parsed.deviceNo === "number") {
            deviceNumbers = [parsed.deviceNo];
          }
        }
      }
      
      const direct = typeof window !== "undefined" ? localStorage.getItem("deviceNo") : null;
      if (direct) {
        // Handle comma-separated device numbers
        const directDevices = direct.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d));
        if (directDevices.length > 0) {
          deviceNumbers = directDevices;
        }
      }
      
      
      console.log('Machine Settings - Raw user localStorage:', rawUser);
      console.log('Machine Settings - Direct deviceNo localStorage:', direct);
      console.log('Machine Settings - Final device numbers:', deviceNumbers);
      console.log('Machine Settings - Device count:', deviceNumbers.length);
      setDeviceNumbers(deviceNumbers);
    } catch {
      console.log('Machine Settings - Error loading device numbers, using empty array');
      setDeviceNumbers([]);
    }
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      if (deviceNumbers.length === 0) {
        setLoading(false);
        setError("No device numbers found in localStorage");
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        const settingsMap: Record<number, DeviceSettingsDoc> = {};
        
        // Load settings for all devices in parallel
        const promises = deviceNumbers.map(async (deviceNo) => {
          try {
            const resp = await fetch(`${DEVICE_SETTINGS_API_BASE}/${deviceNo}`);
            const json = await resp.json();
            if (resp.ok) {
              const doc = Array.isArray(json.data) ? json.data[0] : json;
              if (doc) {
                return { deviceNo, doc };
              }
            }
            return null;
          } catch (error) {
            console.warn(`Failed to load settings for device ${deviceNo}:`, error);
            return null;
          }
        });
        
        const results = await Promise.all(promises);
        
        results.forEach((result) => {
          if (result) {
            settingsMap[result.deviceNo] = result.doc;
          }
        });
        
        setSettings(settingsMap);
        
        if (Object.keys(settingsMap).length === 0) {
          setError("No device settings found for any of the user's devices");
        }
      } catch {
        setError("Network error while loading device settings");
        setSettings({});
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, [deviceNumbers]);

  const rows = useMemo(() => {
    const allRows: Array<{ key: ChannelKey; value: ChannelSettings; deviceNo: number }> = [];
    
    // Get data from all devices
    Object.entries(settings).forEach(([deviceNoStr, deviceSettings]) => {
      const deviceNo = parseInt(deviceNoStr, 10);
      if (deviceSettings) {
        getChannelEntries(deviceSettings).forEach(([k, channelData]) => {
          if (channelData && Object.keys(channelData).length > 0) {
            allRows.push({ key: k, value: channelData, deviceNo });
          }
        });
      }
    });
    
    return allRows;
  }, [settings]);

  const calculateDuration = (start?: string, end?: string) => {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":" ).map((n) => parseInt(n, 10));
    const [eh, em] = end.split(":" ).map((n) => parseInt(n, 10));
    const startMinutes = sh * 60 + sm;
    let endMinutes = eh * 60 + em;
    
    // Handle night shifts that cross midnight (end time is earlier than start time)
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60; // Add 24 hours (1440 minutes)
    }
    
    const diff = endMinutes - startMinutes;
    const hh = Math.floor(diff / 60).toString().padStart(2, "0");
    const mm = (diff % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const getRowSaveKey = (deviceNo: number, channel: ChannelKey) => `${deviceNo}-${channel}`;

  const handleFieldChange = (ch: ChannelKey, field: keyof ChannelSettings, value: string | number, deviceNo: number) => {
    setSettings((prev) => {
      if (!prev[deviceNo]) return prev;
      const currentChannel = prev[deviceNo][ch] as ChannelSettings;
      const updatedChannel = { ...currentChannel, [field]: value };
      const next = { ...prev, [deviceNo]: { ...prev[deviceNo], [ch]: updatedChannel } };
      return next;
    });
    const rowSaveKey = getRowSaveKey(deviceNo, ch);
    setRowSaveStatuses((prev) => ({
      ...prev,
      [rowSaveKey]: { state: "idle" },
    }));
  };

  const handleSave = async (ch: ChannelKey, deviceNo: number) => {
    if (!settings[deviceNo]) return;
    const rowSaveKey = getRowSaveKey(deviceNo, ch);
    setRowSaveStatuses((prev) => ({
      ...prev,
      [rowSaveKey]: { state: "saving", message: "Saving..." },
    }));

    try {
      const chData = settings[deviceNo][ch] as ChannelSettings;
      const updates: Record<string, unknown> = { ...chData };
      updates.Morning_shift_duration = calculateDuration(chData.Morning_shift_start, chData.Morning_shift_end);
      updates.Night_shift_duration = calculateDuration(chData.Night_shift_start, chData.Night_shift_end);
      // Include Name field in updates
      if (chData.Name) {
        updates.Name = chData.Name;
      }
      const resp = await fetch(`${DEVICE_SETTINGS_API_BASE}/${deviceNo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: ch, updates })
      });
      if (!resp.ok) {
        const js = await resp.json();
        setRowSaveStatuses((prev) => ({
          ...prev,
          [rowSaveKey]: { state: "error", message: js?.error || "Failed to save. Please try later." },
        }));
        alert(js?.error || 'Failed to save. Please try later.');
        return;
      }

      setRowSaveStatuses((prev) => ({
        ...prev,
        [rowSaveKey]: { state: "success", message: "Saved successfully" },
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to save. Please try later.';
      setRowSaveStatuses((prev) => ({
        ...prev,
        [rowSaveKey]: { state: "error", message },
      }));
      alert(e instanceof Error ? e.message : 'Failed to save. Please try later.');
    }
  };

  const handleSaveAll = async () => {
    if (rows.length === 0) {
      alert('No settings to save');
      return;
    }

    setSavingAll(true);
    const errors: string[] = [];
    let successCount = 0;

    try {
      // Save all channels for all devices
      const savePromises = rows.map(async (row) => {
        try {
          if (!settings[row.deviceNo]) return;
          const chData = settings[row.deviceNo][row.key] as ChannelSettings;
          const updates: Record<string, unknown> = { ...chData };
          updates.Morning_shift_duration = calculateDuration(chData.Morning_shift_start, chData.Morning_shift_end);
          updates.Night_shift_duration = calculateDuration(chData.Night_shift_start, chData.Night_shift_end);
          // Include Name field in updates
          if (chData.Name) {
            updates.Name = chData.Name;
          }
          const resp = await fetch(`${DEVICE_SETTINGS_API_BASE}/${row.deviceNo}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: row.key, updates })
          });
          if (!resp.ok) {
            const js = await resp.json();
            errors.push(`Device ${row.deviceNo} ${row.key}: ${js?.error || 'Failed to save. Please try later.'}`);
          } else {
            successCount++;
          }
        } catch (e: unknown) {
          errors.push(`Device ${row.deviceNo} ${row.key}: ${e instanceof Error ? e.message : 'Failed to save. Please try later.'}`);
        }
      });

      await Promise.all(savePromises);

      if (errors.length === 0) {
        alert(`Successfully saved all ${successCount} channel settings!`);
      } else {
        alert(`Saved ${successCount} channels successfully. ${errors.length} errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n... and ${errors.length - 5} more errors` : ''}`);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save all settings. Please try later.');
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">Machine Settings</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing settings for {deviceNumbers.length} device(s): {deviceNumbers.join(", ")}
          </div>
          {rows.length > 0 && (
            <button
              onClick={handleSaveAll}
              disabled={savingAll || loading}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {savingAll ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <span>💾 Save All</span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6.5 py-4 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            Device Settings - All Devices
          </h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 dark:text-red-400">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-gray-600 dark:text-gray-300">No channel settings found.</div>
        ) : (
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stroke bg-gray-50 text-left text-gray-700 dark:border-strokedark dark:bg-gray-800 dark:text-gray-200">
                  <th className="px-3 py-3">Device</th>
                  <th className="px-3 py-3">Channel</th>
                  <th className="px-3 py-3 w-[120px] min-w-[120px]">Display Sequence</th>
                  <th className="px-3 py-3 w-[240px] min-w-[240px]">Name</th>
                  <th className="px-3 py-3 w-[120px] min-w-[120px]">Morning Start</th>
                  <th className="px-3 py-3 w-[120px] min-w-[120px]">Morning End</th>
                  <th className="px-3 py-3 w-[120px] min-w-[120px]">Morning Duration</th>
                  <th className="px-3 py-3 w-[120px] min-w-[120px]">Night Start</th>
                  <th className="px-3 py-3 w-[120px] min-w-[120px]">Night End</th>
                  <th className="px-3 py-3 w-[120px] min-w-[120px]">Night Duration</th>
                  <th className="px-3 py-3 w-[100px] min-w-[100px]">ON Threshold</th>
                  <th className="px-3 py-3 w-[100px] min-w-[100px]">LOW Threshold</th>
                  <th className="px-3 py-3 w-[100px] min-w-[100px]">Peak Value</th>
                  <th className="px-3 py-3 w-[80px] min-w-[80px]">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.deviceNo}-${row.key}`} className="border-b border-stroke hover:bg-gray-50 dark:border-strokedark dark:hover:bg-gray-800">
                    <td className="px-3 py-4 font-medium text-black dark:text-white">Device {row.deviceNo}</td>
                    <td className="px-3 py-4 font-medium text-black dark:text-white">{row.key.toUpperCase()}</td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="number"
                        value={row.value.Display_Sequence ?? ""}
                        onChange={(e) =>
                          handleFieldChange(
                            row.key,
                            "Display_Sequence",
                            parseIntegerInput(e.target.value),
                            row.deviceNo,
                          )
                        }
                        step="1"
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                        placeholder="Auto"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="text"
                        value={row.value.Name || ""}
                        onChange={(e) => handleFieldChange(row.key, "Name", e.target.value, row.deviceNo)}
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                        placeholder="Machine Name"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="time"
                        value={row.value.Morning_shift_start || ""}
                        onChange={(e) => handleFieldChange(row.key, "Morning_shift_start", e.target.value, row.deviceNo)}
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="time"
                        value={row.value.Morning_shift_end || ""}
                        onChange={(e) => handleFieldChange(row.key, "Morning_shift_end", e.target.value, row.deviceNo)}
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="text"
                        value={row.value.Morning_shift_duration || ""}
                        readOnly
                        className="w-full rounded border border-stroke bg-gray-100 px-3 py-2 text-black outline-none dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="time"
                        value={row.value.Night_shift_start || ""}
                        onChange={(e) => handleFieldChange(row.key, "Night_shift_start", e.target.value, row.deviceNo)}
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="time"
                        value={row.value.Night_shift_end || ""}
                        onChange={(e) => handleFieldChange(row.key, "Night_shift_end", e.target.value, row.deviceNo)}
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="text"
                        value={row.value.Night_shift_duration || ""}
                        readOnly
                        className="w-full rounded border border-stroke bg-gray-100 px-3 py-2 text-black outline-none dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="number"
                        value={row.value.ON_Threshold ?? ""}
                        onChange={(e) => handleFieldChange(row.key, "ON_Threshold", parseFloat(e.target.value), row.deviceNo)}
                        step="0.1"
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="number"
                        value={row.value.LOW_Effeciency_Threshold ?? ""}
                        onChange={(e) => handleFieldChange(row.key, "LOW_Effeciency_Threshold", parseFloat(e.target.value), row.deviceNo)}
                        step="0.1"
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4 text-gray-700 dark:text-gray-300">
                      <input
                        type="number"
                        value={row.value.Peak_value ?? ""}
                        onChange={(e) => handleFieldChange(row.key, "Peak_value", parseFloat(e.target.value), row.deviceNo)}
                        step="0.1"
                        className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-4">
                      {(() => {
                        const rowSaveStatus = rowSaveStatuses[getRowSaveKey(row.deviceNo, row.key)];
                        const isSavingRow = rowSaveStatus?.state === "saving";
                        const isSuccessRow = rowSaveStatus?.state === "success";
                        const isErrorRow = rowSaveStatus?.state === "error";

                        return (
                          <div className="flex min-w-[110px] flex-col items-start gap-2">
                            <button
                              onClick={() => handleSave(row.key, row.deviceNo)}
                              disabled={isSavingRow || savingAll}
                              className="rounded bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:cursor-not-allowed disabled:bg-gray-400"
                            >
                              {isSavingRow ? "Saving..." : "Save"}
                            </button>
                            {rowSaveStatus?.message ? (
                              <span
                                className={`text-xs ${
                                  isSuccessRow
                                    ? "text-green-600 dark:text-green-400"
                                    : isErrorRow
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-gray-500 dark:text-gray-400"
                                }`}
                              >
                                {rowSaveStatus.message}
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
