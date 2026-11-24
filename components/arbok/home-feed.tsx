"use client";

import { Button } from "@ui-sdk/react/button";
import {
  CheckIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
} from "lucide-react";
import { getUiCopy } from "@/lib/arbok/i18n";
import {
  formatRemainingMinutes,
  formatTime,
  getPlatformMeta,
} from "./mock-data";
import type {
  Episode,
  RecommendedShow,
  Subscription,
  UiLanguage,
} from "./types";

interface HomeFeedProps {
  isInboxHome: boolean;
  currentEpisode: Episode;
  isPlaying: boolean;
  episodes: Episode[];
  allEpisodes: Episode[];
  subscriptions: Subscription[];
  recommendedShows: RecommendedShow[];
  subscribingRecId?: string | null;
  showRecommendations?: boolean;
  keepOriginalShowNames?: boolean;
  uiLanguage?: UiLanguage;
  onOpenEpisode: (epId: string) => void;
  onContinueHero: () => void;
  onSelectSubscription: (subId: string) => void;
  onViewAllContinue: () => void;
  onViewAllLatest: () => void;
  onOpenAddDialog: () => void;
  onOpenMoreRecommendations: () => void;
  onToggleRecommendSubscribe: (recId: string) => void;
}

function EpisodeGridCard({
  ep,
  compactMeta,
  onSelect,
}: {
  ep: Episode;
  compactMeta?: boolean;
  onSelect: () => void;
}) {
  const meta = getPlatformMeta(ep.platform);
  const progressPct = Math.round((ep.positionSec / ep.durationSec) * 100);
  const subtitleBadge = ep.isBilingual
    ? "双语字幕"
    : ep.hasOfficialSub
      ? "有字幕"
      : "待 ASR";

  return (
    <Button
      className="arbok-grid-card group flex h-auto w-full flex-col items-stretch justify-start gap-2.5 whitespace-normal border-0 bg-transparent p-0 text-left font-normal hover:bg-transparent"
      onClick={onSelect}
    >
      <div
        className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl text-white shadow-xs transition-transform duration-200 group-hover:scale-[1.015]"
        style={{ background: ep.gradient }}
        aria-hidden="true"
      >
        {ep.coverUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={ep.coverUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: ep.coverUrl
              ? "linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.06) 45%, rgba(0,0,0,0.48) 100%)"
              : "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.16), transparent 45%), linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.34) 100%)",
          }}
        />

        <span className="absolute top-2.5 left-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
          {subtitleBadge}
        </span>

        <span className="absolute top-2.5 right-2.5 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold text-white/95 backdrop-blur-md">
          {meta.label}
        </span>

        {!ep.coverUrl && (
          <div className="relative flex h-full w-full flex-col items-center justify-center px-4 text-center">
            {ep.coverKicker && (
              <span className="text-[10px] font-semibold tracking-widest uppercase text-white/75">
                {ep.coverKicker}
              </span>
            )}
            <span className="mt-0.5 text-lg font-bold tracking-tight text-white drop-shadow-xs">
              {ep.coverLabel}
            </span>
          </div>
        )}

        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/65 text-white shadow-md backdrop-blur-md">
            <PlayIcon className="size-4 translate-x-[1px] fill-white" />
          </span>
        </span>

        <span className="tabular-nums absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {formatTime(ep.durationSec)}
        </span>

        {progressPct > 0 && (
          <div className="absolute right-0 bottom-0 left-0 h-1 bg-white/25">
            <div
              className="h-full bg-white"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-1 px-0.5">
        <div className="flex items-center gap-1.5 truncate text-[11.5px] text-[var(--ui-muted-foreground)]">
          {!compactMeta && (
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: meta.dot }}
              aria-hidden="true"
            />
          )}
          <span className="truncate font-medium">{ep.channel}</span>
          <span>·</span>
          {progressPct > 0 ? (
            <span className="shrink-0">
              看到 {progressPct}% · {formatRemainingMinutes(ep.durationSec, ep.positionSec)}
            </span>
          ) : (
            <span className="shrink-0">{ep.date}</span>
          )}
        </div>

        <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-[var(--ui-foreground)] group-hover:text-[var(--arbok-accent-text)]">
          {ep.title}
        </span>
      </div>
    </Button>
  );
}

export function HomeFeed({
  isInboxHome,
  currentEpisode,
  isPlaying,
  episodes,
  allEpisodes,
  subscriptions,
  recommendedShows,
  subscribingRecId = null,
  showRecommendations = true,
  keepOriginalShowNames = false,
  uiLanguage = "system",
  onOpenEpisode,
  onContinueHero,
  onSelectSubscription,
  onViewAllContinue,
  onViewAllLatest,
  onOpenAddDialog,
  onOpenMoreRecommendations,
  onToggleRecommendSubscribe,
}: HomeFeedProps) {
  const copy = getUiCopy(uiLanguage);
  const formatRecommendedTitle = (show: RecommendedShow) => {
    if (!keepOriginalShowNames) return show.name;
    if (show.id === "rec-nopriors") return "No Priors";
    if (show.id === "rec-cogrev") return "The Cognitive Revolution";
    return show.name;
  };
  const heroMeta = getPlatformMeta(currentEpisode.platform);

  const upNextEpisodes = allEpisodes
    .filter((ep) => ep.id !== currentEpisode.id)
    .sort((a, b) => {
      const aHasProgress = a.positionSec > 0 ? 1 : 0;
      const bHasProgress = b.positionSec > 0 ? 1 : 0;
      return bHasProgress - aHasProgress;
    })
    .slice(0, 4);

  if (!isInboxHome) {
    if (episodes.length === 0) {
      return (
        <div className="mx-auto my-14 max-w-sm rounded-2xl border border-dashed border-[var(--ui-input)] bg-[var(--arbok-surface)] p-7 text-center">
          <h2 className="text-sm font-semibold text-[var(--ui-foreground)]">
            没有匹配的内容
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
            试试切换顶部平台筛选，或点击左上角「添加链接 / 订阅」导入新内容。
          </p>
        </div>
      );
    }

    return (
      <div className="w-full px-7 py-6 pb-12">
        <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {episodes.map((ep) => (
            <EpisodeGridCard
              key={ep.id}
              ep={ep}
              onSelect={() => onOpenEpisode(ep.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-8 px-7 py-6 pb-12">
      <section
        aria-label="当前在收看"
        className="flex flex-col gap-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4 shadow-xs sm:flex-row sm:items-center sm:gap-5 sm:p-5"
      >
        <div
          className="relative flex size-24 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl p-2 text-center text-white shadow-sm sm:size-[104px]"
          style={{ background: currentEpisode.gradient }}
          aria-hidden="true"
        >
          {currentEpisode.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentEpisode.coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              {currentEpisode.coverKicker && (
                <span className="text-[10px] font-semibold tracking-wider text-white/80">
                  {currentEpisode.coverKicker}
                </span>
              )}
              <span className="mt-0.5 text-base font-bold tracking-tight">
                {currentEpisode.coverLabel}
              </span>
              <span className="mt-1 rounded bg-black/35 px-1.5 py-0.5 text-[9.5px] font-medium">
                {heroMeta.label}
              </span>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-[var(--ui-muted-foreground)]">
            <span>继续收听</span>
            <span>·</span>
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ color: heroMeta.fg, background: heroMeta.bg }}
            >
              {heroMeta.label}
            </span>
            <span>{currentEpisode.channel}</span>
          </div>

          <h2 className="line-clamp-1 text-[17px] font-semibold tracking-tight text-[var(--ui-foreground)]">
            {currentEpisode.title}
          </h2>

          {currentEpisode.subtitle && (
            <p className="line-clamp-1 text-xs text-[var(--ui-muted-foreground)]">
              {currentEpisode.subtitle}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3.5">
            <Button
              className="arbok-hero-play h-9 gap-1.5 rounded-lg border-transparent bg-[var(--arbok-hero-btn-bg)] px-4 text-xs font-semibold text-[var(--arbok-hero-btn-fg)] hover:opacity-90"
              onClick={onContinueHero}
            >
              <PlayIcon className="size-3.5 fill-current" aria-hidden="true" />
              <span>{isPlaying ? "回到正在播放" : "继续播放"}</span>
            </Button>
            <span className="text-xs text-[var(--ui-muted-foreground)]">
              {formatRemainingMinutes(
                currentEpisode.durationSec,
                currentEpisode.positionSec
              )}
            </span>
          </div>
        </div>
      </section>

      <section aria-label="接下来听" className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ui-foreground)]">
            {copy.homeContinue}
          </h2>
          <Button
            className="h-7 border-transparent bg-transparent px-2 text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
            onClick={onViewAllContinue}
          >
            <span>全部待听</span>
            <ChevronRightIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {upNextEpisodes.map((ep) => (
            <EpisodeGridCard
              key={`upnext-${ep.id}`}
              ep={ep}
              compactMeta
              onSelect={() => onOpenEpisode(ep.id)}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
        <section
          aria-label="最新单集"
          className="flex min-w-0 flex-1 flex-col gap-3.5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ui-foreground)]">
              {copy.homeLatest}
            </h2>
            <Button
              className="h-7 border-transparent bg-transparent px-2 text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
              onClick={onViewAllLatest}
            >
              查看全部单集
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {episodes.map((ep) => (
              <EpisodeGridCard
                key={`latest-${ep.id}`}
                ep={ep}
                onSelect={() => onOpenEpisode(ep.id)}
              />
            ))}
          </div>
        </section>

        <aside
          aria-label="推荐与订阅栏"
          className="flex w-full shrink-0 flex-col gap-7 xl:w-[276px]"
        >
          {showRecommendations && (
            <section aria-label="为你推荐" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ui-foreground)]">
                  {copy.homeRecommended}
                </h2>
                <Button
                  className="h-7 border-transparent bg-transparent px-2 text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                  onClick={onOpenMoreRecommendations}
                >
                  {copy.homeMoreRecs}
                </Button>
              </div>

              <div className="flex flex-col gap-2.5">
                {recommendedShows.map((show) => {
                  const isLoading = subscribingRecId === show.id;
                  const displayName = formatRecommendedTitle(show);
                  return (
                    <div
                      key={show.id}
                      className="flex items-center justify-between gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-[var(--ui-muted)]"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white shadow-xs"
                          style={{ background: show.gradient }}
                          aria-hidden="true"
                        >
                          {show.shortLabel}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-[var(--ui-foreground)]">
                            {displayName}
                          </div>
                          <div className="truncate text-[11px] text-[var(--ui-muted-foreground)]">
                            {isLoading ? "正在拉取真实频道与单集…" : show.reason}
                          </div>
                        </div>
                      </div>

                      <Button
                        disabled={isLoading}
                        aria-label={
                          show.subscribed
                            ? `退订推荐 ${show.name}`
                            : `订阅推荐 ${show.name}`
                        }
                        className="arbok-circle-btn size-7 shrink-0 rounded-full p-0"
                        data-variant={show.subscribed ? "solid" : undefined}
                        onClick={() => onToggleRecommendSubscribe(show.id)}
                      >
                        {isLoading ? (
                          <Loader2Icon
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : show.subscribed ? (
                          <CheckIcon className="size-3.5" aria-hidden="true" />
                        ) : (
                          <PlusIcon className="size-3.5" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-label="订阅节目" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--ui-foreground)]">
                {copy.homeSubscriptions}
              </h2>
              <Button
                className="h-7 border-transparent bg-transparent px-2 text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                onClick={onOpenAddDialog}
              >
                <PlusIcon className="size-3" aria-hidden="true" />
                <span>添加节目</span>
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {subscriptions.map((sub) => (
                <Button
                  key={`grid-sub-${sub.id}`}
                  className="arbok-grid-card group flex h-auto w-full flex-col items-center justify-start gap-1.5 whitespace-normal border-0 bg-transparent p-0 text-center font-normal hover:bg-transparent"
                  onClick={() => onSelectSubscription(sub.id)}
                >
                  <div
                    className="relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold text-white shadow-xs transition-transform duration-150 group-hover:scale-[1.03]"
                    style={{ background: sub.gradient }}
                    aria-hidden="true"
                  >
                    {sub.coverUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={sub.coverUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      sub.shortLabel
                    )}
                  </div>
                  <span className="w-full truncate text-[11px] font-medium text-[var(--ui-muted-foreground)] group-hover:text-[var(--ui-foreground)]">
                    {sub.name}
                  </span>
                </Button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
