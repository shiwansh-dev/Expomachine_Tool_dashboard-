"use client";

import { useState } from "react";

type MqttSettings = {
  mqttBrokerUrl: string;
  mqttTopic: string;
  dataTopic: string;
  mqttClientId: string;
  mqttUsername: string;
  mqttPassword: string;
};

type SettingsClientProps = {
  initialDashboardTitle: string;
  initialMqttSettings: MqttSettings;
};

export default function SettingsClient({
  initialDashboardTitle,
  initialMqttSettings
}: SettingsClientProps) {
  const [dashboardTitle, setDashboardTitle] = useState(initialDashboardTitle);
  const [savedTitle, setSavedTitle] = useState(initialDashboardTitle);
  const [mqttSettings, setMqttSettings] = useState(initialMqttSettings);
  const [savedMqttSettings, setSavedMqttSettings] = useState(initialMqttSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);

  function updateMqttSetting<K extends keyof MqttSettings>(key: K, value: MqttSettings[K]) {
    setMqttSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    const title = dashboardTitle.trim();

    if (!title) {
      setMessage({ text: "Dashboard title is required.", tone: "bad" });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboardTitle: title,
          mqtt: mqttSettings
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to save settings");
      }

      setDashboardTitle(payload.dashboardTitle);
      setSavedTitle(payload.dashboardTitle);
      setMqttSettings(payload.mqtt);
      setSavedMqttSettings(payload.mqtt);
      setMessage({ text: "Saved", tone: "good" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Unable to save settings",
        tone: "bad"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">App Settings</span>
          <h1>Settings</h1>
          <p>Change dashboard display values saved in SQL.</p>
        </div>
      </div>

      <div className="settings-form">
        <label>
          <span>Dashboard Title</span>
          <input
            value={dashboardTitle}
            onChange={(event) => setDashboardTitle(event.target.value)}
            placeholder="Dashboard title"
          />
        </label>

        <div className="settings-preview">
          <span>Current Saved Title</span>
          <strong>{savedTitle}</strong>
        </div>

        <div className="settings-group">
          <h2>MQTT Connection</h2>
          <label>
            <span>Broker URL</span>
            <input
              value={mqttSettings.mqttBrokerUrl}
              onChange={(event) => updateMqttSetting("mqttBrokerUrl", event.target.value)}
              placeholder="mqtt://host:1883"
            />
          </label>
          <label>
            <span>Subscribe Topic</span>
            <input
              value={mqttSettings.mqttTopic}
              onChange={(event) => updateMqttSetting("mqttTopic", event.target.value)}
              placeholder="TN-862360079075367/data"
            />
          </label>
          <label>
            <span>SQL Data Topic</span>
            <input
              value={mqttSettings.dataTopic}
              onChange={(event) => updateMqttSetting("dataTopic", event.target.value)}
              placeholder="TN-862360079075367/data"
            />
          </label>
          <label>
            <span>Client ID Prefix</span>
            <input
              value={mqttSettings.mqttClientId}
              onChange={(event) => updateMqttSetting("mqttClientId", event.target.value)}
              placeholder="factory-genie-dashboard"
            />
          </label>
          <label>
            <span>Username</span>
            <input
              value={mqttSettings.mqttUsername}
              onChange={(event) => updateMqttSetting("mqttUsername", event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={mqttSettings.mqttPassword}
              onChange={(event) => updateMqttSetting("mqttPassword", event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="settings-preview">
          <span>Current Saved MQTT</span>
          <strong>{savedMqttSettings.mqttBrokerUrl}</strong>
          <p>{savedMqttSettings.mqttTopic}</p>
        </div>

        <div className="settings-actions">
          <button type="button" onClick={saveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {message ? <span className={`inline-message tone-${message.tone}`}>{message.text}</span> : null}
        </div>
      </div>
    </section>
  );
}
