/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, ipcMain, Menu, net: electronNet, screen, shell, utilityProcess } = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const {
  downloadFileWithFallback,
  fetchJsonWithFallback,
} = require("./updater-net.cjs");

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
  channel: "stable",
  isPrerelease: false,
  downloadUrl: null,
  releaseUrl: null,
  assetName: null,
  downloadedFilePath: null,
  percent: 0,
  transferredBytes: 0,
  totalBytes: 0,
  autoDownload: true,
  proxyMode: "system",
  proxyUrl: "",
  message: "",
};

function normalizeUpdateChannel(raw) {
  return raw === "beta" ? "beta" : "stable";
}

function normalizeProxyMode(raw) {
  return raw === "custom" || raw === "direct" ? raw : "system";
}

function getUpdaterPrefsPath() {
  return path.join(app.getPath("userData"), "updater-prefs.json");
}

function loadUpdaterPrefs() {
  try {
    const raw = fs.readFileSync(getUpdaterPrefsPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.autoDownload === "boolean") {
      updaterState.autoDownload = parsed.autoDownload;
    }
    if (parsed.channel === "beta" || parsed.channel === "stable") {
      updaterState.channel = parsed.channel;
    }
    if (parsed.proxyMode) {
      updaterState.proxyMode = normalizeProxyMode(parsed.proxyMode);
    }
    if (typeof parsed.proxyUrl === "string") {
      updaterState.proxyUrl = parsed.proxyUrl.trim();
    }
  } catch {
    // Use default stable channel + autoDownload on first launch.
  }
}

function saveUpdaterPrefs() {
  try {
    const prefsPath = getUpdaterPrefsPath();
    fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
    fs.writeFileSync(
      prefsPath,
      JSON.stringify(
        {
          channel: updaterState.channel,
          autoDownload: updaterState.autoDownload,
          proxyMode: updaterState.proxyMode,
          proxyUrl: updaterState.proxyUrl,
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  } catch {
    // Best-effort preference persistence.
  }
}

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
  const preStr = preParts.join("-");
  return {
    major: maj || 0,
    minor: min || 0,
    patch: pat || 0,
    prerelease: preStr ? preStr.split(".") : [],
  };
}

function comparePrereleaseIdentifiers(aParts, bParts) {
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aId = aParts[i];
    const bId = bParts[i];
    if (aId === undefined) return 1;
    if (bId === undefined) return -1;
    if (aId === bId) continue;

    const aNum = /^\d+$/.test(aId);
    const bNum = /^\d+$/.test(bId);
    if (aNum && bNum) {
      return Number.parseInt(bId, 10) - Number.parseInt(aId, 10);
    }
    if (aNum && !bNum) return 1;
    if (!aNum && bNum) return -1;
    return bId.localeCompare(aId);
  }
  return 0;
}

function compareSemver(current, latest) {
  const a = parseSemverParts(current);
  const b = parseSemverParts(latest);
  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  if (a.patch !== b.patch) return b.patch - a.patch;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return 1;
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return -1;
  return comparePrereleaseIdentifiers(a.prerelease, b.prerelease);
}

function pickHighestSemverRelease(releases) {
  let best = null;
  for (const item of Array.isArray(releases) ? releases : []) {
    if (!item || item.draft || !item.tag_name) continue;
    if (!best || compareSemver(best.tag_name, item.tag_name) > 0) {
      best = item;
    }
  }
  return best;
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
      const result = await downloadFileWithFallback(
        updaterState.downloadUrl,
        partPath,
        {
          proxyMode: updaterState.proxyMode,
          proxyUrl: updaterState.proxyUrl,
          userAgent: `Arbok/${app.getVersion()}`,
          totalBytes: updaterState.totalBytes || 0,
          electronNetFetch: (...args) => electronNet.fetch(...args),
          onProgress: ({ transferredBytes, totalBytes, percent }) => {
            emitUpdateState({
              status: "downloading",
              percent,
              transferredBytes,
              totalBytes,
              message: `正在自动下载 V${updaterState.latestVersion}（${percent}%）…`,
            });
          },
        }
      );

      fs.renameSync(partPath, targetPath);
      return emitUpdateState({
        status: "downloaded",
        percent: 100,
        transferredBytes: result.transferredBytes,
        totalBytes: result.totalBytes || result.transferredBytes,
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
  const channel = normalizeUpdateChannel(options.channel ?? updaterState.channel);
  const triggerAutoDownload =
    options.triggerAutoDownload !== undefined
      ? Boolean(options.triggerAutoDownload)
      : updaterState.autoDownload;

  emitUpdateState({
    status: "checking",
    channel,
    message:
      channel === "beta" ? "正在检查测试版更新…" : "正在检查更新…",
  });

  try {
    const endpoint =
      channel === "beta"
        ? `https://api.github.com/repos/${repo}/releases?per_page=15`
        : `https://api.github.com/repos/${repo}/releases/latest`;
    const res = await fetchJsonWithFallback(endpoint, {
      proxyMode: updaterState.proxyMode,
      proxyUrl: updaterState.proxyUrl,
      userAgent: `Arbok/${app.getVersion()}`,
      electronNetFetch: (...args) => electronNet.fetch(...args),
    });

    if (res.status === 404) {
      return emitUpdateState({
        status: "up-to-date",
        channel,
        isPrerelease: false,
        latestVersion: app.getVersion(),
        message: `已经是最新版本（V${app.getVersion()}）`,
      });
    }
    if (!res.ok) {
      throw new Error(`检查更新失败（GitHub 返回 ${res.status}）`);
    }

    const raw = res.data;
    const data = Array.isArray(raw) ? pickHighestSemverRelease(raw) : raw;
    if (!data || !data.tag_name) {
      return emitUpdateState({
        status: "up-to-date",
        channel,
        isPrerelease: false,
        latestVersion: app.getVersion(),
        releaseUrl: `https://github.com/${repo}/releases`,
        message: channel === "beta" ? "已经是最新测试版" : "已经是最新版本",
      });
    }

    const latestVersion = String(data.tag_name || app.getVersion()).replace(/^[vV]/, "");
    const isPrerelease = Boolean(data.prerelease) || latestVersion.includes("-");
    const cmp = compareSemver(app.getVersion(), latestVersion);
    if (cmp <= 0) {
      return emitUpdateState({
        status: "up-to-date",
        channel,
        isPrerelease,
        latestVersion,
        releaseUrl: data.html_url || `https://github.com/${repo}/releases`,
        message: channel === "beta" ? "已经是最新测试版" : "已经是最新版本",
      });
    }

    const asset = pickBestMacAsset(data.assets);
    emitUpdateState({
      status: "available",
      channel,
      isPrerelease,
      latestVersion,
      releaseUrl: data.html_url || `https://github.com/${repo}/releases`,
      downloadUrl: asset?.browser_download_url || null,
      assetName: asset?.name || null,
      totalBytes: Number(asset?.size || 0),
      message: `发现新${isPrerelease ? "测试版" : "版本"} V${latestVersion}（当前 V${app.getVersion()}）`,
    });

    if (triggerAutoDownload && asset?.browser_download_url) {
      return await downloadAppUpdate();
    }
    return { ...updaterState };
  } catch (err) {
    return emitUpdateState({
      status: "error",
      channel,
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

function execFileAsync(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, opts, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || err.message || `${bin} failed`).trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function installDownloadedUpdate({ relaunch = true, bypassGuard = false } = {}) {
  if (updateInstallTriggered && !bypassGuard) return { ok: true };
  updateInstallTriggered = true;
  const filePath = updaterState.downloadedFilePath;
  if (!filePath || !fs.existsSync(filePath)) {
    updateInstallTriggered = false;
    return { ok: false, error: "尚未找到已下载的更新安装包" };
  }

  if (process.platform !== "darwin") {
    void shell.openPath(filePath);
    return { ok: true, openedExternal: true };
  }

  if (filePath.toLowerCase().endsWith(".dmg")) {
    void shell.openPath(filePath);
    return { ok: true, openedExternal: true };
  }

  if (!app.isPackaged) {
    updateInstallTriggered = false;
    shell.showItemInFolder(filePath);
    return { ok: true, openedExternal: true };
  }

  const currentAppPath = path.resolve(process.execPath, "..", "..", "..");
  if (!currentAppPath.endsWith(".app") || !fs.existsSync(currentAppPath)) {
    updateInstallTriggered = false;
    shell.showItemInFolder(filePath);
    return { ok: false, error: "未能定位当前 Arbok.app 安装路径" };
  }

  const parentDir = path.dirname(currentAppPath);
  try {
    fs.accessSync(parentDir, fs.constants.W_OK);
  } catch {
    updateInstallTriggered = false;
    shell.showItemInFolder(filePath);
    return {
      ok: false,
      error: "当前应用位于只读目录（如 DMG 镜像），请先将 Arbok 拖入「应用程序」文件夹后再自动更新",
    };
  }

  emitUpdateState({
    status: "installing",
    message: `正在解压并安装 V${updaterState.latestVersion}…`,
  });

  const updatesDir = path.join(app.getPath("userData"), "updates");
  const stageDir = path.join(updatesDir, `stage-${Date.now()}`);
  const logPath = path.join(updatesDir, "install.log");
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    await execFileAsync("/usr/bin/ditto", ["-xk", filePath, stageDir], {
      timeout: 120_000,
    });
    const newAppPath = findExtractedAppBundle(stageDir);
    if (!newAppPath) {
      throw new Error("更新包中未找到 Arbok.app");
    }
    try {
      await execFileAsync("/usr/bin/xattr", ["-cr", newAppPath], { timeout: 15_000 });
    } catch {
      // Best-effort quarantine cleanup.
    }

    const backupAppPath = path.join(
      parentDir,
      `.${path.basename(currentAppPath)}.backup-${Date.now()}`
    );

    const script = [
      'exec >>"$ARBOK_INSTALL_LOG" 2>&1',
      'echo "[$(date "+%Y-%m-%d %H:%M:%S")] Starting swap: $ARBOK_NEW_APP -> $ARBOK_TARGET_APP (pid=$ARBOK_PID)"',
      'i=0',
      'while kill -0 "$ARBOK_PID" 2>/dev/null && [ $i -lt 80 ]; do sleep 0.25; i=$((i + 1)); done',
      'sleep 0.5',
      'rm -rf "$ARBOK_BACKUP_APP"',
      'if mv "$ARBOK_TARGET_APP" "$ARBOK_BACKUP_APP"; then',
      '  if mv "$ARBOK_NEW_APP" "$ARBOK_TARGET_APP" || /usr/bin/ditto "$ARBOK_NEW_APP" "$ARBOK_TARGET_APP"; then',
      '    rm -rf "$ARBOK_BACKUP_APP" "$ARBOK_STAGE_DIR" "$ARBOK_ZIP_FILE"',
      '    /usr/bin/xattr -cr "$ARBOK_TARGET_APP" 2>/dev/null || true',
      '    echo "[$(date "+%Y-%m-%d %H:%M:%S")] Swap succeeded"',
      '    if [ "$ARBOK_RELAUNCH" = "1" ]; then /usr/bin/open "$ARBOK_TARGET_APP"; fi',
      '  else',
      '    echo "[$(date "+%Y-%m-%d %H:%M:%S")] Move/copy new app failed, restoring backup"',
      '    [ -d "$ARBOK_BACKUP_APP" ] && [ ! -d "$ARBOK_TARGET_APP" ] && mv "$ARBOK_BACKUP_APP" "$ARBOK_TARGET_APP"',
      '  fi',
      'else',
      '  echo "[$(date "+%Y-%m-%d %H:%M:%S")] Failed to move existing target app"',
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
        ARBOK_INSTALL_LOG: logPath,
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
    updateInstallTriggered = false;
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
  loadUpdaterPrefs();
  if (!app.isPackaged) return;
  setTimeout(() => {
    if (updaterState.autoDownload) {
      void checkForAppUpdates({
        repo: DEFAULT_OTA_REPO,
        channel: updaterState.channel,
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
  saveUpdaterPrefs();
  return updaterState.autoDownload;
});
ipcMain.handle("arbok:set-update-channel", (_event, channel) => {
  const next = normalizeUpdateChannel(channel);
  const changed = updaterState.channel !== next;
  updaterState.channel = next;
  saveUpdaterPrefs();
  if (changed && updaterState.status !== "downloading" && updaterState.status !== "installing") {
    emitUpdateState({
      status: "idle",
      channel: next,
      isPrerelease: false,
      latestVersion: null,
      downloadUrl: null,
      assetName: null,
      downloadedFilePath: null,
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0,
      message: "",
    });
  }
  return updaterState.channel;
});
ipcMain.handle("arbok:set-proxy-config", (_event, cfg) => {
  if (cfg && typeof cfg === "object") {
    updaterState.proxyMode = normalizeProxyMode(cfg.proxyMode);
    if (typeof cfg.proxyUrl === "string") {
      updaterState.proxyUrl = cfg.proxyUrl.trim();
    }
    saveUpdaterPrefs();
  }
  return {
    proxyMode: updaterState.proxyMode,
    proxyUrl: updaterState.proxyUrl,
  };
});
ipcMain.handle("arbok:check-update", async (_event, payload) => {
  const repo =
    typeof payload === "string"
      ? payload
      : typeof payload?.repo === "string"
        ? payload.repo
        : DEFAULT_OTA_REPO;
  const channel =
    payload && typeof payload === "object" && payload.channel
      ? normalizeUpdateChannel(payload.channel)
      : updaterState.channel;
  return await checkForAppUpdates({
    repo,
    channel,
    triggerAutoDownload: updaterState.autoDownload,
  });
});
ipcMain.handle("arbok:download-update", async () => {
  return await downloadAppUpdate();
});
ipcMain.handle("arbok:quit-and-install", async () => {
  return await installDownloadedUpdate({ relaunch: true });
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

  app.on("before-quit", (event) => {
    if (
      updaterState.status === "downloaded" &&
      updaterState.autoDownload &&
      !updateInstallTriggered
    ) {
      event.preventDefault();
      updateInstallTriggered = true;
      void installDownloadedUpdate({
        relaunch: false,
        bypassGuard: true,
      }).finally(() => {
        isQuitting = true;
        stopEmbeddedServer();
        app.quit();
      });
      return;
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
