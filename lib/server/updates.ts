import type { UpdateCheckResult } from "@/components/arbok/types";
import { proxyFetch } from "./proxy";

export const APP_VERSION = "0.1.0";
export const GITHUB_OWNER_URL = "https://github.com/luqiming19820311";
export const DEFAULT_OTA_REPO = "luqiming19820311/Arbok1";

export function normalizeGitHubRepoSlug(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return DEFAULT_OTA_REPO;
  const urlMatch = trimmed.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i
  );
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/i, "")}`;
  }
  const slugMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (slugMatch) {
    return `${slugMatch[1]}/${slugMatch[2]}`;
  }
  return DEFAULT_OTA_REPO;
}

function parseSemverParts(version: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
} {
  const cleaned = version.trim().replace(/^[vV]/, "");
  const [core, ...preParts] = cleaned.split("-");
  const [maj, min, pat] = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return {
    major: maj ?? 0,
    minor: min ?? 0,
    patch: pat ?? 0,
    prerelease: preParts.join("-"),
  };
}

export function compareSemver(current: string, latest: string): number {
  const a = parseSemverParts(current);
  const b = parseSemverParts(latest);
  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  if (a.patch !== b.patch) return b.patch - a.patch;
  if (a.prerelease && !b.prerelease) return 1;
  if (!a.prerelease && b.prerelease) return -1;
  return b.prerelease.localeCompare(a.prerelease);
}

export async function checkGitHubUpdate(options?: {
  repo?: string;
  currentVersion?: string;
  fetchImpl?: typeof fetch;
}): Promise<UpdateCheckResult> {
  const repo = normalizeGitHubRepoSlug(options?.repo);
  const currentVersion = options?.currentVersion ?? APP_VERSION;
  const doFetch = options?.fetchImpl ?? proxyFetch;
  const releasePageUrl = `https://github.com/${repo}/releases`;

  try {
    const res = await doFetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Arbok/${currentVersion}`,
        },
      }
    );

    if (res.status === 404) {
      return {
        status: "no-release",
        currentVersion,
        latestVersion: currentVersion,
        releaseUrl: releasePageUrl,
        repo,
        message: `已经是最新版本（V${currentVersion}，待发布首个 GitHub Release 后自动检查更新）`,
      };
    }

    if (!res.ok) {
      return {
        status: "error",
        currentVersion,
        releaseUrl: releasePageUrl,
        repo,
        message: `检查更新失败（GitHub API 返回 ${res.status}）`,
      };
    }

    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      published_at?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };

    const latestTag = (data.tag_name ?? currentVersion).replace(/^[vV]/, "");
    const cmp = compareSemver(currentVersion, latestTag);
    const macAsset = (data.assets ?? []).find((a) =>
      /\.(dmg|zip|pkg|app\.tar\.gz)$/i.test(a.name ?? "")
    );

    if (cmp > 0) {
      return {
        status: "update-available",
        currentVersion,
        latestVersion: latestTag,
        releaseUrl: data.html_url ?? releasePageUrl,
        downloadUrl: macAsset?.browser_download_url ?? data.html_url ?? releasePageUrl,
        notes: data.body?.trim().slice(0, 360),
        publishedAt: data.published_at,
        repo,
        message: `发现新版本 V${latestTag}（当前 V${currentVersion}）`,
      };
    }

    return {
      status: "up-to-date",
      currentVersion,
      latestVersion: latestTag,
      releaseUrl: data.html_url ?? releasePageUrl,
      publishedAt: data.published_at,
      repo,
      message: "已经是最新版本",
    };
  } catch (err) {
    return {
      status: "error",
      currentVersion,
      releaseUrl: releasePageUrl,
      repo,
      message:
        err instanceof Error
          ? `检查更新请求失败：${err.message}`
          : "检查更新失败，请检查网络连接或代理设置",
    };
  }
}
