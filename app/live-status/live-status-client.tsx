"use client";

import { type MouseEvent, useEffect, useMemo, useState } from "react";
import styles from "./live-status.module.css";
import type {
  CurrentPoint,
  LiveStatusDashboard,
  LiveStatusMachine,
  LiveStatusOverlayDevice,
  MachineDetails,
  OffPeriod,
  ShiftFilter
} from "@/lib/live-status";

type LiveStatusClientProps = {
  initialDate: string;
  dashboardTitle: string;
};

const MACHINE_MODAL_TAB_STORAGE_KEY = "factory-genie-machine-modal-tab";
const DASHBOARD_REFRESH_MS = 10 * 60 * 1000;
const OVERLAY_REFRESH_MS = 30 * 1000;

function getLocalDateString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStatusBucket(status: string) {
  if (["ON", "ACTIVE", "RUNNING"].includes(status)) return "activeMachines" as const;
  if (["OFF", "STOP", "INACTIVE"].includes(status)) return "inactiveMachines" as const;
  if (["LOW", "OUT", "WARNING", "FAULT", "ALERT"].includes(status)) return "warningMachines" as const;
  return "unknownMachines" as const;
}

function mergeLiveOverlay(
  dashboard: LiveStatusDashboard,
  overlay: LiveStatusOverlayDevice[]
): LiveStatusDashboard {
  const overlayByDevice = new Map(overlay.map((device) => [device.deviceId, device]));

  const machines = dashboard.machines.map((machine) => {
    const overlayDevice = overlayByDevice.get(machine.deviceId);
    const status = overlayDevice?.statusMap[machine.machineName];
    if (!status) return machine;

    return {
      ...machine,
      status,
      currentStatus: status,
      lastSeen: overlayDevice.lastSeen
    };
  });

  const devices = dashboard.devices.map((device) => {
    const overlayDevice = overlayByDevice.get(device.deviceId);
    return {
      ...device,
      signal: overlayDevice?.signal ?? device.signal,
      lastSeen: overlayDevice?.lastSeen ?? device.lastSeen,
      activeMachines: 0,
      inactiveMachines: 0,
      warningMachines: 0,
      unknownMachines: 0
    };
  });

  const devicesById = new Map(devices.map((device) => [device.deviceId, device]));

  for (const machine of machines) {
    const device = devicesById.get(machine.deviceId);
    if (device) {
      device[getStatusBucket(machine.status)] += 1;
    }
  }

  const summary = machines.reduce(
    (acc, machine) => {
      acc.runtimeMinutes += machine.runtimeMinutes;
      acc[getStatusBucket(machine.status)] += 1;
      return acc;
    },
    {
      totalDevices: devicesById.size,
      totalMachines: machines.length,
      activeMachines: 0,
      inactiveMachines: 0,
      warningMachines: 0,
      unknownMachines: 0,
      runtimeMinutes: 0
    }
  );

  summary.runtimeMinutes = Number(summary.runtimeMinutes.toFixed(1));

  return {
    ...dashboard,
    machines,
    devices: Array.from(devicesById.values()),
    summary
  };
}

function getInitialMachineModalTab(): "off" | "graph" {
  if (typeof window === "undefined") {
    return "off";
  }

  const value = window.localStorage.getItem(MACHINE_MODAL_TAB_STORAGE_KEY);
  return value === "graph" ? "graph" : "off";
}

function formatMinutesToHHMM(value: number) {
  const totalMinutes = Math.max(0, Math.round(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function statusClassName(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "on") return styles.statusOn;
  if (normalized === "off") return styles.statusOff;
  if (normalized === "low" || normalized === "out") return styles.statusWarn;
  return styles.statusUnknown;
}

function RuntimeDial({ percent }: { percent: number }) {
  return (
    <div
      className={styles.runtimeDial}
      style={{ background: `conic-gradient(#2ecc71 ${percent}%, #e8edf2 ${percent}% 100%)` }}
    >
      <div className={styles.runtimeDialInner}>
        <strong>{percent.toFixed(0)}%</strong>
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return value.replace("T", " ");
}

function splitDateTime(value: string) {
  const normalized = formatDateTime(value);
  const [date, time = "-"] = normalized.split(" ");

  return {
    date: date || "-",
    time
  };
}

function formatSignal(value: number | null) {
  return value === null ? "-" : `${value}%`;
}

function OffTable({ periods }: { periods: OffPeriod[] }) {
  const [minDuration, setMinDuration] = useState(1);
  const filteredPeriods = useMemo(
    () => periods.filter((period) => period.durationMinutes >= minDuration),
    [periods, minDuration]
  );
  const totalMinutes = filteredPeriods.reduce((sum, period) => sum + period.durationMinutes, 0);

  if (periods.length === 0) {
    return <p className={styles.emptyState}>No OFF breaks found for this window.</p>;
  }

  return (
    <div className={styles.tableSection}>
      <h3>📋 Off Time Details</h3>
      <div className={styles.tableControls}>
        <label className={styles.tableControlLabel}>
          <span>Min Duration</span>
          <select
            value={minDuration}
            onChange={(event) => setMinDuration(Number(event.target.value))}
            className={styles.tableSelect}
          >
            <option value={1}>1 min</option>
            <option value={5}>5 min</option>
            <option value={10}>10 min</option>
            <option value={30}>30 min</option>
          </select>
        </label>
      </div>
      <div className={styles.tableWrapper}>
        <table className={styles.modalTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Start Time</th>
              <th>End Time</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {filteredPeriods.map((period, index) => {
              const start = splitDateTime(period.startTime);
              const end = splitDateTime(period.endTime);

              return (
                <tr key={`${period.startTime}-${index}`}>
                  <td>{start.date}</td>
                  <td>{start.time}</td>
                  <td>{end.time}</td>
                  <td>{formatMinutesToHHMM(period.durationMinutes)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Total Duration</td>
              <td>{formatMinutesToHHMM(totalMinutes)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {filteredPeriods.length === 0 ? (
        <p className={styles.emptyState}>No OFF breaks match the selected minimum duration.</p>
      ) : null}
    </div>
  );
}

function CurrentGraph({
  points,
  thresholdValue
}: {
  points: CurrentPoint[];
  thresholdValue: number | null;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    tooltipX: number;
    tooltipY: number;
    time: string;
    value: number;
  } | null>(null);
  const validPoints = points.filter((point) => point.value !== null);

  if (validPoints.length < 2) {
    return <p className={styles.emptyState}>Not enough current data to draw the graph.</p>;
  }

  const width = 760;
  const height = 280;
  const padding = 28;
  const values = validPoints.map((point) => point.value as number);
  const scaleValues = thresholdValue === null ? values : [...values, thresholdValue];
  const minValue = Math.min(...scaleValues);
  const maxValue = Math.max(...scaleValues);
  const spread = maxValue - minValue || 1;
  const toY = (value: number) =>
    height - padding - ((value - minValue) / spread) * (height - padding * 2);

  const coordinates = validPoints.map((point, index) => {
    const x = padding + (index / (validPoints.length - 1)) * (width - padding * 2);
    const y = toY(point.value as number);
    return {
      x,
      y,
      time: point.time,
      value: point.value as number
    };
  });

  const path = coordinates
    .map((point, index) => {
      return `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`;
    })
    .join(" ");

  const ticks = [0, 0.5, 1].map((ratio) => {
    const value = maxValue - spread * ratio;
    const y = padding + (height - padding * 2) * ratio;
    return { value: value.toFixed(2), y };
  });
  const thresholdY = thresholdValue === null ? null : toY(thresholdValue);

  function updateHoveredPoint(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const nearestPoint = coordinates.reduce((nearest, point) => {
      return Math.abs(point.x - svgX) < Math.abs(nearest.x - svgX) ? point : nearest;
    }, coordinates[0]);

    setHoveredPoint({
      ...nearestPoint,
      tooltipX: event.clientX - rect.left,
      tooltipY: event.clientY - rect.top
    });
  }

  return (
    <div className={styles.graphSection}>
      <h3>📊 Current Graph</h3>
      <div className={styles.graphWrap}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className={styles.graphSvg}
          role="img"
          onMouseMove={updateHoveredPoint}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {ticks.map((tick) => (
            <g key={tick.y}>
              <line x1={padding} y1={tick.y} x2={width - padding} y2={tick.y} className={styles.graphGrid} />
              <text x={8} y={tick.y + 4} className={styles.graphAxisLabel}>
                {tick.value}
              </text>
            </g>
          ))}
          {thresholdY !== null ? (
            <g>
              <line
                x1={padding}
                y1={thresholdY}
                x2={width - padding}
                y2={thresholdY}
                className={styles.thresholdLine}
              />
              <text x={width - padding - 92} y={thresholdY - 8} className={styles.thresholdLabel}>
                Threshold {thresholdValue?.toFixed(2)}
              </text>
            </g>
          ) : null}
          <path d={path} className={styles.graphPath} />
          {coordinates.map((point, index) => {
            return (
              <circle
                key={`${point.time}-${index}`}
                cx={point.x}
                cy={point.y}
                r={2}
                className={styles.graphPoint}
              />
            );
          })}
        </svg>
        {hoveredPoint ? (
          <div
            className={styles.graphTooltip}
            style={{
              left: hoveredPoint.tooltipX,
              top: hoveredPoint.tooltipY
            }}
          >
            <div>Current: {hoveredPoint.value.toFixed(2)}</div>
            <div>Time: {formatDateTime(hoveredPoint.time)}</div>
          </div>
        ) : null}
        <div className={styles.graphLabels}>
          <span>{formatDateTime(validPoints[0].time)}</span>
          <span>{formatDateTime(validPoints[validPoints.length - 1].time)}</span>
        </div>
      </div>
    </div>
  );
}

function MachineModal({
  machine,
  details,
  activeTab,
  setActiveTab,
  onClose,
  loading,
  error
}: {
  machine: LiveStatusMachine | null;
  details: MachineDetails | null;
  activeTab: "off" | "graph";
  setActiveTab: (value: "off" | "graph") => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
}) {
  if (!machine) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleBlock}>
            <h2>Shift Data Details</h2>
          </div>
          <div className={styles.buttonsGroup}>
            <button className={styles.modalClose} onClick={onClose}>
              ×
            </button>
          </div>
        </div>

        <div className={styles.scrollableContent}>
          <div className={styles.dataSection}>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Machine</span>
              <span className={styles.infoValue}>{machine.machineName}</span>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Device</span>
              <span className={styles.infoValue}>{machine.deviceId}</span>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Date & Shift</span>
              <span className={styles.infoValue}>
                {details?.selectedDate || "-"} / {(details?.selectedShift || "-").toUpperCase()}
              </span>
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>Current Status</span>
              <span className={styles.infoValue}>{machine.currentStatus}</span>
            </div>
          </div>

          <div className={styles.tabSelector}>
            <button
              className={activeTab === "off" ? styles.activeTab : ""}
              onClick={() => setActiveTab("off")}
            >
              📋 Off Time Table
            </button>
            <button
              className={activeTab === "graph" ? styles.activeTab : ""}
              onClick={() => setActiveTab("graph")}
            >
              📊 Current Graph
            </button>
          </div>

          <div className={styles.contentArea}>
            {loading ? (
              <div className={styles.loadingState}>
                <div className={styles.loadingSpinner}></div>
                <p>Loading machine details...</p>
              </div>
            ) : error ? (
              <p className={styles.emptyState}>{error}</p>
            ) : activeTab === "off" ? (
              <OffTable periods={details?.offPeriods ?? []} />
            ) : (
              <CurrentGraph
                points={details?.currentSeries ?? []}
                thresholdValue={details?.thresholdValue ?? null}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MachineCard({
  machine,
  onSelect
}: {
  machine: LiveStatusMachine;
  onSelect: (machine: LiveStatusMachine) => void;
}) {
  return (
    <article
      className={`${styles.machineCard} ${statusClassName(machine.status)}`}
      onClick={() => onSelect(machine)}
    >
      <div className={styles.cardHeader}>
        <div>
          <h4>{machine.machineName}</h4>
          <p>{machine.group}</p>
          <span className={styles.shiftBadge}>{machine.shiftLabel}</span>
        </div>
        <span className={styles.statusBadge}>{machine.status}</span>
      </div>

      <RuntimeDial percent={machine.runtimePercent} />

      <div className={styles.cardStats}>
        <p>
          <strong>Runtime:</strong> {formatMinutesToHHMM(machine.runtimeMinutes)}
        </p>
        <p>
          <strong>Worktime:</strong> {formatMinutesToHHMM(machine.worktimeMinutes)}
        </p>
        <p>
          <strong>Average Current:</strong> {machine.averageCurrent ?? "-"}
        </p>
        <p>
          <strong>Current Status:</strong> {machine.currentStatus}
        </p>
      </div>
    </article>
  );
}

export default function LiveStatusClient({ initialDate, dashboardTitle }: LiveStatusClientProps) {
  const [currentDashboardTitle, setCurrentDashboardTitle] = useState(dashboardTitle);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedShift, setSelectedShift] = useState<ShiftFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LiveStatusDashboard | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<LiveStatusMachine | null>(null);
  const [machineDetails, setMachineDetails] = useState<MachineDetails | null>(null);
  const [machineModalTab, setMachineModalTabState] = useState<"off" | "graph">(
    getInitialMachineModalTab
  );
  const [machineDetailsLoading, setMachineDetailsLoading] = useState(false);
  const [machineDetailsError, setMachineDetailsError] = useState<string | null>(null);

  const setMachineModalTab = (value: "off" | "graph") => {
    setMachineModalTabState(value);
    window.localStorage.setItem(MACHINE_MODAL_TAB_STORAGE_KEY, value);
  };

  useEffect(() => {
    let isCancelled = false;

    async function fetchDashboardTitle() {
      try {
        const response = await fetch(`/api/settings?t=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache"
          }
        });
        const json = await response.json();

        if (!response.ok) {
          return;
        }

        if (!isCancelled && typeof json?.dashboardTitle === "string") {
          setCurrentDashboardTitle(json.dashboardTitle);
        }
      } catch {
        // Keep the server-rendered title if settings refresh fails.
      }
    }

    fetchDashboardTitle();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const fetchDashboard = async (showLoadingState: boolean) => {
      if (showLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const params = new URLSearchParams({
          date: selectedDate,
          shift: selectedShift
        });
        const response = await fetch(`/api/live-status?${params.toString()}`, {
          cache: "no-store"
        });
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error || "Failed to load live status");
        }

        if (!isCancelled) {
          setData(json);
          setError(null);
        }
      } catch (fetchError) {
        if (!isCancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load live status");
        }
      } finally {
        if (!isCancelled) {
          if (showLoadingState) {
            setLoading(false);
          } else {
            setRefreshing(false);
          }
        }
      }
    };

    fetchDashboard(true);
    const intervalId = window.setInterval(() => {
      fetchDashboard(false);
    }, DASHBOARD_REFRESH_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDate, selectedShift]);

  useEffect(() => {
    if (selectedDate !== getLocalDateString()) {
      return;
    }

    let isCancelled = false;

    const fetchOverlay = async () => {
      try {
        const response = await fetch("/api/live-status/overlay", { cache: "no-store" });
        const json = await response.json();

        if (!response.ok || isCancelled) return;

        setData((current) => (current ? mergeLiveOverlay(current, json.devices ?? []) : current));
      } catch {
        // Live status overlay is best-effort; the next tick will retry.
      }
    };

    fetchOverlay();
    const intervalId = window.setInterval(fetchOverlay, OVERLAY_REFRESH_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDate]);

  const machines = useMemo(() => {
    const shiftOrder: Record<ShiftFilter, number> = {
      morning: 0,
      night: 1,
      all: 2
    };

    return [...(data?.machines ?? [])].sort((a, b) => {
      const shiftDiff = shiftOrder[a.shift] - shiftOrder[b.shift];
      if (shiftDiff !== 0) return shiftDiff;
      return a.machineName.localeCompare(b.machineName, undefined, { numeric: true });
    });
  }, [data]);

  const openMachineModal = (machine: LiveStatusMachine) => {
    setSelectedMachine(machine);
    setMachineDetails(null);
    setMachineDetailsError(null);
    setMachineDetailsLoading(true);

    void (async () => {
      try {
        const params = new URLSearchParams({
          date: selectedDate,
          shift: machine.shift === "morning" || machine.shift === "night" ? machine.shift : selectedShift,
          deviceId: machine.deviceId,
          machineName: machine.machineName
        });
        const response = await fetch(`/api/live-status/machine-details?${params.toString()}`, {
          cache: "no-store"
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json?.error || "Failed to load machine details");
        }
        setMachineDetails(json);
      } catch (fetchError) {
        setMachineDetailsError(
          fetchError instanceof Error ? fetchError.message : "Failed to load machine details"
        );
      } finally {
        setMachineDetailsLoading(false);
      }
    })();
  };

  return (
    <main className={styles.page}>
      <div className={styles.dashboardContainer}>
        <header className={styles.dashboardHeader}>
          <div className={styles.headerMain}>
            <h1>
              <span>{currentDashboardTitle}</span>
            </h1>
          </div>

          <div className={styles.headerControls}>
            <div className={styles.dateControls}>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
            <div className={styles.shiftControls}>
              <button
                className={selectedShift === "all" ? styles.active : ""}
                onClick={() => setSelectedShift("all")}
              >
                All Shifts
              </button>
              <button
                className={selectedShift === "morning" ? styles.active : ""}
                onClick={() => setSelectedShift("morning")}
              >
                Morning
              </button>
              <button
                className={selectedShift === "night" ? styles.active : ""}
                onClick={() => setSelectedShift("night")}
              >
                Evening
              </button>
            </div>
            <button
              className={styles.refreshButton}
              onClick={() => {
                setRefreshing(true);
                void (async () => {
                  try {
                    const params = new URLSearchParams({
                      date: selectedDate,
                      shift: selectedShift
                    });
                    const response = await fetch(`/api/live-status?${params.toString()}`, {
                      cache: "no-store"
                    });
                    const json = await response.json();
                    if (!response.ok) {
                      throw new Error(json?.error || "Failed to load live status");
                    }
                    setData(json);
                    setError(null);
                  } catch (fetchError) {
                    setError(fetchError instanceof Error ? fetchError.message : "Failed to load live status");
                  } finally {
                    setRefreshing(false);
                  }
                })();
              }}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </header>

        {loading ? (
          <div className={styles.contentLoader}>
            <p>Loading dashboard data...</p>
          </div>
        ) : error ? (
          <div className={styles.contentLoader}>
            <p>{error}</p>
          </div>
        ) : (
          <>
            <section className={styles.topBar}>
              {data?.devices[0] ? (
                <article className={styles.overviewCard}>
                  <div className={styles.overviewBadges}>
                    <span className={`${styles.overviewBadge} ${styles.badgeGood}`}>
                      Active {data.devices[0].activeMachines}
                    </span>
                    <span className={`${styles.overviewBadge} ${styles.badgeBad}`}>
                      Inactive {data.devices[0].inactiveMachines}
                    </span>
                    <span className={`${styles.overviewBadge} ${styles.badgeNeutral}`}>
                      Machines {data?.summary.totalMachines ?? 0}
                    </span>
                  </div>
                </article>
              ) : null}

              <div className={styles.summarySection}>
                <div className={styles.summaryCard}>
                  <span>Devices</span>
                  <strong>{data?.summary.totalDevices ?? 0}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span>Machines</span>
                  <strong>{data?.summary.totalMachines ?? 0}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span>Total Runtime</span>
                  <strong>{formatMinutesToHHMM(data?.summary.runtimeMinutes ?? 0)}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span>Window</span>
                  <strong>{data?.shiftWindowLabel ?? "-"}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span>Duration</span>
                  <strong>{formatMinutesToHHMM(data?.shiftDurationMinutes ?? 0)}</strong>
                </div>
              </div>
            </section>

            <section className={styles.progressSection}>
              {machines.length === 0 ? (
                <div className={styles.contentLoader}>
                  <p>
                    {data?.shiftComputedAt
                      ? `No machines found in the precomputed shift data for ${selectedDate}.`
                      : `Shift data for ${selectedDate} hasn't been precomputed yet. The Compute Shift worker runs every 10 minutes.`}
                  </p>
                </div>
              ) : (
                <div className={styles.deviceSection}>
                  <div className={styles.sectionHeader}>
                    <h2>Machine Live Status</h2>
                    <p>
                      {refreshing ? "Updating latest values..." : "Auto-refresh every 10 minutes"}
                      {" — "}
                      <span className={styles.dataSourceCached}>
                        Precomputed shiftwise data
                        {data?.shiftComputedAt ? ` · computed ${data.shiftComputedAt}` : ""}
                      </span>
                      {" (machine status updates every 30s from the latest per-minute reading)"}
                    </p>
                  </div>
                  <div className={styles.channelContainer}>
                    {machines.map((machine) => (
                      <MachineCard
                        key={`${machine.deviceId}-${machine.shift}-${machine.machineName}`}
                        machine={machine}
                        onSelect={openMachineModal}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
            <MachineModal
              machine={selectedMachine}
              details={machineDetails}
              activeTab={machineModalTab}
              setActiveTab={setMachineModalTab}
              onClose={() => {
                setSelectedMachine(null);
                setMachineDetails(null);
                setMachineDetailsError(null);
              }}
              loading={machineDetailsLoading}
              error={machineDetailsError}
            />
          </>
        )}
      </div>
    </main>
  );
}
