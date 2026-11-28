/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, Menu, net: electronNet, screen, shell, utilityProcess } = require("electron");
const { execFileSync, spawn } = require("node:child_process");
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

const DEFAULT_OTA_REPO = "luqiming19820311/Arbok1";
let updateInstallTriggered = false;
let activeDownloadPromise = null;
const updaterState = {
  status: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  downloadUrl: null,
  releaseUrl: null,
  assetName: null,
  downloadedFilePath: null,
  percent: 0,
  transferredBytes: 0,
  totalBytes: 0,
  autoDownload: true,
  message: "",
};

function emitUpdateState(patch = {}) {
  Object.assign(updaterState, patch, { currentVersion: app.getVersion() });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("arbok:update-event", { ...updaterState });
  }
  return { ...updaterState };
}

function parseSemverParts(version) {
  const cleaned = String(version || "0.0.0").trim().replace(/^[vV]/, "");
  const [core, ...preParts] = cleaned.split("-");
  const [maj, min, pat] = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return { major: maj || 0, minor: min || 0, patch: pat || 0, prerelease: preParts.join("-") };
}

function compareSemver(current, latest) {
  const a = parseSemverParts(current);
  const b = parseSemverParts(latest);
  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  if (a.patch !== b.patch) return b.patch - a.patch;
  if (a.prerelease && !b.prerelease) return 1;
  if (!a.prerelease && b.prerelease) return -1;
  return b.prerelease.localeCompare(a.prerelease);
}

function normalizeRepoSlug(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return DEFAULT_OTA_REPO;
  const m = trimmed.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (m) return `${m[1]}/${m[2].replace(/\.git$/i, "")}`;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) return trimmed;
  return DEFAULT_OTA_REPO;
}

function pickBestMacAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const archToken = process.arch === "arm64" ? "arm64" : "x64";
  return (
    list.find((a) => new RegExp(`${archToken}.*\\.zip$`, "i").test(a?.name || "")) ||
    list.find((a) => /-mac\.zip$/i.test(a?.name || "")) ||
    list.find((a) => /\.zip$/i.test(a?.name || "") && !/blockmap/i.test(a?.name || "")) ||
    list.find((a) => new RegExp(`${archToken}.*\\.dmg$`, "i").test(a?.name || "")) ||
    list.find((a) => /\.dmg$/i.test(a?.name || "") && !/blockmap/i.test(a?.name || "")) ||
    null
  );
}

async function downloadAppUpdate() {
  if (activeDownloadPromise) return activeDownloadPromise;
  if (!updaterState.downloadUrl || !updaterState.assetName) {
    return emitUpdateState({
      status: "error",
      message: "未找到可下载的安装包链接",
    });
  }

  const updatesDir = path.join(app.getPath("userData"), "updates");
  fs.mkdirSync(updatesDir, { recursive: true });
  const targetPath = path.join(updatesDir, updaterState.assetName);
  const partPath = `${targetPath}.part`;

  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.size > 1024 * 1024 && (!updaterState.totalBytes || stat.size === updaterState.totalBytes)) {
      return emitUpdateState({
        status: "downloaded",
        percent: 100,
        transferredBytes: stat.size,
        totalBytes: stat.size,
        downloadedFilePath: targetPath,
        message: `新版本 V${updaterState.latestVersion} 已下载完成，重启后即可生效`,
      });
    }
  }

  activeDownloadPromise = (async () => {
    emitUpdateState({
      status: "downloading",
      percent: 0,
      transferredBytes: 0,
      message: `正在自动下载 V${updaterState.latestVersion}…`,
    });

    try {
      const res = await electronNet.fetch(updaterState.downloadUrl, {
        headers: { "User-Agent": `Arbok/${app.getVersion()}` },
      });
      if (!res.ok || !res.body) {
        throw new Error(`下载更新失败（HTTP ${res.status}）`);
      }

      const headerLen = Number(res.headers.get("content-length") || 0);
      const totalBytes = headerLen > 0 ? headerLen : updaterState.totalBytes || 0;
      const writer = fs.createWriteStream(partPath);
      const reader = res.body.getReader();
      let transferred = 0;
      let lastEmitAt = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          transferred += value.byteLength;
          writer.write(Buffer.from(value));
          const now = Date.now();
          if (now - lastEmitAt >= 250) {
            lastEmitAt = now;
            const percent =
              totalBytes > 0
                ? Math.min(99, Math.round((transferred / totalBytes) * 100))
                : 0;
            emitUpdateState({
              status: "downloading",
              percent,
              transferredBytes: transferred,
              totalBytes,
              message: `正在自动下载 V${updaterState.latestVersion}（${percent}%）…`,
            });
          }
        }
      }

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        writer.end();
      });

      fs.renameSync(partPath, targetPath);
      return emitUpdateState({
        status: "downloaded",
        percent: 100,
        transferredBytes: transferred,
        totalBytes: totalBytes || transferred,
        downloadedFilePath: targetPath,
        message: `新版本 V${updaterState.latestVersion} 已下载完成，重启后即可生效`,
      });
    } catch (err) {
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      } catch {
        // Ignore temp file cleanup error.
      }
      return emitUpdateState({
        status: "error",
        message: err instanceof Error ? err.message : "自动下载更新失败，请检查网络连接或代理设置",
      });
    } finally {
      activeDownloadPromise = null;
    }
  })();

  return activeDownloadPromise;
}

async function checkForAppUpdates(options = {}) {
  const repo = normalizeRepoSlug(options.repo);
  const triggerAutoDownload =
    options.triggerAutoDownload !== undefined
      ? Boolean(options.triggerAutoDownload)
      : updaterState.autoDownload;

  emitUpdateState({
    status: "checking",
    message: "正在检查更新…",
  });

  try {
    const res = await electronNet.fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Arbok/${app.getVersion()}`,
        },
      }
    );

    if (res.status === 404) {
      return emitUpdateState({
        status: "up-to-date",
        latestVersion: app.getVersion(),
        message: `已经是最新版本（V${app.getVersion()}）`,
      });
    }
    if (!res.ok) {
      throw new Error(`检查更新失败（GitHub 返回 ${res.status}）`);
    }

    const data = await res.json();
    const latestVersion = String(data.tag_name || app.getVersion()).replace(/^[vV]/, "");
    const cmp = compareSemver(app.getVersion(), latestVersion);
    if (cmp <= 0) {
      return emitUpdateState({
        status: "up-to-date",
        latestVersion,
        releaseUrl: data.html_url || `https://github.com/${repo}/releases`,
        message: "已经是最新版本",
      });
    }

    const asset = pickBestMacAsset(data.assets);
    emitUpdateState({
      status: "available",
      latestVersion,
      releaseUrl: data.html_url || `https://github.com/${repo}/releases`,
      downloadUrl: asset?.browser_download_url || null,
      assetName: asset?.name || null,
      totalBytes: Number(asset?.size || 0),
      message: `发现新版本 V${latestVersion}（当前 V${app.getVersion()}）`,
    });

    if (triggerAutoDownload && asset?.browser_download_url) {
      return await downloadAppUpdate();
    }
    return { ...updaterState };
  } catch (err) {
    return emitUpdateState({
      status: "error",
      message:
        err instanceof Error
          ? `检查更新失败：${err.message}`
          : "检查更新失败，请检查网络连接或代理设置",
    });
  }
}

function findExtractedAppBundle(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return path.join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = findExtractedAppBundle(path.join(dir, entry.name));
      if (nested) return nested;
    }
  }
  return null;
}

function installDownloadedUpdate({ relaunch = true } = {}) {
  if (updateInstallTriggered) return { ok: true };
  const filePath = updaterState.downloadedFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: "尚未找到已下载的更新安装包" };
  }

  if (process.platform !== "darwin") {
    void shell.openPath(filePath);
    return { ok: true, openedExternal: true };
  }

  if (filePath.toLowerCase().endsWith(".dmg")) {
    updateInstallTriggered = true;
    void shell.openPath(filePath);
    return { ok: true, openedExternal: true };
  }

  if (!app.isPackaged) {
    shell.showItemInFolder(filePath);
    return { ok: true, openedExternal: true };
  }

  const currentAppPath = path.resolve(process.execPath, "..", "..", "..");
  if (!currentAppPath.endsWith(".app") || !fs.existsSync(currentAppPath)) {
    shell.showItemInFolder(filePath);
    return { ok: false, error: "未能定位当前 Arbok.app 安装路径" };
  }

  const parentDir = path.dirname(currentAppPath);
  try {
    fs.accessSync(parentDir, fs.constants.W_OK);
  } catch {
    shell.showItemInFolder(filePath);
    return {
      ok: false,
      error: "当前应用位于只读目录（如 DMG 镜像），请先将 Arbok 拖入「应用程序」文件夹后再自动更新",
    };
  }

  emitUpdateState({
    status: "installing",
    message: `正在安装 V${updaterState.latestVersion} 并重启…`,
  });

  const stageDir = path.join(
    app.getPath("userData"),
    "updates",
    `stage-${Date.now()}`
  );
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    execFileSync("/usr/bin/ditto", ["-xk", filePath, stageDir], {
      timeout: 120_000,
    });
    const newAppPath = findExtractedAppBundle(stageDir);
    if (!newAppPath) {
      throw new Error("更新包中未找到 Arbok.app");
    }
    try {
      execFileSync("/usr/bin/xattr", ["-cr", newAppPath], { timeout: 15_000 });
    } catch {
      // Best-effort quarantine cleanup.
    }

    const backupAppPath = path.join(
      parentDir,
      `.${path.basename(currentAppPath)}.backup-${Date.now()}`
    );

    const script = [
      'i=0',
      'while kill -0 "$ARBOK_PID" 2>/dev/null && [ $i -lt 60 ]; do sleep 0.25; i=$((i + 1)); done',
      'rm -rf "$ARBOK_BACKUP_APP"',
      'if mv "$ARBOK_TARGET_APP" "$ARBOK_BACKUP_APP" && mv "$ARBOK_NEW_APP" "$ARBOK_TARGET_APP"; then',
      '  rm -rf "$ARBOK_BACKUP_APP" "$ARBOK_STAGE_DIR" "$ARBOK_ZIP_FILE"',
      '  /usr/bin/xattr -cr "$ARBOK_TARGET_APP" 2>/dev/null || true',
      '  if [ "$ARBOK_RELAUNCH" = "1" ]; then /usr/bin/open -n "$ARBOK_TARGET_APP"; fi',
      'else',
      '  [ -d "$ARBOK_BACKUP_APP" ] && [ ! -d "$ARBOK_TARGET_APP" ] && mv "$ARBOK_BACKUP_APP" "$ARBOK_TARGET_APP"',
      'fi',
    ].join("\n");

    const updaterProc = spawn("/bin/sh", ["-c", script], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        ARBOK_PID: String(process.pid),
        ARBOK_TARGET_APP: currentAppPath,
        ARBOK_NEW_APP: newAppPath,
        ARBOK_BACKUP_APP: backupAppPath,
        ARBOK_STAGE_DIR: stageDir,
        ARBOK_ZIP_FILE: filePath,
        ARBOK_RELAUNCH: relaunch ? "1" : "0",
      },
    });
    updaterProc.unref();
    updateInstallTriggered = true;

    if (relaunch) {
      isQuitting = true;
      stopEmbeddedServer();
      app.quit();
    }
    return { ok: true };
  } catch (err) {
    try {
      fs.rmSync(stageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors.
    }
    const msg = err instanceof Error ? err.message : "自动安装更新失败";
    emitUpdateState({ status: "error", message: msg });
    return { ok: false, error: msg };
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  setTimeout(() => {
    if (updaterState.autoDownload) {
      void checkForAppUpdates({
        repo: DEFAULT_OTA_REPO,
        triggerAutoDownload: true,
      });
    }
  }, 5000);
}

ipcMain.handle("arbok:get-version", () => app.getVersion());
ipcMain.handle("arbok:get-update-state", () => ({ ...updaterState }));
ipcMain.handle("arbok:set-auto-download", (_event, enabled) => {
  updaterState.autoDownload = Boolean(enabled);
  if (autoUpdater) {
    autoUpdater.autoDownload = updaterState.autoDownload;
  }
  return updaterState.autoDownload;
});
ipcMain.handle("arbok:check-update", async (_event, repo) => {
  return await checkForAppUpdates({
    repo: typeof repo === "string" ? repo : DEFAULT_OTA_REPO,
    triggerAutoDownload: updaterState.autoDownload,
  });
});
ipcMain.handle("arbok:download-update", async () => {
  return await downloadAppUpdate();
});
ipcMain.handle("arbok:quit-and-install", () => {
  return installDownloadedUpdate({ relaunch: true });
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
    if (
      updaterState.status === "downloaded" &&
      updaterState.autoDownload &&
      !updateInstallTriggered
    ) {
      installDownloadedUpdate({ relaunch: false });
    }
    isQuitting = true;
    stopEmbeddedServer();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
