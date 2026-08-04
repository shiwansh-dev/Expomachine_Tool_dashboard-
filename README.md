# Factory Genie Next.js Dashboard

Simple Next.js app that reads live machine status from the MySQL `iot.mqtt_messages` table and renders it at `/live-status`.

## Environment

The app uses these server-side environment variables:

```env
DB_HOST=38.242.200.141
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=Admin@1234
DB_NAME=iot
```

They are already placed in `.env.local` for this workspace.

## Routes

- `/live-status`: dashboard page
- `/api/live-status`: JSON API used by the dashboard

## Data Mapping

The current database contains the `mqtt_messages` table. The app reads the latest MQTT payloads and expands:

- `payload_json.ID` as the device identifier
- `payload_json.TS` as the device timestamp
- `payload_json.status` as per-machine live status
- machine readings such as `GMC 1`, `GNC 11`, `GTC 1` as extra metrics

## Run Web App

```bash
npm install
npm run dev
```

Open `http://localhost:3000/live-status`.

## Run Desktop App

The project now includes an Electron wrapper so it can be packaged as a Windows portable `.exe`.

```bash
npm install
npm run electron:dev
```

To build the executable:

```bash
npm run build:desktop
```

The output is written to `release/` and produces `Factory-Genie-Dashboard.exe`.
Run that build on Windows, or on a Windows CI runner, to produce the actual `.exe`.

## Important Path Note

This workspace path includes a trailing space in the folder name, which caused `npm install` extraction issues during verification.
If that happens locally, move or copy the project to a path without the trailing space and rerun install there.

## Packaging Note

The desktop build loads the same MySQL credentials from `.env.local` that the web app uses. If you change those values, rebuild the `.exe` so the packaged app picks them up.
