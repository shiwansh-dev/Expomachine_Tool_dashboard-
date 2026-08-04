"use client";

import { useEffect, useState } from "react";

type LogEntry = Record<string, unknown> & {
  receivedAt?: string;
};

type LogsClientProps = {
  initialLogs: LogEntry[];
};

function formatLogValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

export default function LogsClient({ initialLogs }: LogsClientProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function refreshLogs() {
      try {
        const response = await fetch(`/api/logs?limit=100&t=${Date.now()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache"
          }
        });
        if (!response.ok) return;

        const nextLogs = (await response.json()) as LogEntry[];
        if (!isMounted) return;

        setLogs(nextLogs);
        setLastUpdatedAt(new Date().toLocaleTimeString("en-IN", { hour12: false }));
      } catch {
        // Keep the current table visible if a single refresh fails.
      }
    }

    refreshLogs();
    const interval = window.setInterval(refreshLogs, 1000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <>
      <div className="live-row">
        <span className="live-dot" />
        <span>Live</span>
        <span className="tone-muted">{lastUpdatedAt ? `Updated ${lastUpdatedAt}` : "Updating..."}</span>
        <span className="live-count">{logs.length} rows</span>
      </div>

      <div className="table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>Received At</th>
              <th>Entry</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={2}>
                  No logs captured in this app process.
                </td>
              </tr>
            ) : (
              logs.map((log, index) => {
                const { receivedAt, ...entry } = log;

                return (
                  <tr key={`${receivedAt || "log"}-${index}`}>
                    <td>{receivedAt || "-"}</td>
                    <td>
                      <pre className="payload-preview">{formatLogValue(entry)}</pre>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
