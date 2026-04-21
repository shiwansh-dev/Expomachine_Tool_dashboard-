# Factory Genie Desktop Dashboard

This project now supports two ways of running:

- Browser mode with Next.js
- Desktop mode as a packaged Windows `.exe` using Electron

The live-status dashboard still reads from the MySQL `iot.mqtt_messages` table, but SQL credentials can now be managed from an in-app `/config` page instead of relying only on `.env.local`.

## SQL Configuration

The app loads database credentials in this order:

1. Saved local desktop config
2. Environment variables from `.env.local`

Saved desktop credentials are stored locally per machine, so the packaged application can run independently after setup.

Environment variable fallback:

```env
DB_HOST=38.242.200.141
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=Admin@1234
DB_NAME=iot
```

## Routes

- `/live-status`: main dashboard
- `/config`: SQL credential setup page
- `/api/live-status`: dashboard data API
- `/api/live-status/machine-details`: modal detail API
- `/api/config/db`: load, test, and save SQL credentials

## Development Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000/live-status`.

## Desktop Run

Build the Next standalone server and launch it inside Electron:

```bash
npm run desktop
```

## Build Windows EXE

Create distributable Windows builds:

```bash
npm run dist
```

This produces Windows targets through `electron-builder`, including:

- `nsis` installer
- `portable` executable

## Notes

- The desktop app bundles the built Next standalone server and starts it internally on localhost.
- If SQL credentials change later, open `/config` inside the app and save the new values.
