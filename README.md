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

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000/live-status`.

## Important Path Note

This workspace path includes a trailing space in the folder name, which caused `npm install` extraction issues during verification.
If that happens locally, move or copy the project to a path without the trailing space and rerun install there.
