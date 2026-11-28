import type { UpdateChannel, UpdateCheckResult } from "@/components/arbok/types";
import { APP_VERSION } from "@/lib/arbok/version";
import { proxyFetch } from "./proxy";

export { APP_VERSION };
export const GITHUB_OWNER_URL = "https://github.com/luqiming19820311";
export const DEFAULT_OTA_REPO = "luqiming19820311/Arbok1";

export function normalizeUpdateChannel(raw?: string): UpdateChannel {
  return raw === "beta" ? "beta" : "stable";
}

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
  prerelease: string[];
} {
  const cleaned = version.trim().replace(/^[vV]/, "");
  const [core, ...preParts] = cleaned.split("-");
  const [maj, min, pat] = core.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const preStr = preParts.join("-");
  return {
    major: maj ?? 0,
    minor: min ?? 0,
    patch: pat ?? 0,
    prerelease: preStr ? preStr.split(".") : [],
  };
}

function comparePrereleaseIdentifiers(aParts: string[], bParts: string[]): number {
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

export function compareSemver(current: string, latest: string): number {
  const a = parseSemverParts(current);
  const b = parseSemverParts(latest);
  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  if (a.patch !== b.patch) return b.patch - a.patch;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return 1;
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return -1;
  return comparePrereleaseIdentifiers(a.prerelease, b.prerelease);
}

interface GitHubReleasePayload {
  tag_name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

function pickHighestSemverRelease(
  releases: GitHubReleasePayload[]
): GitHubReleasePayload | null {
  let best: GitHubReleasePayload | null = null;
  for (const item of releases) {
    if (!item || item.draft || !item.tag_name) continue;
    if (!best || compareSemver(best.tag_name ?? "0.0.0", item.tag_name) > 0) {
      best = item;
    }
  }
  return best;
}

export async function checkGitHubUpdate(options?: {
  repo?: string;
  currentVersion?: string;
  channel?: UpdateChannel;
  fetchImpl?: typeof fetch;
}): Promise<UpdateCheckResult> {
  const repo = normalizeGitHubRepoSlug(options?.repo);
  const currentVersion = options?.currentVersion ?? APP_VERSION;
  const channel = normalizeUpdateChannel(options?.channel);
  const doFetch = options?.fetchImpl ?? proxyFetch;
  const releasePageUrl = `https://github.com/${repo}/releases`;

  try {
    const endpoint =
      channel === "beta"
        ? `https://api.github.com/repos/${repo}/releases?per_page=15`
        : `https://api.github.com/repos/${repo}/releases/latest`;

    const res = await doFetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Arbok/${currentVersion}`,
      },
    });

    if (res.status === 404) {
      return {
        status: "no-release",
        currentVersion,
        latestVersion: currentVersion,
        channel,
        isPrerelease: false,
        releaseUrl: releasePageUrl,
        repo,
        message: `已经是最新版本（V${currentVersion}，待发布首个 GitHub Release 后自动检查更新）`,
      };
    }

    if (!res.ok) {
      return {
        status: "error",
        currentVersion,
        channel,
        releaseUrl: releasePageUrl,
        repo,
        message: `检查更新失败（GitHub API 返回 ${res.status}）`,
      };
    }

    const raw = (await res.json()) as GitHubReleasePayload | GitHubReleasePayload[];
    const data = Array.isArray(raw) ? pickHighestSemverRelease(raw) : raw;

    if (!data || !data.tag_name) {
      return {
        status: "no-release",
        currentVersion,
        latestVersion: currentVersion,
        channel,
        isPrerelease: false,
        releaseUrl: releasePageUrl,
        repo,
        message: `已经是最新版本（V${currentVersion}，暂未找到可更新的 ${channel === "beta" ? "测试版或正式版" : "正式版"} Release）`,
      };
    }

    const latestTag = data.tag_name.replace(/^[vV]/, "");
    const isPrerelease = Boolean(data.prerelease) || latestTag.includes("-");
    const cmp = compareSemver(currentVersion, latestTag);
    const macAsset = (data.assets ?? []).find((a) =>
      /\.(dmg|zip|pkg|app\.tar\.gz)$/i.test(a.name ?? "")
    );

    if (cmp > 0) {
      return {
        status: "update-available",
        currentVersion,
        latestVersion: latestTag,
        channel,
        isPrerelease,
        releaseUrl: data.html_url ?? releasePageUrl,
        downloadUrl: macAsset?.browser_download_url ?? data.html_url ?? releasePageUrl,
        notes: data.body?.trim().slice(0, 360),
        publishedAt: data.published_at,
        repo,
        message: `发现新${isPrerelease ? "测试版" : "版本"} V${latestTag}（当前 V${currentVersion}）`,
      };
    }

    return {
      status: "up-to-date",
      currentVersion,
      latestVersion: latestTag,
      channel,
      isPrerelease,
      releaseUrl: data.html_url ?? releasePageUrl,
      publishedAt: data.published_at,
      repo,
      message: channel === "beta" ? "已经是最新测试版" : "已经是最新版本",
    };
  } catch (err) {
    return {
      status: "error",
      currentVersion,
      channel,
      releaseUrl: releasePageUrl,
      repo,
      message:
        err instanceof Error
          ? `检查更新请求失败：${err.message}`
          : "检查更新失败，请检查网络连接或代理设置",
    };
  }
}
