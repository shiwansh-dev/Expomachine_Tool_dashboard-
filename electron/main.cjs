const { app, BrowserWindow, shell } = require("electron");
const http = require("http");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const next = require("next");

let mainWindow = null;
let server = null;

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
    return true;
  }

  return false;
}

function loadDesktopEnv() {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(appPath, ".env.local"),
    path.join(appPath, ".env"),
    path.join(process.resourcesPath, ".env.local"),
    path.join(process.resourcesPath, ".env")
  ];

  for (const candidate of candidates) {
    loadEnvFile(candidate);
  }
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: "#f4efe7",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return mainWindow.loadURL(`http://127.0.0.1:${port}/live-status`);
}

async function startNextServer() {
  loadDesktopEnv();

  const isDev = !app.isPackaged;
  const appDir = app.getAppPath();
  const nextApp = next({
    dev: isDev,
    dir: appDir,
    conf: {
      distDir: ".next"
    }
  });

  await nextApp.prepare();

  const handler = nextApp.getRequestHandler();
  server = http.createServer((req, res) => {
    handler(req, res);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server.address().port;
}

app.whenReady().then(async () => {
  try {
    const port = await startNextServer();
    await createWindow(port);
  } catch (error) {
    console.error("Failed to start desktop app:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (server) {
    server.close();
    server = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0 && !server) {
    const port = await startNextServer();
    await createWindow(port);
  }
});
