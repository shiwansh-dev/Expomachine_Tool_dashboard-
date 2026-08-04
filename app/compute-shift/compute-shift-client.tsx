"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveStatusDashboard, ShiftFilter } from "@/lib/live-status";
import type { ShiftComputeProgress, ShiftSummaryPayload, ShiftSummaryRecent } from "@/lib/shift-compute";

type ComputeShiftClientProps = {
  initialProgress: ShiftComputeProgress;
  initialRecent: ShiftSummaryRecent[];
  initialDate: string;
  initialPayload: ShiftSummaryPayload | null;
};

const POLL_INTERVAL_MS = 4000;

const SHIFT_TABS: { value: ShiftFilter; label: string }[] = [
  { value: "all", label: "Full Day" },
  { value: "morning", label: "Morning" },
  { value: "night", label: "Night" }
];

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatDuration(durationMs: number) {
  if (!durationMs) return "-";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatMinutes(value: number) {
  const totalMinutes = Math.max(0, Math.round(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function DashboardView({ dashboard }: { dashboard: LiveStatusDashboard }) {
  return (
    <>
      <div className="summary-grid report-summary-grid">
        <div className="summary-card">
          <span>Devices</span>
          <strong>{dashboard.summary.totalDevices}</strong>
        </div>
        <div className="summary-card">
          <span>Machines</span>
          <strong>{dashboard.summary.totalMachines}</strong>
        </div>
        <div className="summary-card">
          <span>Active</span>
          <strong className="tone-good">{dashboard.summary.activeMachines}</strong>
        </div>
        <div className="summary-card">
          <span>Inactive</span>
          <strong>{dashboard.summary.inactiveMachines}</strong>
        </div>
        <div className="summary-card">
          <span>Warning</span>
          <strong className="tone-bad">{dashboard.summary.warningMachines}</strong>
        </div>
        <div className="summary-card">
          <span>Runtime</span>
          <strong>{formatMinutes(dashboard.summary.runtimeMinutes)}</strong>
        </div>
      </div>

      <div className="table-wrap report-table-wrap">
        <table className="settings-table report-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Machine</th>
              <th>Group</th>
              <th>Status</th>
              <th>Avg Current</th>
              <th>Runtime</th>
              <th>Worktime</th>
              <th>Runtime %</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.machines.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={9}>
                  No machine readings for this window.
                </td>
              </tr>
            ) : (
              dashboard.machines.map((machine) => (
                <tr key={`${machine.deviceId}-${machine.machineName}`}>
                  <td>{machine.deviceId}</td>
                  <td>{machine.machineName}</td>
                  <td>{machine.group}</td>
                  <td>
                    <span className={machine.status === "ON" ? "tone-good" : "tone-muted"}>
                      {machine.status}
                    </span>
                  </td>
                  <td>{machine.averageCurrent ?? "-"}</td>
                  <td>{formatMinutes(machine.runtimeMinutes)}</td>
                  <td>{formatMinutes(machine.worktimeMinutes)}</td>
                  <td>{machine.runtimePercent}%</td>
                  <td>{machine.lastSeen}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function ComputeShiftClient({
  initialProgress,
  initialRecent,
  initialDate,
  initialPayload
}: ComputeShiftClientProps) {
  const [progress, setProgress] = useState(initialProgress);
  const [recent, setRecent] = useState(initialRecent);
  const [runError, setRunError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [targetDate, setTargetDate] = useState(initialDate);
  const [viewDate, setViewDate] = useState(initialDate);
  const [shiftTab, setShiftTab] = useState<ShiftFilter>("all");
  const [payload, setPayload] = useState<ShiftSummaryPayload | null>(initialPayload);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPayload = useCallback(async (date: string) => {
    setPayloadLoading(true);
    try {
      const response = await fetch(`/api/shift-compute/data?date=${encodeURIComponent(date)}`);
      const body = await response.json();
      if (response.ok) {
        setPayload(body.payload);
      }
    } catch {
      // Keep showing the last known payload; user can retry via date change or refresh.
    } finally {
      setPayloadLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/shift-compute/status");
      const body = await response.json();
      if (!response.ok) return;

      setProgress(body.progress);
      setRecent(body.recent);
    } catch {
      // Keep showing the last known state; the next poll tick will retry.
    }
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      refresh();
      fetchPayload(viewDate);
    }, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, fetchPayload, viewDate]);

  useEffect(() => {
    fetchPayload(viewDate);
  }, [viewDate, fetchPayload]);

  async function triggerComputeNow() {
    setTriggering(true);
    setRunError(null);

    try {
      const response = await fetch("/api/shift-compute/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: targetDate })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error || "Unable to start shift computation");
      }

      await refresh();
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Unable to start shift computation");
    } finally {
      setTriggering(false);
    }
  }

  const rowProgressPercent =
    progress.totalRows > 0 ? Math.min(100, Math.round((progress.processedRows / progress.totalRows) * 100)) : 0;
  const batchProgressPercent =
    progress.totalBatches > 0
      ? Math.min(100, Math.round((progress.batchIndex / progress.totalBatches) * 100))
      : 0;

  const latestComputed = recent[0] ?? null;
  const activeDashboard = payload?.dashboards[shiftTab] ?? null;

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Background Worker</span>
            <h1>Compute Shift</h1>
            <p>
              Pre-computes shiftwise data from raw MQTT readings every 10 minutes for today and yesterday, and
              stores it in <code>shift_summary</code> so the live dashboard can eventually read pre-aggregated
              results instead of recomputing from scratch.
            </p>
          </div>
        </div>

        <div className="status-grid">
          <article className="status-card">
            <span className="status-card-label">Worker State</span>
            <strong className={progress.running ? "tone-good" : "tone-muted"}>
              {progress.running ? "Computing" : "Idle"}
            </strong>
            <dl>
              <div>
                <dt>Current Date</dt>
                <dd>{formatValue(progress.currentDate)}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{formatValue(progress.phase)}</dd>
              </div>
              <div>
                <dt>Started At</dt>
                <dd>{formatValue(progress.startedAt)}</dd>
              </div>
            </dl>
          </article>

          <article className="status-card">
            <span className="status-card-label">Last Computed</span>
            <strong className={latestComputed?.status === "ok" ? "tone-good" : "tone-muted"}>
              {formatValue(latestComputed?.computedAt)}
            </strong>
            <dl>
              <div>
                <dt>Date</dt>
                <dd>{formatValue(latestComputed?.date)}</dd>
              </div>
              <div>
                <dt>Latest Source Reading</dt>
                <dd>{formatValue(latestComputed?.latestSourceAt)}</dd>
              </div>
              <div>
                <dt>Rows Processed</dt>
                <dd>{formatValue(latestComputed?.sourceRowCount)}</dd>
              </div>
            </dl>
          </article>
        </div>

        {progress.running ? (
          <div className="compute-progress">
            <div className="compute-progress-row">
              <span>
                Rows: {progress.processedRows} / {progress.totalRows || "-"}
              </span>
              <span>{rowProgressPercent}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${rowProgressPercent}%` }} />
            </div>

            <div className="compute-progress-row">
              <span>
                Batch: {progress.batchIndex} / {progress.totalBatches || "-"}
              </span>
              <span>{batchProgressPercent}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${batchProgressPercent}%` }} />
            </div>
          </div>
        ) : null}

        <div className="bulk-panel">
          <label>
            <span>Date</span>
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </label>
          <button type="button" onClick={triggerComputeNow} disabled={triggering || progress.running}>
            {triggering || progress.running ? "Running..." : "Compute Now"}
          </button>
          {runError ? <span className="inline-message tone-bad">{runError}</span> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Computed Data</span>
            <h1>Shift Summary</h1>
            <p>Data currently stored in shift_summary for the selected date.</p>
          </div>
          <div className="report-filters">
            <label>
              <span>View Date</span>
              <input
                type="date"
                value={viewDate}
                onChange={(event) => setViewDate(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="shift-tab-group">
          {SHIFT_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={shiftTab === tab.value ? "shift-tab is-active" : "shift-tab"}
              onClick={() => setShiftTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
          {payloadLoading ? <span className="inline-message tone-muted">Refreshing...</span> : null}
        </div>

        {!payload ? (
          <p className="empty-cell">No computed data stored for {viewDate} yet.</p>
        ) : (
          <>
            <div className="status-grid">
              <article className="status-card">
                <span className="status-card-label">Computed At</span>
                <strong className={payload.status === "ok" ? "tone-good" : "tone-bad"}>
                  {formatValue(payload.computedAt)}
                </strong>
                <dl>
                  <div>
                    <dt>Latest Source Reading</dt>
                    <dd>{formatValue(payload.latestSourceAt)}</dd>
                  </div>
                  <div>
                    <dt>Rows Processed</dt>
                    <dd>{formatValue(payload.sourceRowCount)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{formatValue(payload.status)}</dd>
                  </div>
                </dl>
                {payload.lastError ? (
                  <p className="inline-message tone-bad">{payload.lastError}</p>
                ) : null}
              </article>
            </div>

            {activeDashboard ? (
              <DashboardView dashboard={activeDashboard} />
            ) : (
              <p className="empty-cell">No {shiftTab} shift data stored for {viewDate}.</p>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">History</span>
            <h1>Recent Days</h1>
            <p>Most recently computed shift summaries, newest first.</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Latest Source Reading</th>
                <th>Computed At</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={7}>
                    No shift computations recorded yet.
                  </td>
                </tr>
              ) : (
                recent.map((row) => (
                  <tr key={row.date}>
                    <td>
                      <button type="button" className="link-button" onClick={() => setViewDate(row.date)}>
                        {row.date}
                      </button>
                    </td>
                    <td>
                      <span className={row.status === "ok" ? "tone-good" : "tone-bad"}>{row.status}</span>
                    </td>
                    <td>{row.sourceRowCount}</td>
                    <td>{formatValue(row.latestSourceAt)}</td>
                    <td>{formatValue(row.computedAt)}</td>
                    <td>{formatDuration(row.durationMs)}</td>
                    <td>{formatValue(row.lastError)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
