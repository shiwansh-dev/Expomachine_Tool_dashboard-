import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { getDataTopic } from "@/lib/topic-config";

export const dynamic = "force-dynamic";

type MqttMessageRow = RowDataPacket & {
  id: number;
  topic: string;
  payload_text: string;
  payload_json: unknown;
  qos: number;
  retain_flag: number;
  received_at: Date | string;
};

function formatDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false
  });
}

function formatPayload(value: unknown, fallback: string) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

async function getLatestDocs(topic: string) {
  const pool = getPool();
  const [rows] = await pool.query<MqttMessageRow[]>(
    `
      SELECT id, topic, payload_text, payload_json, qos, retain_flag, received_at
      FROM mqtt_messages
      WHERE topic = ?
      ORDER BY received_at DESC, id DESC
      LIMIT 100
    `,
    [topic]
  );

  return rows;
}

export default async function SqlDocsPage() {
  const topic = await getDataTopic();
  const docs = await getLatestDocs(topic);

  return (
    <main className="page-shell sql-docs-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">SQL Database</span>
            <h1>Latest 100 Docs</h1>
            <p>Newest rows from mqtt_messages for {topic}.</p>
          </div>
          <div className="doc-count">
            <span>Rows</span>
            <strong>{docs.length}</strong>
          </div>
        </div>

        <div className="table-wrap sql-docs-table-wrap">
          <table className="sql-docs-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Received</th>
                <th>Topic</th>
                <th>QoS</th>
                <th>Retain</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={6}>
                    No SQL docs found.
                  </td>
                </tr>
              ) : (
                docs.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.id}</td>
                    <td>{formatDateTime(doc.received_at)}</td>
                    <td>{doc.topic}</td>
                    <td>{doc.qos}</td>
                    <td>{doc.retain_flag ? "Yes" : "No"}</td>
                    <td>
                      <pre className="payload-preview">
                        {formatPayload(doc.payload_json, doc.payload_text)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
