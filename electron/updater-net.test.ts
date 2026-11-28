import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import updaterNetRaw from "./updater-net.cjs";

interface UpdaterNetModule {
  detectMacSystemProxy: (opts?: {
    platform?: string;
    execFileSyncImpl?: (cmd: string, args: string[], opts: unknown) => string;
  }) => string | null;
  buildProxyCandidates: (opts?: {
    proxyMode?: "system" | "custom" | "direct";
    proxyUrl?: string;
    env?: Record<string, string | undefined>;
    systemProxy?: string | null;
  }) => Array<string | null>;
  fetchJsonWithFallback: (
    url: string,
    opts?: {
      proxyMode?: "system" | "custom" | "direct";
      proxyUrl?: string;
      userAgent?: string;
      systemProxy?: string | null;
      useCurl?: boolean;
      curlRunner?: (
        url: string,
        opts?: { proxy?: string | null; userAgent?: string }
      ) => Promise<{ status: number; body: string }>;
    }
  ) => Promise<{ status: number; ok: boolean; data: unknown }>;
  downloadFileWithFallback: (
    url: string,
    destPartPath: string,
    opts?: {
      proxyMode?: "system" | "custom" | "direct";
      proxyUrl?: string;
      userAgent?: string;
      totalBytes?: number;
      systemProxy?: string | null;
      useCurl?: boolean;
      onProgress?: (p: {
        transferredBytes: number;
        totalBytes: number;
        percent: number;
      }) => void;
      curlDownloader?: (
        url: string,
        dest: string,
        opts?: {
          proxy?: string | null;
          onProgress?: (p: {
            transferredBytes: number;
            totalBytes: number;
            percent: number;
          }) => void;
        }
      ) => Promise<{ transferredBytes: number; totalBytes: number }>;
    }
  ) => Promise<{ transferredBytes: number; totalBytes: number }>;
}

const {
  buildProxyCandidates,
  detectMacSystemProxy,
  downloadFileWithFallback,
  fetchJsonWithFallback,
} = updaterNetRaw as unknown as UpdaterNetModule;

describe("Electron OTA updater network transport", () => {
  it("parses macOS scutil --proxy output for HTTPS, HTTP, and SOCKS proxies", () => {
    const httpsProxy = detectMacSystemProxy({
      platform: "darwin",
      execFileSyncImpl: () =>
        "HTTPEnable : 1\nHTTPPort : 1082\nHTTPProxy : 127.0.0.1\nHTTPSEnable : 1\nHTTPSPort : 1082\nHTTPSProxy : 127.0.0.1\n",
    });
    expect(httpsProxy).toBe("http://127.0.0.1:1082");

    const socksProxy = detectMacSystemProxy({
      platform: "darwin",
      execFileSyncImpl: () =>
        "HTTPSEnable : 0\nHTTPEnable : 0\nSOCKSEnable : 1\nSOCKSPort : 1080\nSOCKSProxy : 127.0.0.1\n",
    });
    expect(socksProxy).toBe("socks5://127.0.0.1:1080");
  });

  it("builds ordered proxy + direct fallback candidates for each proxyMode", () => {
    expect(
      buildProxyCandidates({
        proxyMode: "system",
        env: {},
        systemProxy: "http://127.0.0.1:1082",
      })
    ).toEqual(["http://127.0.0.1:1082", null]);

    expect(
      buildProxyCandidates({
        proxyMode: "custom",
        proxyUrl: "http://127.0.0.1:7890",
        env: {},
        systemProxy: "http://127.0.0.1:1082",
      })
    ).toEqual(["http://127.0.0.1:7890", "http://127.0.0.1:1082", null]);

    expect(
      buildProxyCandidates({
        proxyMode: "direct",
        env: {},
        systemProxy: "http://127.0.0.1:1082",
      })
    ).toEqual([null, "http://127.0.0.1:1082"]);
  });

  it("falls back automatically to direct when proxy fails during JSON check", async () => {
    const triedProxies: Array<string | null> = [];
    const curlRunner = vi.fn(
      async (_url: string, opts?: { proxy?: string | null }) => {
        triedProxies.push(opts?.proxy ?? null);
        if (opts?.proxy) {
          throw new Error("curl: (7) Failed to connect to 127.0.0.1 port 1082");
        }
        return {
          status: 200,
          body: JSON.stringify({ tag_name: "v0.2.3" }),
        };
      }
    );

    const res = await fetchJsonWithFallback(
      "https://api.github.com/repos/luqiming19820311/Arbok1/releases/latest",
      {
        proxyMode: "system",
        systemProxy: "http://127.0.0.1:1082",
        useCurl: true,
        curlRunner,
      }
    );

    expect(triedProxies).toEqual(["http://127.0.0.1:1082", null]);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ tag_name: "v0.2.3" });
  });

  it("falls back cleanly across proxy candidates during asset download", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-ota-test-"));
    const partPath = path.join(tmpDir, "Arbok-0.2.3-arm64-mac.zip.part");
    const triedProxies: Array<string | null> = [];

    const curlDownloader = vi.fn(
      async (
        _url: string,
        dest: string,
        opts?: {
          proxy?: string | null;
          onProgress?: (p: {
            percent: number;
            transferredBytes: number;
            totalBytes: number;
          }) => void;
        }
      ) => {
        triedProxies.push(opts?.proxy ?? null);
        if (opts?.proxy === "http://127.0.0.1:7890") {
          throw new Error("net::ERR_PROXY_CONNECTION_FAILED");
        }
        fs.writeFileSync(dest, Buffer.alloc(2048, 1));
        opts?.onProgress?.({
          percent: 50,
          transferredBytes: 1024,
          totalBytes: 2048,
        });
        return { transferredBytes: 2048, totalBytes: 2048 };
      }
    );

    try {
      const progressEvents: number[] = [];
      const result = await downloadFileWithFallback(
        "https://github.com/luqiming19820311/Arbok1/releases/download/v0.2.3/Arbok-0.2.3-arm64-mac.zip",
        partPath,
        {
          proxyMode: "custom",
          proxyUrl: "http://127.0.0.1:7890",
          systemProxy: "http://127.0.0.1:1082",
          useCurl: true,
          curlDownloader,
          onProgress: (p) => progressEvents.push(p.percent),
        }
      );

      expect(triedProxies).toEqual([
        "http://127.0.0.1:7890",
        "http://127.0.0.1:1082",
      ]);
      expect(result.transferredBytes).toBe(2048);
      expect(progressEvents).toEqual([50]);
      expect(fs.existsSync(partPath)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
