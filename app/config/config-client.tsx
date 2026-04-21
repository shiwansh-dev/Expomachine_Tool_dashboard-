"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import styles from "./config-page.module.css";

type ConfigSummary = {
  source: "saved" | "environment" | "missing";
  configured: boolean;
  config: {
    host: string;
    port: number;
    user: string;
    database: string;
    hasPassword: boolean;
  } | null;
  updatedAt: string | null;
};

type FormState = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

const EMPTY_FORM: FormState = {
  host: "",
  port: "3306",
  user: "",
  password: "",
  database: ""
};

export default function ConfigClient() {
  const [summary, setSummary] = useState<ConfigSummary | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void loadSummary();
  }, []);

  async function loadSummary() {
    setLoading(true);

    try {
      const response = await fetch("/api/config/db", { cache: "no-store" });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Failed to load SQL configuration.");
      }

      const nextSummary = json as ConfigSummary;
      setSummary(nextSummary);

      if (nextSummary.config) {
        setForm((current) => ({
          host: current.host || nextSummary.config?.host || "",
          port: current.port || String(nextSummary.config?.port || 3306),
          user: current.user || nextSummary.config?.user || "",
          password: current.password,
          database: current.database || nextSummary.config?.database || ""
        }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load SQL configuration.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccess(null);
  }

  async function submit(action: "test" | "save") {
    setError(null);
    setSuccess(null);

    if (action === "test") {
      setTesting(true);
    } else {
      setSaving(true);
    }

    try {
      const response = await fetch("/api/config/db", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          host: form.host,
          port: Number(form.port),
          user: form.user,
          password: form.password,
          database: form.database
        })
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Unable to validate SQL configuration.");
      }

      setSuccess(json.message || "Configuration updated.");

      if (action === "save") {
        setForm((current) => ({ ...current, password: "" }));
        await loadSummary();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to validate SQL configuration."
      );
    } finally {
      setTesting(false);
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>Desktop Setup</span>
        <h1>SQL Configuration</h1>
        <p>
          Save the MySQL connection used by the desktop dashboard. These settings are stored locally
          for this machine, so the packaged `.exe` can run independently without editing `.env.local`.
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void submit("save")}
            disabled={saving || testing || loading}
          >
            {saving ? "Saving..." : "Save Credentials"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void submit("test")}
            disabled={saving || testing || loading}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <Link className={styles.secondaryButton} href={"/live-status" as Route}>
            Back to Dashboard
          </Link>
        </div>
      </section>

      <section className={styles.statusGrid}>
        <article className={styles.statusCard}>
          <span className={styles.statusLabel}>Config Source</span>
          <strong>
            {loading ? "Loading..." : summary?.source === "saved" ? "Saved Locally" : summary?.source === "environment" ? "Environment Variables" : "Not Configured"}
          </strong>
          <p>The desktop app always prefers locally saved credentials when they exist.</p>
        </article>
        <article className={styles.statusCard}>
          <span className={styles.statusLabel}>Current Target</span>
          <strong>
            {summary?.config ? `${summary.config.host}:${summary.config.port}` : "No SQL target yet"}
          </strong>
          <span className={styles.statusValue}>
            {summary?.config ? `${summary.config.user} @ ${summary.config.database}` : "Open the form below and save your server details."}
          </span>
        </article>
      </section>

      <section className={styles.panel}>
        <div>
          <h2>Connection Details</h2>
          <p className={styles.panelCopy}>
            Use a MySQL user that can read the `mqtt_messages` table. Saving will validate the
            connection first and then refresh the dashboard pool automatically.
          </p>
        </div>

        {error ? <div className={`${styles.feedback} ${styles.feedbackError}`}>{error}</div> : null}
        {success ? <div className={`${styles.feedback} ${styles.feedbackSuccess}`}>{success}</div> : null}

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="host">SQL Host</label>
            <input
              id="host"
              value={form.host}
              onChange={(event) => updateField("host", event.target.value)}
              placeholder="127.0.0.1"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="port">SQL Port</label>
            <input
              id="port"
              value={form.port}
              onChange={(event) => updateField("port", event.target.value)}
              inputMode="numeric"
              placeholder="3306"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="user">SQL User</label>
            <input
              id="user"
              value={form.user}
              onChange={(event) => updateField("user", event.target.value)}
              placeholder="admin"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="database">Database Name</label>
            <input
              id="database"
              value={form.database}
              onChange={(event) => updateField("database", event.target.value)}
              placeholder="iot"
            />
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <label htmlFor="password">SQL Password</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder={summary?.config?.hasPassword ? "Enter a new password to update it" : "Enter password"}
            />
          </div>
        </div>

        <ol className={styles.hintList}>
          <li>Use Test Connection first if you only want to verify access.</li>
          <li>Use Save Credentials to store the settings for the packaged Windows app.</li>
          <li>If the database password changes later, open this page again and save the new one.</li>
        </ol>
      </section>
    </main>
  );
}
