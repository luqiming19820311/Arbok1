"use client";

import { Button } from "@ui-sdk/react/button";
import { BookmarkIcon, PlayIcon } from "lucide-react";
import {
  formatRemainingMinutes,
  formatTime,
  getPlatformMeta,
} from "./mock-data";
import type { Episode } from "./types";

interface FavoritesViewProps {
  episodes: Episode[];
  currentEpisodeId: string;
  isPlaying: boolean;
  onPlayEpisode: (epId: string) => void;
  onPlayAll: (epIds: string[]) => void;
  onUnstar: (epId: string) => void;
}

function ProgressRing({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="shrink-0 -rotate-90"
    >
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.75"
      />
      {clamped > 0 && (
        <circle
          cx="7"
          cy="7"
          r={r}
          fill="none"
          stroke="var(--arbok-settings-icon-active)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      )}
    </svg>
  );
}

export function FavoritesView({
  episodes,
  currentEpisodeId,
  isPlaying,
  onPlayEpisode,
  onPlayAll,
  onUnstar,
}: FavoritesViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-7 py-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-3 py-1 text-xs font-semibold text-[var(--ui-foreground)]">
            <BookmarkIcon
              className="size-3.5 fill-current text-[var(--arbok-settings-icon-active)]"
              aria-hidden="true"
            />
            <span>收藏</span>
            <span className="tabular-nums text-[var(--ui-muted-foreground)]">
              {episodes.length}
            </span>
          </span>
        </div>

        {episodes.length > 0 && (
          <Button
            className="arbok-hero-play h-9 gap-1.5 rounded-full px-4 text-xs font-semibold"
            onClick={() => onPlayAll(episodes.map((e) => e.id))}
          >
            <PlayIcon className="size-3.5 fill-current" aria-hidden="true" />
            <span>全部播放（{episodes.length} 集）</span>
          </Button>
        )}
      </div>

      {episodes.length === 0 ? (
        <div className="mx-auto my-12 max-w-sm rounded-2xl border border-dashed border-[var(--ui-input)] bg-[var(--arbok-surface)] p-7 text-center">
          <BookmarkIcon
            className="mx-auto size-7 text-[var(--ui-muted-foreground)] opacity-60"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-sm font-semibold text-[var(--ui-foreground)]">
            还没有收藏的单集
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
            在播放页点击音量调节与离线下载之间的收藏图标，即可把喜欢的视频或播客收藏到这里。
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--ui-border)]/70">
          {episodes.map((ep) => {
            const meta = getPlatformMeta(ep.platform);
            const progressPct =
              ep.durationSec > 0
                ? Math.min(100, Math.round((ep.positionSec / ep.durationSec) * 100))
                : 0;
            const isCurrent = ep.id === currentEpisodeId;

            return (
              <div
                key={ep.id}
                className="group flex items-center gap-4 rounded-xl px-2 py-3.5 transition-colors hover:bg-[var(--ui-muted)]/55"
              >
                <Button
                  className="arbok-card-button flex min-w-0 flex-1 items-start gap-4 border-0 bg-transparent p-0 hover:bg-transparent"
                  onClick={() => onPlayEpisode(ep.id)}
                >
                  <div
                    className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-xl text-white shadow-xs sm:w-44"
                    style={{ background: ep.gradient }}
                    aria-hidden="true"
                  >
                    {ep.coverUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={ep.coverUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center px-2 text-center">
                        <span className="text-sm font-bold tracking-tight">
                          {ep.coverLabel}
                        </span>
                      </div>
                    )}
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="flex size-8 items-center justify-center rounded-full bg-black/70 text-white shadow-md backdrop-blur-md">
                        <PlayIcon className="size-3.5 translate-x-[1px] fill-white" />
                      </span>
                    </span>
                    <span className="tabular-nums absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {formatTime(ep.durationSec)}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ui-muted-foreground)]">
                      <ProgressRing pct={progressPct} />
                      <span
                        className={
                          progressPct > 0
                            ? "font-medium text-[var(--arbok-settings-icon-active)]"
                            : ""
                        }
                      >
                        {progressPct > 0
                          ? `看到 ${progressPct}% · ${formatRemainingMinutes(ep.durationSec, ep.positionSec)}`
                          : `未开始 · ${formatTime(ep.durationSec)}`}
                      </span>
                      <span>·</span>
                      <span className="truncate font-medium text-[var(--ui-foreground)]/80">
                        {ep.channel}
                      </span>
                      <span>·</span>
                      <span className="shrink-0">{ep.date}</span>
                    </div>

                    <div
                      className="line-clamp-2 text-[15px] font-semibold leading-snug"
                      style={{
                        color: isCurrent
                          ? "var(--arbok-settings-icon-active)"
                          : "var(--ui-foreground)",
                      }}
                    >
                      {ep.title}
                      {isCurrent && isPlaying ? " · 播放中" : ""}
                    </div>

                    {ep.subtitle && (
                      <div className="line-clamp-1 text-xs text-[var(--ui-muted-foreground)]">
                        {ep.subtitle}
                      </div>
                    )}

                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {(ep.isBilingual || ep.hasOfficialSub) && (
                        <span className="rounded bg-[var(--ui-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ui-muted-foreground)]">
                          {ep.isBilingual ? "双语字幕" : "字幕"}
                        </span>
                      )}
                      <span className="rounded bg-[var(--ui-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--ui-muted-foreground)]">
                        {ep.mediaType === "video" ? "视频" : "音频"}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 text-[11px] font-medium"
                        style={{ color: meta.fg, background: meta.bg }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                </Button>

                <Button
                  aria-label={`取消收藏 ${ep.title}`}
                  title="取消收藏"
                  className="shrink-0 gap-1.5 border-[var(--ui-border)] bg-transparent px-2.5 text-xs text-[var(--ui-muted-foreground)] hover:border-[var(--ui-destructive)]/40 hover:bg-[var(--ui-destructive)]/10 hover:text-[var(--ui-destructive)]"
                  onClick={() => onUnstar(ep.id)}
                >
                  <BookmarkIcon
                    className="size-3.5 fill-current text-[var(--arbok-settings-icon-active)]"
                    aria-hidden="true"
                  />
                  <span>取消收藏</span>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
