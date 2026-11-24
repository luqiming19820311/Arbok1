"use client";

import { Button } from "@ui-sdk/react/button";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider";
import {
  ChevronUpIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
} from "lucide-react";
import { formatTime, getPlatformMeta } from "./mock-data";
import { PlayQueuePopover } from "./play-queue-popover";
import type { Episode } from "./types";

interface MiniPlayerProps {
  episode: Episode;
  allEpisodes?: Episode[];
  playQueue?: string[];
  isPlaying: boolean;
  playbackRate: number;
  onTogglePlay: () => void;
  onSkip: (delta: number) => void;
  onSeek: (sec: number, autoPlay?: boolean) => void;
  onCycleSpeed: () => void;
  onExpand: () => void;
  onPlayEpisode?: (epId: string) => void;
  onMoveQueueItem?: (epId: string, dir: -1 | 1) => void;
  onRemoveQueueItem?: (epId: string) => void;
  onClearQueue?: () => void;
  onAddToQueue?: (epId: string) => void;
}

export function MiniPlayer({
  episode,
  allEpisodes = [],
  playQueue = [],
  isPlaying,
  playbackRate,
  onTogglePlay,
  onSkip,
  onSeek,
  onCycleSpeed,
  onExpand,
  onPlayEpisode,
  onMoveQueueItem,
  onRemoveQueueItem,
  onClearQueue,
  onAddToQueue,
}: MiniPlayerProps) {
  const meta = getPlatformMeta(episode.platform);

  return (
    <footer
      aria-label="底部迷你播放器"
      className="z-20 flex h-[68px] shrink-0 items-center justify-between gap-4 border-t border-[var(--ui-border)] bg-[var(--arbok-sidebar)] px-5 backdrop-blur-xl"
    >
      <div className="flex min-w-[200px] w-[30%] items-center gap-3">
        <div
          className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-bold text-white shadow-xs"
          style={{ background: episode.gradient }}
          aria-hidden="true"
        >
          {episode.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={episode.coverUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            episode.coverLabel.slice(0, 3)
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-[var(--ui-foreground)]">
            {episode.title}
          </div>
          <div className="truncate text-xs text-[var(--ui-muted-foreground)]">
            {meta.label} · {episode.channel}
          </div>
        </div>
      </div>

      <div className="flex max-w-[440px] flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-2.5">
          <Button
            aria-label="迷你播放器快退 15 秒"
            className="size-7 rounded-full border-transparent bg-transparent"
            onClick={() => onSkip(-15)}
          >
            <RotateCcwIcon className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            data-variant="solid"
            aria-label={isPlaying ? "暂停当前播放" : "继续当前播放"}
            className="size-8 rounded-full"
            onClick={onTogglePlay}
          >
            {isPlaying ? (
              <PauseIcon className="size-3.5" aria-hidden="true" />
            ) : (
              <PlayIcon className="size-3.5 translate-x-[1px]" aria-hidden="true" />
            )}
          </Button>
          <Button
            aria-label="迷你播放器快进 15 秒"
            className="size-7 rounded-full border-transparent bg-transparent"
            onClick={() => onSkip(15)}
          >
            <RotateCwIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex w-full items-center gap-2.5">
          <span className="tabular-nums text-[11px] text-[var(--ui-muted-foreground)]">
            {formatTime(episode.positionSec)}
          </span>
          <Slider
            className="arbok-compact-slider flex-1"
            min={0}
            max={episode.durationSec}
            step={1}
            value={Math.floor(episode.positionSec)}
            onValueChange={(next) => {
              const val = Array.isArray(next) ? next[0] : next;
              onSeek(val, isPlaying);
            }}
          >
            <SliderControl>
              <SliderTrack>
                <SliderIndicator />
                <SliderThumb aria-label="迷你播放器进度" />
              </SliderTrack>
            </SliderControl>
          </Slider>
          <span className="tabular-nums text-[11px] text-[var(--ui-muted-foreground)]">
            {formatTime(episode.durationSec)}
          </span>
        </div>
      </div>

      <div className="flex w-[26%] items-center justify-end gap-2">
        {onPlayEpisode &&
          onMoveQueueItem &&
          onRemoveQueueItem &&
          onClearQueue &&
          onAddToQueue && (
            <PlayQueuePopover
              queueIds={playQueue}
              episodes={allEpisodes}
              currentEpisodeId={episode.id}
              onPlayEpisode={onPlayEpisode}
              onMoveItem={onMoveQueueItem}
              onRemoveItem={onRemoveQueueItem}
              onClearQueue={onClearQueue}
              onAddEpisode={onAddToQueue}
              side="top"
            />
          )}
        <Button
          className="tabular-nums px-2.5"
          aria-label={`切换倍速，当前 ${playbackRate}x`}
          onClick={onCycleSpeed}
        >
          {playbackRate}x
        </Button>
        <Button onClick={onExpand}>
          <span>展开沉浸页</span>
          <ChevronUpIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </footer>
  );
}
