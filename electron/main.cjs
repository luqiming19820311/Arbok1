/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell, utilityProcess } = require("electron");
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
let isPipActive = false;
let prePipWindowState = null;
let lastPipBounds = null;

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

function resolveMacHelperExecutable() {
  if (process.platform !== "darwin") return null;
  const frameworksDir = path.resolve(path.dirname(process.execPath), "..", "Frameworks");
  if (!fs.existsSync(frameworksDir)) return null;
  const helperApp = fs
    .readdirSync(frameworksDir)
    .find((name) => /Helper\.app$/i.test(name) && !/\((GPU|Plugin|Renderer)\)/i.test(name));
  if (!helperApp) return null;
  const binName = helperApp.replace(/\.app$/i, "");
  const helperBin = path.join(frameworksDir, helperApp, "Contents", "MacOS", binName);
  return fs.existsSync(helperBin) ? helperBin : null;
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

  const baseEnv = {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(serverPort),
    ARBOK_DATA_DIR: userDataDir,
    PATH: buildEnrichedPath(),
  };

  let stderrLog = "";

  // Use Electron's utilityProcess (backed by LSUIElement Helper) so macOS never spawns a Dock "exec" icon.
  if (utilityProcess && typeof utilityProcess.fork === "function") {
    const child = utilityProcess.fork(serverScript, [], {
      cwd: standaloneDir,
      env: baseEnv,
      stdio: "pipe",
      serviceName: "Arbok Embedded Server",
    });
    serverProcess = child;

    child.stderr?.on("data", (chunk) => {
      stderrLog = (stderrLog + chunk.toString("utf8")).slice(-4000);
    });

    child.on("exit", (code) => {
      if (!isQuitting && code !== 0) {
        console.error("[Arbok server exited unexpectedly]", code, stderrLog);
      }
      if (serverProcess === child) {
        serverProcess = null;
      }
    });
  } else {
    const helperBin = resolveMacHelperExecutable();
    const child = spawn(helperBin || process.execPath, [serverScript], {
      cwd: standaloneDir,
      env: { ...baseEnv, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess = child;

    child.stderr?.on("data", (chunk) => {
      stderrLog = (stderrLog + chunk.toString("utf8")).slice(-4000);
    });

    child.on("exit", (code) => {
      if (!isQuitting && code !== 0) {
        console.error("[Arbok server exited unexpectedly]", code, stderrLog);
      }
      if (serverProcess === child) {
        serverProcess = null;
      }
    });
  }

  await waitForServerReady(serverPort, 30000);
  return `http://127.0.0.1:${serverPort}`;
}

function stopEmbeddedServer() {
  if (serverProcess) {
    try {
      serverProcess.kill();
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

ipcMain.handle("arbok:set-pip", (_event, enabled) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const next = Boolean(enabled);
  if (next === isPipActive) return isPipActive;

  if (next) {
    prePipWindowState = {
      bounds: mainWindow.getBounds(),
      wasMaximized: mainWindow.isMaximized(),
      wasFullScreen: mainWindow.isFullScreen(),
    };
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    }

    const display = screen.getDisplayMatching(mainWindow.getBounds());
    const workArea = display.workArea;
    const pipWidth = lastPipBounds?.width ?? 520;
    const pipHeight = lastPipBounds?.height ?? 320;
    const pipX =
      typeof lastPipBounds?.x === "number"
        ? Math.max(workArea.x, Math.min(workArea.x + workArea.width - pipWidth, lastPipBounds.x))
        : workArea.x + workArea.width - pipWidth - 24;
    const pipY =
      typeof lastPipBounds?.y === "number"
        ? Math.max(workArea.y, Math.min(workArea.y + workArea.height - pipHeight, lastPipBounds.y))
        : workArea.y + workArea.height - pipHeight - 24;

    mainWindow.setMinimumSize(320, 180);
    mainWindow.setBounds(
      { x: Math.round(pipX), y: Math.round(pipY), width: Math.round(pipWidth), height: Math.round(pipHeight) },
      true
    );
    mainWindow.setAspectRatio(16 / 9);
    mainWindow.setAlwaysOnTop(true, "floating");
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    isPipActive = true;
    return true;
  }

  lastPipBounds = mainWindow.getBounds();
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false);
  mainWindow.setAspectRatio(0);
  mainWindow.setMinimumSize(1024, 680);
  if (prePipWindowState?.bounds) {
    mainWindow.setBounds(prePipWindowState.bounds, true);
  } else {
    mainWindow.setSize(1380, 880, true);
  }
  if (prePipWindowState?.wasMaximized) {
    mainWindow.maximize();
  }
  prePipWindowState = null;
  isPipActive = false;
  return false;
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
    isPipActive = false;
    prePipWindowState = null;
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
