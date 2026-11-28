import { execFileSync } from "node:child_process";
import { ProxyAgent, Socks5ProxyAgent, type Dispatcher } from "undici";
import { getAppSettings } from "./db";

let cachedMacProxy: { value: string | null; expiresAt: number } | null = null;
const dispatcherCache = new Map<string, Dispatcher>();

export function detectMacSystemProxy(): string | null {
  if (process.platform !== "darwin") return null;
  if (cachedMacProxy && cachedMacProxy.expiresAt > Date.now()) {
    return cachedMacProxy.value;
  }

  let detected: string | null = null;
  try {
    const out = execFileSync("/usr/sbin/scutil", ["--proxy"], {
      encoding: "utf8",
      timeout: 2000,
    });
    const getVal = (key: string): string | null => {
      const m = out.match(new RegExp(`\\b${key}\\s*:\\s*([^\\s\\n]+)`));
      return m ? m[1].trim() : null;
    };

    if (getVal("HTTPSEnable") === "1") {
      const host = getVal("HTTPSProxy");
      const port = getVal("HTTPSPort");
      if (host && port) detected = `http://${host}:${port}`;
    }
    if (!detected && getVal("HTTPEnable") === "1") {
      const host = getVal("HTTPProxy");
      const port = getVal("HTTPPort");
      if (host && port) detected = `http://${host}:${port}`;
    }
    if (!detected && getVal("SOCKSEnable") === "1") {
      const host = getVal("SOCKSProxy");
      const port = getVal("SOCKSPort");
      if (host && port) detected = `socks5://${host}:${port}`;
    }
  } catch {
    detected = null;
  }

  cachedMacProxy = { value: detected, expiresAt: Date.now() + 30_000 };
  return detected;
}

export function resolveEffectiveProxyUrl(): string | null {
  if (process.env.NODE_ENV === "test") return null;

  let proxyMode: "system" | "custom" | "direct" = "system";
  let proxyUrl = "";
  try {
    const settings = getAppSettings();
    proxyMode = settings.proxyMode;
    proxyUrl = settings.proxyUrl;
  } catch {
    proxyMode = "system";
  }

  if (proxyMode === "direct") return null;
  if (proxyMode === "custom" && proxyUrl.trim()) {
    return proxyUrl.trim();
  }

  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;
  if (envProxy?.trim()) return envProxy.trim();

  return detectMacSystemProxy();
}

function getDispatcherForProxy(proxyUrl: string): Dispatcher {
  const existing = dispatcherCache.get(proxyUrl);
  if (existing) return existing;
  const agent = proxyUrl.toLowerCase().startsWith("socks")
    ? new Socks5ProxyAgent(proxyUrl)
    : new ProxyAgent({
        uri: proxyUrl,
        headersTimeout: 45_000,
        bodyTimeout: 60_000,
        keepAliveTimeout: 15_000,
      });
  dispatcherCache.set(proxyUrl, agent);
  return agent;
}

function isLocalhostUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export async function proxyFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const proxyUrl = resolveEffectiveProxyUrl();
  if (!proxyUrl || isLocalhostUrl(urlStr)) {
    return fetch(input, init);
  }

  const dispatcher = getDispatcherForProxy(proxyUrl);
  return fetch(input, {
    ...init,
    dispatcher,
  } as RequestInit);
}
