"use client";

import { Button } from "@ui-sdk/react/button";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress";
import {
  DownloadIcon,
  HardDriveIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { formatTime, getPlatformMeta } from "./mock-data";
import type { Episode, OfflineDownloadJob, StorageUsage } from "./types";

interface OfflineQueueViewProps {
  downloadJobs: OfflineDownloadJob[];
  offlineEpisodes: Episode[];
  storageUsage: StorageUsage | null;
  onOpenEpisode: (epId: string) => void;
  onPauseDownload: (epId: string) => void;
  onResumeDownload: (epId: string) => void;
  onCancelDownload: (epId: string) => void;
  onRemoveOffline: (epId: string) => void;
  onOpenStorageSettings: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflineQueueView({
  downloadJobs,
  offlineEpisodes,
  storageUsage,
  onOpenEpisode,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
  onRemoveOffline,
  onOpenStorageSettings,
}: OfflineQueueViewProps) {
  const activeOrPendingJobs = downloadJobs.filter(
    (j) =>
      j.status === "queued" ||
      j.status === "downloading" ||
      j.status === "paused" ||
      j.status === "failed"
  );

  return (
    <div className="flex w-full flex-col gap-6 px-7 py-6 pb-12">
      <section
        aria-label="离线存储概览"
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--arbok-accent-soft)] text-[var(--arbok-accent-text)]">
            <HardDriveIcon className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--ui-foreground)]">
              离线媒体与本地文件（断网可用）
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
              已离线 {offlineEpisodes.length} 期
              {storageUsage
                ? ` · 离线下载 ${storageUsage.offlineMb} MB · 本地导入 ${storageUsage.localMediaMb} MB · 临时缓存 ${storageUsage.tempCacheMb} MB / ${(storageUsage.limitMb / 1024).toFixed(1)} GB`
                : " · 手动离线文件不受自动 LRU 缓存清理影响"}
            </p>
          </div>
        </div>
        <Button onClick={onOpenStorageSettings}>管理缓存上限</Button>
      </section>

      {activeOrPendingJobs.length > 0 && (
        <section aria-label="下载任务队列" className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--ui-foreground)]">
            下载队列（{activeOrPendingJobs.length}）
          </h2>
          <div className="flex flex-col gap-2.5">
            {activeOrPendingJobs.map((job) => {
              const meta = getPlatformMeta(job.platform);
              const statusText =
                job.status === "downloading"
                  ? "下载中"
                  : job.status === "queued"
                    ? "排队中"
                    : job.status === "paused"
                      ? "已暂停"
                      : "下载失败";
              return (
                <div
                  key={job.episodeId}
                  className="flex flex-col gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ color: meta.fg, background: meta.bg }}
                      >
                        {meta.label}
                      </span>
                      <span className="truncate text-xs font-semibold text-[var(--ui-foreground)]">
                        {job.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--ui-muted-foreground)]">
                        {statusText}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {job.status === "downloading" || job.status === "queued" ? (
                        <Button
                          aria-label={`暂停下载 ${job.title}`}
                          className="h-7 px-2 text-xs"
                          onClick={() => onPauseDownload(job.episodeId)}
                        >
                          <PauseIcon className="size-3" aria-hidden="true" />
                          <span>暂停</span>
                        </Button>
                      ) : (
                        <Button
                          aria-label={`继续下载 ${job.title}`}
                          data-variant="solid"
                          className="h-7 px-2 text-xs"
                          onClick={() => onResumeDownload(job.episodeId)}
                        >
                          <RotateCwIcon className="size-3" aria-hidden="true" />
                          <span>{job.status === "failed" ? "重试" : "继续"}</span>
                        </Button>
                      )}
                      <Button
                        aria-label={`取消下载 ${job.title}`}
                        className="h-7 px-2 text-xs"
                        onClick={() => onCancelDownload(job.episodeId)}
                      >
                        <XIcon className="size-3" aria-hidden="true" />
                        <span>取消</span>
                      </Button>
                    </div>
                  </div>

                  <Progress value={job.progress} className="arbok-compact-progress">
                    <div className="flex items-center justify-between text-[11px] text-[var(--ui-muted-foreground)]">
                      <ProgressLabel>
                        {job.error
                          ? job.error
                          : `${formatBytes(job.downloadedBytes)}${job.totalBytes > 0 ? ` / ${formatBytes(job.totalBytes)}` : ""}`}
                      </ProgressLabel>
                      <ProgressValue className="tabular-nums" />
                    </div>
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-label="已下载的离线单集" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--ui-foreground)]">
          已离线可用（{offlineEpisodes.length}）
        </h2>

        {offlineEpisodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--ui-input)] bg-[var(--arbok-surface)] p-8 text-center">
            <DownloadIcon
              className="mx-auto size-6 text-[var(--ui-muted-foreground)]"
              aria-hidden="true"
            />
            <h3 className="mt-2 text-sm font-semibold text-[var(--ui-foreground)]">
              暂无已离线单集
            </h3>
            <p className="mt-1 text-xs text-[var(--ui-muted-foreground)]">
              在沉浸播放页点击「离线下载」，或直接拖入本地 .mp3 / .m4a / .wav / .mp4 / .mov 文件即可断网播放。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {offlineEpisodes.map((ep) => {
              const meta = getPlatformMeta(ep.platform);
              return (
                <div
                  key={ep.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[10px] font-bold text-white"
                      style={{ background: ep.gradient }}
                      aria-hidden="true"
                    >
                      {ep.coverUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={ep.coverUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        ep.coverLabel.slice(0, 4)
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--ui-muted-foreground)]">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ color: meta.fg, background: meta.bg }}
                        >
                          {meta.label}
                        </span>
                        <span className="truncate">{ep.channel}</span>
                        <span>·</span>
                        <span className="tabular-nums">
                          {formatTime(ep.durationSec)}
                        </span>
                        {ep.hasOfficialSub && <span>· 含字幕</span>}
                        {ep.hasAiGuide && <span>· 含 AI 导读</span>}
                      </div>
                      <div className="mt-0.5 truncate text-[13.5px] font-semibold text-[var(--ui-foreground)]">
                        {ep.title}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      data-variant="solid"
                      aria-label={`播放离线单集 ${ep.title}`}
                      className="h-8 px-3 text-xs"
                      onClick={() => onOpenEpisode(ep.id)}
                    >
                      <PlayIcon className="size-3.5" aria-hidden="true" />
                      <span>立即播放</span>
                    </Button>
                    {ep.platform !== "local" && (
                      <Button
                        aria-label={`移除离线缓存 ${ep.title}`}
                        className="h-8 px-2.5 text-xs text-[var(--ui-muted-foreground)]"
                        onClick={() => onRemoveOffline(ep.id)}
                      >
                        <Trash2Icon className="size-3.5" aria-hidden="true" />
                        <span>移除离线</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
