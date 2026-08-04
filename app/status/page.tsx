import LogsClient from "@/app/logs/logs-client";
import { getRuntimeStatus } from "@/lib/status";
import { getLogs } from "@/lib/status";

export const dynamic = "force-dynamic";

function formatValue(value: string | boolean | null) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value || "-";
}

export default async function StatusPage() {
  const status = await getRuntimeStatus();
  const logs = getLogs(100);

  return (
    <main className="page-shell settings-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Runtime</span>
            <h1>Status</h1>
            <p>Current MQTT state and live database connectivity from this app process.</p>
          </div>
        </div>

        <div className="status-grid">
          <article className="status-card">
            <span className="status-card-label">MQTT</span>
            <strong className={status.mqtt.connected ? "tone-good" : "tone-bad"}>
              {status.mqtt.connected ? "Connected" : "Disconnected"}
            </strong>
            <dl>
              <div>
                <dt>Last Event</dt>
                <dd>{formatValue(status.mqtt.lastEvent)}</dd>
              </div>
              <div>
                <dt>Last Event At</dt>
                <dd>{formatValue(status.mqtt.lastEventAt)}</dd>
              </div>
            </dl>
          </article>

          <article className="status-card">
            <span className="status-card-label">Database</span>
            <strong className={status.db.enabled ? "tone-good" : "tone-muted"}>
              {status.db.enabled ? "Connected" : "Disconnected"}
            </strong>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>{formatValue(status.db.mode)}</dd>
              </div>
              <div>
                <dt>Last Error</dt>
                <dd>{formatValue(status.db.lastError)}</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Runtime</span>
            <h1>Logs</h1>
            <p>Latest MQTT and app logs from this process.</p>
          </div>
        </div>

        <LogsClient initialLogs={logs} />
      </section>
    </main>
  );
}
