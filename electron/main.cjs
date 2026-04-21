const { app, BrowserWindow, dialog, shell } = require("electron");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow = null;
let serverProcess = null;
let activePort = null;

function getConfigDirectory() {
  return path.join(app.getPath("userData"), "config");
}

function getServerEntryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-server", "server.js");
  }

  return path.join(app.getAppPath(), ".next", "standalone", "server.js");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canListen(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();

    tester.once("error", () => {
      resolve(false);
    });

    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, "127.0.0.1");
  });
}

async function findAvailablePort(startPort = 3000) {
  let port = startPort;

  while (!(await canListen(port))) {
    port += 1;
  }

  return port;
}

function waitForServer(port, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(
        {
          hostname: "127.0.0.1",
          port,
          path: "/",
          timeout: 2000
        },
        (response) => {
          response.resume();
          resolve();
        }
      );

      request.on("error", async () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("Timed out while starting the dashboard server."));
          return;
        }

        await wait(500);
        probe();
      });

      request.on("timeout", () => {
        request.destroy(new Error("Dashboard server probe timed out."));
      });
    };

    probe();
  });
}

async function startNextServer() {
  activePort = await findAvailablePort(3000);
  const serverEntry = getServerEntryPath();

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(activePort),
      HOSTNAME: "127.0.0.1",
      APP_CONFIG_DIR: getConfigDirectory(),
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: "ignore",
    windowsHide: true
  });

  serverProcess.once("exit", (code) => {
    if (code !== 0 && !app.isQuitting) {
      dialog.showErrorBox(
        "Dashboard Server Error",
        `The internal dashboard server exited unexpectedly with code ${code ?? "unknown"}.`
      );
    }
  });

  await waitForServer(activePort);
}

async function createWindow() {
  await startNextServer();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f4efe7",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${activePort}`);
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }

  serverProcess = null;
}

app.on("before-quit", () => {
  app.isQuitting = true;
  stopServer();
});

app.whenReady().then(async () => {
  try {
    await createWindow();
  } catch (error) {
    dialog.showErrorBox(
      "Launch Failed",
      error instanceof Error ? error.message : "Unable to launch the dashboard application."
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await createWindow();
    } catch (error) {
      dialog.showErrorBox(
        "Launch Failed",
        error instanceof Error ? error.message : "Unable to relaunch the dashboard application."
      );
      app.quit();
    }
  }
});
