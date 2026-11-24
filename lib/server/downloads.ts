import fs from "node:fs";
import path from "node:path";
import type { Episode, OfflineDownloadJob } from "@/components/arbok/types";
import { resolveBilibiliStream } from "./adapters/bilibili";
import { resolveYouTubeStreamAndSubtitles } from "./adapters/youtube";
import { getEpisodeById, updateEpisodeFields } from "./db";
import { getSecret } from "./keychain";
import { proxyFetch } from "./proxy";
import { getOfflineDir } from "./storage";
import { isDemoPlaceholderEpisode } from "./stream";

const MAX_CONCURRENT_DOWNLOADS = 2;
const DOWNLOAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface ActiveTask {
  controller: AbortController;
  reason: "none" | "pause" | "cancel";
}

const jobs = new Map<string, OfflineDownloadJob>();
const queueOrder: string[] = [];
const activeTasks = new Map<string, ActiveTask>();

function sanitizeFileId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

function guessExtension(
  url: string,
  contentType: string | null,
  mediaType: "audio" | "video"
): string {
  const lowerCt = (contentType ?? "").toLowerCase();
  if (lowerCt.includes("video/mp4")) return ".mp4";
  if (lowerCt.includes("video/webm")) return ".webm";
  if (lowerCt.includes("audio/mp4") || lowerCt.includes("audio/x-m4a")) return ".m4a";
  if (lowerCt.includes("audio/wav")) return ".wav";
  if (lowerCt.includes("audio/mpeg")) return ".mp3";

  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (const ext of [".mp4", ".m4a", ".mp3", ".wav", ".webm", ".mov"]) {
      if (pathname.endsWith(ext)) return ext;
    }
  } catch {
    // Fall back to mediaType default.
  }
  return mediaType === "video" ? ".mp4" : ".mp3";
}

function buildHeaders(
  platform: Episode["platform"],
  resumeOffset: number
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": DOWNLOAD_UA,
  };
  if (resumeOffset > 0) {
    headers.Range = `bytes=${resumeOffset}-`;
  }
  if (platform === "bilibili") {
    headers.Referer = "https://www.bilibili.com/";
    headers.Origin = "https://www.bilibili.com";
    const cookie = getSecret("auth:bilibili");
    if (cookie) {
      headers.Cookie = cookie.includes("SESSDATA=")
        ? cookie
        : `SESSDATA=${cookie}`;
    }
  } else if (platform === "xiaoyuzhou") {
    headers.Referer = "https://www.xiaoyuzhoufm.com/";
  }
  return headers;
}

async function resolveDownloadUrl(
  ep: Episode,
  doFetch: typeof fetch
): Promise<string> {
  const expired =
    typeof ep.streamExpiresAt === "number" && ep.streamExpiresAt < Date.now();
  let url =
    ep.mediaType === "video"
      ? ep.videoUrl ?? ep.audioUrl
      : ep.audioUrl ?? ep.videoUrl;

  if (!url || expired) {
    if (ep.platform === "youtube") {
      const resolved = await resolveYouTubeStreamAndSubtitles(ep.pageUrl, {
        fetchSubtitles: false,
        fetchImpl: doFetch,
      });
      updateEpisodeFields(ep.id, {
        audioUrl: resolved.audioUrl,
        videoUrl: resolved.videoUrl,
        streamExpiresAt: resolved.streamExpiresAt,
      });
      url =
        ep.mediaType === "video"
          ? resolved.videoUrl ?? resolved.audioUrl
          : resolved.audioUrl ?? resolved.videoUrl;
    } else if (ep.platform === "bilibili") {
      const resolved = await resolveBilibiliStream(ep.pageUrl, {
        fetchSubtitles: false,
        fetchImpl: doFetch,
      });
      updateEpisodeFields(ep.id, {
        audioUrl: resolved.audioUrl,
        videoUrl: resolved.videoUrl,
        streamExpiresAt: resolved.streamExpiresAt,
      });
      url =
        ep.mediaType === "video"
          ? resolved.videoUrl ?? resolved.audioUrl
          : resolved.audioUrl ?? resolved.videoUrl;
    }
  }

  if (!url) {
    throw new Error("未找到可下载的有效媒体流地址，请先检查代理或登录状态");
  }
  return url;
}

function getPartPath(episodeId: string): string {
  return path.join(getOfflineDir(), `${sanitizeFileId(episodeId)}.part`);
}

function isInsideDir(targetPath: string, parentDir: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedParent = path.resolve(parentDir);
  return (
    resolvedTarget === resolvedParent ||
    resolvedTarget.startsWith(`${resolvedParent}${path.sep}`)
  );
}

async function executeDownload(
  episodeId: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  const ep = getEpisodeById(episodeId);
  const job = jobs.get(episodeId);
  if (!ep || !job) return;

  const controller = new AbortController();
  const task: ActiveTask = { controller, reason: "none" };
  activeTasks.set(episodeId, task);

  job.status = "downloading";
  job.error = undefined;
  job.updatedAt = Date.now();
  updateEpisodeFields(episodeId, { downloadStatus: "downloading" });

  const doFetch = fetchImpl ?? proxyFetch;

  try {
    if (ep.localFilePath && fs.existsSync(ep.localFilePath)) {
      const stat = fs.statSync(ep.localFilePath);
      job.status = "completed";
      job.progress = 100;
      job.downloadedBytes = stat.size;
      job.totalBytes = stat.size;
      job.filePath = ep.localFilePath;
      job.updatedAt = Date.now();
      updateEpisodeFields(episodeId, {
        isOffline: true,
        localFilePath: ep.localFilePath,
      });
      return;
    }

    if (isDemoPlaceholderEpisode(ep)) {
      throw new Error(
        "内置演示占位数据不包含真实媒体流，请导入真实播客、YouTube、B站或本地文件进行离线下载"
      );
    }

    const offlineDir = getOfflineDir();
    fs.mkdirSync(offlineDir, { recursive: true });
    const partPath = getPartPath(episodeId);
    let existingBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;

    const targetUrl = await resolveDownloadUrl(ep, doFetch);
    let response = await doFetch(targetUrl, {
      headers: buildHeaders(ep.platform, existingBytes),
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status === 416 && existingBytes > 0) {
      fs.unlinkSync(partPath);
      existingBytes = 0;
      response = await doFetch(targetUrl, {
        headers: buildHeaders(ep.platform, 0),
        redirect: "follow",
        signal: controller.signal,
      });
    }

    if (!response.ok && response.status !== 206) {
      throw new Error(`上游媒体服务器返回 ${response.status}`);
    }

    const resumed = response.status === 206 && existingBytes > 0;
    if (!resumed && existingBytes > 0 && fs.existsSync(partPath)) {
      fs.unlinkSync(partPath);
      existingBytes = 0;
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    const totalBytes =
      contentLength > 0 ? existingBytes + contentLength : job.totalBytes;
    job.totalBytes = totalBytes;
    job.downloadedBytes = existingBytes;

    const ext = guessExtension(
      targetUrl,
      response.headers.get("content-type"),
      ep.mediaType
    );
    const finalPath = path.join(
      /*turbopackIgnore: true*/ offlineDir,
      `${sanitizeFileId(episodeId)}${ext}`
    );

    const outStream = fs.createWriteStream(partPath, {
      flags: resumed ? "a" : "w",
    });

    try {
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            await new Promise<void>((resolve, reject) => {
              outStream.write(Buffer.from(value), (err) =>
                err ? reject(err) : resolve()
              );
            });
            job.downloadedBytes += value.byteLength;
            if (job.totalBytes > 0) {
              job.progress = Math.min(
                99,
                Math.round((job.downloadedBytes / job.totalBytes) * 100)
              );
            }
            job.updatedAt = Date.now();
          }
        }
      } else {
        const buf = Buffer.from(await response.arrayBuffer());
        await new Promise<void>((resolve, reject) => {
          outStream.write(buf, (err) => (err ? reject(err) : resolve()));
        });
        job.downloadedBytes += buf.byteLength;
      }
    } finally {
      await new Promise<void>((resolve) => outStream.end(() => resolve()));
    }

    if (controller.signal.aborted) {
      throw new Error("ABORTED");
    }

    fs.renameSync(partPath, finalPath);
    const finalSize = fs.statSync(/*turbopackIgnore: true*/ finalPath).size;
    job.status = "completed";
    job.progress = 100;
    job.downloadedBytes = finalSize;
    job.totalBytes = finalSize;
    job.filePath = finalPath;
    job.updatedAt = Date.now();
    updateEpisodeFields(episodeId, {
      isOffline: true,
      localFilePath: finalPath,
    });
  } catch (err) {
    if (task.reason === "pause") {
      job.status = "paused";
      job.error = undefined;
      job.updatedAt = Date.now();
      updateEpisodeFields(episodeId, { downloadStatus: "paused" });
    } else if (task.reason === "cancel") {
      const partPath = getPartPath(episodeId);
      if (fs.existsSync(partPath)) {
        try {
          fs.unlinkSync(partPath);
        } catch {
          // Ignore unlink failure.
        }
      }
      job.status = "cancelled";
      job.progress = 0;
      job.downloadedBytes = 0;
      job.error = undefined;
      job.updatedAt = Date.now();
      updateEpisodeFields(episodeId, { downloadStatus: "none" });
    } else {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "离线下载失败";
      job.updatedAt = Date.now();
      updateEpisodeFields(episodeId, { downloadStatus: "failed" });
    }
  } finally {
    activeTasks.delete(episodeId);
    pumpQueue(fetchImpl);
  }
}

function pumpQueue(fetchImpl?: typeof fetch): void {
  while (
    activeTasks.size < MAX_CONCURRENT_DOWNLOADS &&
    queueOrder.length > 0
  ) {
    const nextId = queueOrder.shift()!;
    const job = jobs.get(nextId);
    if (!job || job.status !== "queued") continue;
    void executeDownload(nextId, fetchImpl);
  }
}

export function listOfflineDownloadJobs(): OfflineDownloadJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getOfflineDownloadJob(
  episodeId: string
): OfflineDownloadJob | null {
  return jobs.get(episodeId) ?? null;
}

export function enqueueOfflineDownload(
  episodeId: string,
  options?: { fetchImpl?: typeof fetch; immediate?: boolean }
): OfflineDownloadJob {
  const ep = getEpisodeById(episodeId);
  if (!ep) {
    throw new Error("未找到该单集");
  }

  const existing = jobs.get(episodeId);
  if (
    existing &&
    (existing.status === "downloading" || existing.status === "queued")
  ) {
    return existing;
  }

  const partPath = getPartPath(episodeId);
  const existingBytes = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;

  const job: OfflineDownloadJob = {
    episodeId,
    title: ep.title,
    platform: ep.platform,
    status: "queued",
    progress:
      existing && existing.totalBytes > 0 && existingBytes > 0
        ? Math.min(99, Math.round((existingBytes / existing.totalBytes) * 100))
        : 0,
    downloadedBytes: existingBytes,
    totalBytes: existing?.totalBytes ?? 0,
    updatedAt: Date.now(),
  };

  jobs.set(episodeId, job);
  if (!queueOrder.includes(episodeId)) {
    queueOrder.push(episodeId);
  }
  updateEpisodeFields(episodeId, { downloadStatus: "queued" });

  if (options?.immediate !== false) {
    pumpQueue(options?.fetchImpl);
  }
  return jobs.get(episodeId) ?? job;
}

export function pauseOfflineDownload(episodeId: string): OfflineDownloadJob | null {
  const job = jobs.get(episodeId);
  if (!job) return null;

  const idx = queueOrder.indexOf(episodeId);
  if (idx !== -1) {
    queueOrder.splice(idx, 1);
    job.status = "paused";
    job.updatedAt = Date.now();
    updateEpisodeFields(episodeId, { downloadStatus: "paused" });
    return job;
  }

  const active = activeTasks.get(episodeId);
  if (active) {
    active.reason = "pause";
    active.controller.abort();
    job.status = "paused";
    job.updatedAt = Date.now();
  }
  return job;
}

export function cancelOfflineDownload(episodeId: string): OfflineDownloadJob | null {
  const job = jobs.get(episodeId);
  if (!job) return null;

  const idx = queueOrder.indexOf(episodeId);
  if (idx !== -1) {
    queueOrder.splice(idx, 1);
  }

  const active = activeTasks.get(episodeId);
  if (active) {
    active.reason = "cancel";
    active.controller.abort();
  }

  const partPath = getPartPath(episodeId);
  if (fs.existsSync(partPath)) {
    try {
      fs.unlinkSync(partPath);
    } catch {
      // Ignore cleanup failure.
    }
  }
  job.status = "cancelled";
  job.progress = 0;
  job.downloadedBytes = 0;
  job.error = undefined;
  job.updatedAt = Date.now();
  updateEpisodeFields(episodeId, { downloadStatus: "none" });

  return job;
}

export function removeOfflineDownload(episodeId: string): void {
  cancelOfflineDownload(episodeId);
  jobs.delete(episodeId);

  const ep = getEpisodeById(episodeId);
  if (!ep) return;

  if (ep.platform === "local") {
    return;
  }

  const offlineDir = getOfflineDir();
  if (
    ep.localFilePath &&
    isInsideDir(ep.localFilePath, offlineDir) &&
    fs.existsSync(ep.localFilePath)
  ) {
    try {
      fs.unlinkSync(ep.localFilePath);
    } catch {
      // Ignore concurrent removal.
    }
  }

  const partPath = getPartPath(episodeId);
  if (fs.existsSync(partPath)) {
    try {
      fs.unlinkSync(partPath);
    } catch {
      // Ignore concurrent removal.
    }
  }

  updateEpisodeFields(episodeId, {
    isOffline: false,
    localFilePath: null,
  });
}

export function resetDownloadQueueForTests(): void {
  for (const active of activeTasks.values()) {
    active.reason = "cancel";
    active.controller.abort();
  }
  activeTasks.clear();
  queueOrder.length = 0;
  jobs.clear();
}
