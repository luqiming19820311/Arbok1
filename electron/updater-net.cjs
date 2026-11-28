/* eslint-disable @typescript-eslint/no-require-imports */
const { execFile, execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function detectMacSystemProxy({
  platform = process.platform,
  execFileSyncImpl = execFileSync,
} = {}) {
  if (platform !== "darwin") return null;
  try {
    const out = execFileSyncImpl("/usr/sbin/scutil", ["--proxy"], {
      encoding: "utf8",
      timeout: 2000,
    });
    const getVal = (key) => {
      const m = out.match(new RegExp(`\\b${key}\\s*:\\s*([^\\s\\n]+)`));
      return m ? m[1].trim() : null;
    };

    if (getVal("HTTPSEnable") === "1") {
      const host = getVal("HTTPSProxy");
      const port = getVal("HTTPSPort");
      if (host && port) return `http://${host}:${port}`;
    }
    if (getVal("HTTPEnable") === "1") {
      const host = getVal("HTTPProxy");
      const port = getVal("HTTPPort");
      if (host && port) return `http://${host}:${port}`;
    }
    if (getVal("SOCKSEnable") === "1") {
      const host = getVal("SOCKSProxy");
      const port = getVal("SOCKSPort");
      if (host && port) return `socks5://${host}:${port}`;
    }
  } catch {
    return null;
  }
  return null;
}

function buildProxyCandidates({
  proxyMode = "system",
  proxyUrl = "",
  env = process.env,
  systemProxy = detectMacSystemProxy(),
} = {}) {
  const candidates = [];
  const pushUnique = (val) => {
    const normalized = typeof val === "string" ? val.trim() || null : null;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  const envProxy =
    env.HTTPS_PROXY ||
    env.https_proxy ||
    env.HTTP_PROXY ||
    env.http_proxy ||
    env.ALL_PROXY ||
    env.all_proxy ||
    "";

  if (proxyMode === "direct") {
    pushUnique(null);
    if (systemProxy) pushUnique(systemProxy);
    return candidates;
  }

  if (proxyMode === "custom" && proxyUrl && proxyUrl.trim()) {
    pushUnique(proxyUrl);
    if (systemProxy) pushUnique(systemProxy);
    pushUnique(null);
    return candidates;
  }

  if (envProxy.trim()) pushUnique(envProxy);
  if (systemProxy) pushUnique(systemProxy);
  pushUnique(null);
  return candidates;
}

function hasSystemCurl() {
  return fs.existsSync("/usr/bin/curl");
}

function runCurlJson(url, { proxy, userAgent, timeoutSec = 25 } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "-L",
      "--http1.1",
      "--connect-timeout",
      "12",
      "--max-time",
      String(timeoutSec),
      "-H",
      "Accept: application/vnd.github+json",
      "-A",
      userAgent || "Arbok",
      "-w",
      "\n__ARBOK_HTTP_STATUS__:%{http_code}",
    ];
    if (proxy) {
      args.push("-x", proxy);
    } else {
      args.push("--noproxy", "*");
    }
    args.push(url);

    execFile(
      "/usr/bin/curl",
      args,
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: (timeoutSec + 5) * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          const detail = (stderr || err.message || "curl failed").trim();
          reject(new Error(detail));
          return;
        }
        const marker = "\n__ARBOK_HTTP_STATUS__:";
        const idx = stdout.lastIndexOf(marker);
        if (idx === -1) {
          reject(new Error("无法解析 GitHub API 响应状态码"));
          return;
        }
        const body = stdout.slice(0, idx);
        const status = Number.parseInt(stdout.slice(idx + marker.length).trim(), 10) || 0;
        resolve({ status, body });
      }
    );
  });
}

async function fetchJsonWithFallback(
  url,
  {
    proxyMode = "system",
    proxyUrl = "",
    userAgent = "Arbok",
    electronNetFetch = null,
    useCurl = hasSystemCurl(),
    curlRunner = runCurlJson,
    systemProxy = undefined,
  } = {}
) {
  const candidates = buildProxyCandidates({
    proxyMode,
    proxyUrl,
    systemProxy: systemProxy !== undefined ? systemProxy : detectMacSystemProxy(),
  });
  let lastError = null;

  if (useCurl) {
    for (const proxy of candidates) {
      try {
        const res = await curlRunner(url, { proxy, userAgent });
        if (res.status === 404) {
          return { status: 404, ok: false, data: null };
        }
        if (res.status >= 200 && res.status < 300) {
          return { status: res.status, ok: true, data: JSON.parse(res.body) };
        }
        if (res.status >= 400 && res.status < 500) {
          return { status: res.status, ok: false, data: null };
        }
        lastError = new Error(`GitHub 返回 HTTP ${res.status}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  if (typeof electronNetFetch === "function") {
    try {
      const res = await electronNetFetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": userAgent,
        },
      });
      if (res.status === 404) {
        return { status: 404, ok: false, data: null };
      }
      if (!res.ok) {
        return { status: res.status, ok: false, data: null };
      }
      return { status: res.status, ok: true, data: await res.json() };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("连接 GitHub 更新服务器失败，请检查网络或代理设置");
}

function runCurlDownload(
  url,
  partPath,
  { proxy, userAgent, totalBytes = 0, onProgress } = {}
) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(partPath), { recursive: true });
    try {
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
    } catch {
      // Ignore stale partial file cleanup errors.
    }

    const args = [
      "-f",
      "-L",
      "-sS",
      "--http1.1",
      "--retry",
      "2",
      "--retry-delay",
      "2",
      "--connect-timeout",
      "20",
      "--speed-limit",
      "5120",
      "--speed-time",
      "30",
      "-A",
      userAgent || "Arbok",
      "-o",
      partPath,
    ];
    if (proxy) {
      args.push("-x", proxy);
    } else {
      args.push("--noproxy", "*");
    }
    args.push(url);

    const child = spawn("/usr/bin/curl", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderrBuf = "";
    child.stderr.on("data", (chunk) => {
      stderrBuf = (stderrBuf + chunk.toString("utf8")).slice(-2000);
    });

    const timer = setInterval(() => {
      try {
        if (!fs.existsSync(partPath)) return;
        const transferred = fs.statSync(partPath).size;
        const percent =
          totalBytes > 0
            ? Math.min(99, Math.round((transferred / totalBytes) * 100))
            : 0;
        if (typeof onProgress === "function") {
          onProgress({ transferredBytes: transferred, totalBytes, percent });
        }
      } catch {
        // Ignore transient stat errors while curl writes.
      }
    }, 250);

    child.on("error", (err) => {
      clearInterval(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearInterval(timer);
      if (code !== 0) {
        const msg = stderrBuf.trim() || `curl 下载失败（退出码 ${code}）`;
        reject(new Error(msg));
        return;
      }
      if (!fs.existsSync(partPath)) {
        reject(new Error("更新包下载后未生成文件"));
        return;
      }
      const stat = fs.statSync(partPath);
      if (stat.size <= 0) {
        reject(new Error("下载的更新包为空"));
        return;
      }
      if (totalBytes > 0 && stat.size < Math.floor(totalBytes * 0.98)) {
        reject(
          new Error(
            `更新包下载不完整（${stat.size} / ${totalBytes} bytes）`
          )
        );
        return;
      }
      resolve({ transferredBytes: stat.size, totalBytes: totalBytes || stat.size });
    });
  });
}

async function downloadFileWithFallback(
  url,
  partPath,
  {
    proxyMode = "system",
    proxyUrl = "",
    userAgent = "Arbok",
    totalBytes = 0,
    onProgress,
    electronNetFetch = null,
    useCurl = hasSystemCurl(),
    curlDownloader = runCurlDownload,
    systemProxy = undefined,
  } = {}
) {
  const candidates = buildProxyCandidates({
    proxyMode,
    proxyUrl,
    systemProxy: systemProxy !== undefined ? systemProxy : detectMacSystemProxy(),
  });
  let lastError = null;

  if (useCurl) {
    for (const proxy of candidates) {
      try {
        return await curlDownloader(url, partPath, {
          proxy,
          userAgent,
          totalBytes,
          onProgress,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
        } catch {
          // Ignore partial cleanup errors between retries.
        }
      }
    }
  }

  if (typeof electronNetFetch === "function") {
    try {
      const res = await electronNetFetch(url, {
        headers: { "User-Agent": userAgent },
      });
      if (!res.ok || !res.body) {
        throw new Error(`下载更新失败（HTTP ${res.status}）`);
      }
      const headerLen = Number(res.headers.get("content-length") || 0);
      const expectedTotal = headerLen > 0 ? headerLen : totalBytes || 0;
      const writer = fs.createWriteStream(partPath);
      const reader = res.body.getReader();
      let transferred = 0;
      let lastEmitAt = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          transferred += value.byteLength;
          if (!writer.write(Buffer.from(value))) {
            await new Promise((resolve) => writer.once("drain", resolve));
          }
          const now = Date.now();
          if (now - lastEmitAt >= 250 && typeof onProgress === "function") {
            lastEmitAt = now;
            const percent =
              expectedTotal > 0
                ? Math.min(99, Math.round((transferred / expectedTotal) * 100))
                : 0;
            onProgress({
              transferredBytes: transferred,
              totalBytes: expectedTotal,
              percent,
            });
          }
        }
      }

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        writer.end();
      });
      return {
        transferredBytes: transferred,
        totalBytes: expectedTotal || transferred,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("自动下载更新失败，请检查网络连接或代理设置");
}

module.exports = {
  buildProxyCandidates,
  detectMacSystemProxy,
  downloadFileWithFallback,
  fetchJsonWithFallback,
};
