"use client";

import { Button } from "@ui-sdk/react/button";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListMusicIcon,
  PlayIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { formatTime, getPlatformMeta } from "./mock-data";
import type { Episode } from "./types";

interface PlayQueuePopoverProps {
  queueIds: string[];
  episodes: Episode[];
  currentEpisodeId: string;
  onPlayEpisode: (epId: string) => void;
  onMoveItem: (epId: string, dir: -1 | 1) => void;
  onRemoveItem: (epId: string) => void;
  onClearQueue: () => void;
  onAddEpisode: (epId: string) => void;
  side?: "top" | "bottom";
}

export function PlayQueuePopover({
  queueIds,
  episodes,
  currentEpisodeId,
  onPlayEpisode,
  onMoveItem,
  onRemoveItem,
  onClearQueue,
  onAddEpisode,
  side = "top",
}: PlayQueuePopoverProps) {
  const queuedEpisodes = queueIds
    .map((id) => episodes.find((e) => e.id === id))
    .filter((e): e is Episode => Boolean(e));

  const suggestedEpisodes = episodes
    .filter((e) => e.id !== currentEpisodeId && !queueIds.includes(e.id))
    .slice(0, 3);

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`待播队列（${queuedEpisodes.length} 期）`}
        className="gap-1.5 px-2.5"
      >
        <ListMusicIcon className="size-3.5" aria-hidden="true" />
        <span className="text-xs">队列</span>
        {queuedEpisodes.length > 0 && (
          <span className="tabular-nums rounded-full bg-[var(--arbok-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--arbok-accent-text)]">
            {queuedEpisodes.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[92vw] rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-canvas)] p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-4 py-3">
          <div>
            <PopoverTitle className="text-[13.5px] font-semibold text-[var(--ui-foreground)]">
              接下来播放（Play Next）
            </PopoverTitle>
            <PopoverDescription className="text-[11.5px] text-[var(--ui-muted-foreground)]">
              当前单集播完后将按顺序自动连播
            </PopoverDescription>
          </div>
          <div className="flex items-center gap-1">
            {queuedEpisodes.length > 0 && (
              <Button
                aria-label="清空待播队列"
                className="h-7 px-2 text-xs text-[var(--ui-muted-foreground)]"
                onClick={onClearQueue}
              >
                <Trash2Icon className="size-3" aria-hidden="true" />
                <span>清空</span>
              </Button>
            )}
            <PopoverClose aria-label="关闭待播队列">
              <XIcon className="size-3.5" aria-hidden="true" />
            </PopoverClose>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto p-3">
          {queuedEpisodes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--ui-border)] px-3 py-5 text-center text-xs text-[var(--ui-muted-foreground)]">
              待播队列为空，可点击下方快速添加或在列表页加入队列。
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {queuedEpisodes.map((ep, idx) => {
                const meta = getPlatformMeta(ep.platform);
                return (
                  <div
                    key={ep.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-2.5 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--ui-muted-foreground)]">
                        <span className="tabular-nums font-semibold">
                          #{idx + 1}
                        </span>
                        <span
                          className="rounded px-1 py-0.5 text-[10px] font-semibold"
                          style={{ color: meta.fg, background: meta.bg }}
                        >
                          {meta.label}
                        </span>
                        <span className="truncate">{ep.channel}</span>
                        <span className="tabular-nums shrink-0">
                          {formatTime(ep.durationSec)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs font-medium text-[var(--ui-foreground)]">
                        {ep.title}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        aria-label={`立即播放队列单集 ${ep.title}`}
                        className="size-6 border-transparent bg-transparent p-0"
                        onClick={() => onPlayEpisode(ep.id)}
                      >
                        <PlayIcon className="size-3" aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`上移队列单集 ${ep.title}`}
                        className="size-6 border-transparent bg-transparent p-0"
                        disabled={idx === 0}
                        onClick={() => onMoveItem(ep.id, -1)}
                      >
                        <ArrowUpIcon className="size-3" aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`下移队列单集 ${ep.title}`}
                        className="size-6 border-transparent bg-transparent p-0"
                        disabled={idx === queuedEpisodes.length - 1}
                        onClick={() => onMoveItem(ep.id, 1)}
                      >
                        <ArrowDownIcon className="size-3" aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`从队列移除 ${ep.title}`}
                        className="size-6 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)]"
                        onClick={() => onRemoveItem(ep.id)}
                      >
                        <XIcon className="size-3" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {suggestedEpisodes.length > 0 && (
            <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
              <div className="mb-2 text-[11px] font-semibold text-[var(--ui-muted-foreground)]">
                快速加入队列
              </div>
              <div className="flex flex-col gap-1.5">
                {suggestedEpisodes.map((ep) => (
                  <div
                    key={`suggest-${ep.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-[var(--ui-muted)]"
                  >
                    <span className="truncate text-[var(--ui-foreground)]">
                      {ep.title}
                    </span>
                    <Button
                      aria-label={`将 ${ep.title} 加入待播队列`}
                      className="h-6 shrink-0 px-2 text-[11px]"
                      onClick={() => onAddEpisode(ep.id)}
                    >
                      加入
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
