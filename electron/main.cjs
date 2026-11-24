/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}

const isDev = !app.isPackaged;
let mainWindow = null;
let serverProcess = null;
let serverPort = 3000;
let isQuitting = false;

function buildEnrichedPath() {
  const home = os.homedir();
  const extras = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  const current = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return Array.from(new Set([...extras, ...current])).join(path.delimiter);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 3456;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServerReady(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (isQuitting) {
        reject(new Error("Application is quitting"));
        return;
      }
      const req = http.get(
        { hostname: "127.0.0.1", port, path: "/api/updates/check", timeout: 2000 },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Embedded server failed to start within ${timeoutMs}ms`));
          return;
        }
        setTimeout(check, 250);
      });
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Embedded server timed out after ${timeoutMs}ms`));
          return;
        }
        setTimeout(check, 250);
      });
    };
    check();
  });
}

function getStandaloneServerDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone");
  }
  return path.join(__dirname, "..", ".next", "standalone");
}

async function startEmbeddedServer() {
  if (isDev && process.env.ARBOK_DEV_URL) {
    return process.env.ARBOK_DEV_URL;
  }

  const standaloneDir = getStandaloneServerDir();
  const serverScript = path.join(standaloneDir, "server.js");
  if (!fs.existsSync(serverScript)) {
    throw new Error(`未找到内置服务端入口文件：${serverScript}`);
  }

  serverPort = await getFreePort();
  const userDataDir = app.getPath("userData");
  fs.mkdirSync(userDataDir, { recursive: true });

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(serverPort),
    ARBOK_DATA_DIR: userDataDir,
    PATH: buildEnrichedPath(),
  };

  let stderrLog = "";
  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stderr?.on("data", (chunk) => {
    stderrLog = (stderrLog + chunk.toString("utf8")).slice(-4000);
  });

  serverProcess.on("exit", (code) => {
    if (!isQuitting && code !== 0) {
      console.error("[Arbok server exited unexpectedly]", code, stderrLog);
    }
    serverProcess = null;
  });

  await waitForServerReady(serverPort, 30000);
  return `http://127.0.0.1:${serverPort}`;
}

function stopEmbeddedServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill("SIGTERM");
    } catch {
      // ignore
    }
    serverProcess = null;
  }
}

function setupAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("arbok:update-event", {
      type: "update-available",
      version: info?.version,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("arbok:update-event", {
      type: "update-downloaded",
      version: info?.version,
    });
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("arbok:update-event", {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 5000);
}

ipcMain.handle("arbok:get-version", () => app.getVersion());
ipcMain.handle("arbok:set-auto-download", (_event, enabled) => {
  if (autoUpdater) {
    autoUpdater.autoDownload = Boolean(enabled);
  }
  return Boolean(enabled);
});
ipcMain.handle("arbok:check-update", async () => {
  if (!autoUpdater || !app.isPackaged) {
    return { ok: false, reason: "dev-mode" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      version: result?.updateInfo?.version ?? app.getVersion(),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});
ipcMain.handle("arbok:quit-and-install", () => {
  if (autoUpdater && app.isPackaged) {
    isQuitting = true;
    stopEmbeddedServer();
    autoUpdater.quitAndInstall();
  }
});

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 680,
    title: "Arbok",
    backgroundColor: "#f7f6f3",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (/^https?:\/\//i.test(targetUrl)) {
      void shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupAppMenu();
    try {
      const url = await startEmbeddedServer();
      await createWindow(url);
      setupAutoUpdater();
    } catch (err) {
      dialog.showErrorBox(
        "Arbok 启动失败",
        err instanceof Error ? err.message : String(err)
      );
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
        void createWindow(`http://127.0.0.1:${serverPort}`);
      }
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
    stopEmbeddedServer();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
