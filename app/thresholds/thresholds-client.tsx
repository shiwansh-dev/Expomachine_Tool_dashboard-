"use client";

import { useMemo, useState } from "react";

type ThresholdsClientProps = {
  defaultThreshold: number;
  initialThresholds: Record<string, number>;
};

type SaveState = {
  field: string;
  message: string;
  tone: "good" | "bad" | "muted";
} | null;

export default function ThresholdsClient({
  defaultThreshold,
  initialThresholds
}: ThresholdsClientProps) {
  const [thresholds, setThresholds] = useState(initialThresholds);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialThresholds).map(([field, value]) => [field, String(value)]))
  );
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [bulkValue, setBulkValue] = useState(String(defaultThreshold));
  const [savingField, setSavingField] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>(null);

  const fields = useMemo(() => Object.keys(thresholds).sort(), [thresholds]);

  function updateDraft(field: string, value: string) {
    setDrafts((current) => ({ ...current, [field]: value }));
  }

  function toggleField(field: string) {
    setSelectedFields((current) =>
      current.includes(field) ? current.filter((item) => item !== field) : [...current, field]
    );
  }

  async function saveField(field: string) {
    const value = Number(drafts[field]);
    if (Number.isNaN(value)) {
      setSaveState({ field, message: "Enter a numeric value.", tone: "bad" });
      return;
    }

    setSavingField(field);
    setSaveState(null);

    try {
      const response = await fetch(`/api/thresholds/${encodeURIComponent(field)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save threshold");
      }

      setThresholds((current) => ({ ...current, [field]: value }));
      setSaveState({ field, message: "Saved", tone: "good" });
    } catch (error) {
      setSaveState({
        field,
        message: error instanceof Error ? error.message : "Unable to save threshold",
        tone: "bad"
      });
    } finally {
      setSavingField(null);
    }
  }

  async function resetField(field: string) {
    setSavingField(field);
    setSaveState(null);

    try {
      const response = await fetch(`/api/thresholds/${encodeURIComponent(field)}/reset`, {
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to reset threshold");
      }

      const value = Number(payload.value);
      setThresholds((current) => ({ ...current, [field]: value }));
      updateDraft(field, String(value));
      setSaveState({ field, message: "Reset", tone: "good" });
    } catch (error) {
      setSaveState({
        field,
        message: error instanceof Error ? error.message : "Unable to reset threshold",
        tone: "bad"
      });
    } finally {
      setSavingField(null);
    }
  }

  async function saveBulk() {
    const value = Number(bulkValue);

    if (selectedFields.length === 0) {
      setSaveState({ field: "bulk", message: "Select at least one field.", tone: "bad" });
      return;
    }

    if (Number.isNaN(value)) {
      setSaveState({ field: "bulk", message: "Enter a numeric bulk value.", tone: "bad" });
      return;
    }

    setSavingField("bulk");
    setSaveState(null);

    try {
      const response = await fetch("/api/thresholds/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: selectedFields, value })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save bulk thresholds");
      }

      setThresholds((current) => ({
        ...current,
        ...Object.fromEntries(selectedFields.map((field) => [field, value]))
      }));
      setDrafts((current) => ({
        ...current,
        ...Object.fromEntries(selectedFields.map((field) => [field, String(value)]))
      }));
      setSaveState({ field: "bulk", message: "Bulk update saved", tone: "good" });
    } catch (error) {
      setSaveState({
        field: "bulk",
        message: error instanceof Error ? error.message : "Unable to save bulk thresholds",
        tone: "bad"
      });
    } finally {
      setSavingField(null);
    }
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">SQL Settings</span>
            <h1>Thresholds</h1>
            <p>Current machine threshold values from the database.</p>
          </div>
          <div className="doc-count">
            <span>Default</span>
            <strong>{defaultThreshold}</strong>
          </div>
        </div>

        <div className="bulk-panel">
          <label>
            <span>Bulk Value</span>
            <input
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <button type="button" onClick={saveBulk} disabled={savingField === "bulk"}>
            {savingField === "bulk" ? "Saving..." : "Apply To Selected"}
          </button>
          <button type="button" onClick={() => setSelectedFields(fields)} disabled={fields.length === 0}>
            Select All
          </button>
          <button type="button" onClick={() => setSelectedFields([])}>
            Clear
          </button>
          {saveState?.field === "bulk" ? (
            <span className={`inline-message tone-${saveState.tone}`}>{saveState.message}</span>
          ) : null}
        </div>

        <div className="table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Field</th>
                <th>Current</th>
                <th>New Value</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.length === 0 ? (
                <tr>
                  <td className="empty-cell" colSpan={5}>
                    No thresholds found.
                  </td>
                </tr>
              ) : (
                fields.map((field) => (
                  <tr key={field}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field)}
                        onChange={() => toggleField(field)}
                        aria-label={`Select ${field}`}
                      />
                    </td>
                    <td>{field}</td>
                    <td>{thresholds[field]}</td>
                    <td>
                      <input
                        className="table-input"
                        value={drafts[field] ?? ""}
                        onChange={(event) => updateDraft(field, event.target.value)}
                        inputMode="decimal"
                      />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          onClick={() => saveField(field)}
                          disabled={savingField === field}
                        >
                          {savingField === field ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => resetField(field)}
                          disabled={savingField === field}
                        >
                          Reset
                        </button>
                        {saveState?.field === field ? (
                          <span className={`inline-message tone-${saveState.tone}`}>{saveState.message}</span>
                        ) : null}
                      </div>
                    </td>
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
