import LogsClient from "@/app/logs/logs-client";
import { getLogs } from "@/lib/status";

export const dynamic = "force-dynamic";

export default function LogsPage() {
  const logs = getLogs(100);

  return (
    <main className="page-shell settings-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Runtime</span>
            <h1>Logs</h1>
            <p>Latest in-memory status logs captured by this app process.</p>
          </div>
          <div className="doc-count">
            <span>Rows</span>
            <strong>{logs.length}</strong>
          </div>
        </div>

        <LogsClient initialLogs={logs} />
      </section>
    </main>
  );
}
