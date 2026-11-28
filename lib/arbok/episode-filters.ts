import type { Episode } from "@/components/arbok/types";

export type EpisodeStatusFilter = "all" | "unfinished" | "watched" | "subtitled";
export type EpisodeSortOrder = "newest" | "oldest";

export interface ChannelDateFilter {
  year: number | null;
  month: number | null;
  day: number | null;
}

export const EMPTY_DATE_FILTER: ChannelDateFilter = {
  year: null,
  month: null,
  day: null,
};

export function isEpisodeRead(ep: Episode): boolean {
  if (typeof ep.isRead === "boolean") {
    return ep.isRead;
  }
  return ep.durationSec > 0 && ep.positionSec / ep.durationSec >= 0.95;
}

export function isEpisodeWatched(ep: Episode): boolean {
  return (
    Boolean(ep.isRead) ||
    (ep.durationSec > 0 && ep.positionSec / ep.durationSec >= 0.95)
  );
}

export function hasEpisodeSubtitles(ep: Episode): boolean {
  return Boolean(ep.hasOfficialSub || ep.isBilingual || ep.transcript.length > 0);
}

export const DEFAULT_REFERENCE_NOW_MS = Date.UTC(2026, 10, 28, 12, 0, 0);

export function getEpisodePublishedDate(
  ep: Episode,
  nowMs = DEFAULT_REFERENCE_NOW_MS
): Date {
  if (typeof ep.publishedAt === "number" && ep.publishedAt > 0) {
    const ms = ep.publishedAt > 1e12 ? ep.publishedAt : ep.publishedAt * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const label = (ep.date ?? "").trim();
  const isoMatch = label.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      12,
      0,
      0
    );
  }
  const daysMatch = label.match(/^(\d+)\s*天前$/);
  if (daysMatch) {
    return new Date(nowMs - Number(daysMatch[1]) * 86_400_000);
  }
  if (label === "昨天") {
    return new Date(nowMs - 86_400_000);
  }
  const hoursMatch = label.match(/^(\d+)\s*小时前$/);
  if (hoursMatch) {
    return new Date(nowMs - Number(hoursMatch[1]) * 3_600_000);
  }
  return new Date(nowMs);
}

export function matchesEpisodeFilters(
  ep: Episode,
  options: {
    statusFilter?: EpisodeStatusFilter;
    unreadOnly?: boolean;
    dateFilter?: ChannelDateFilter;
    nowMs?: number;
  }
): boolean {
  if (options.unreadOnly && isEpisodeRead(ep)) {
    return false;
  }

  if (options.statusFilter === "watched" && !isEpisodeWatched(ep)) {
    return false;
  }
  if (options.statusFilter === "unfinished" && isEpisodeWatched(ep)) {
    return false;
  }
  if (options.statusFilter === "subtitled" && !hasEpisodeSubtitles(ep)) {
    return false;
  }

  const df = options.dateFilter;
  if (df && (df.year !== null || df.month !== null || df.day !== null)) {
    const d = getEpisodePublishedDate(ep, options.nowMs);
    if (df.year !== null && d.getFullYear() !== df.year) return false;
    if (df.month !== null && d.getMonth() + 1 !== df.month) return false;
    if (df.day !== null && d.getDate() !== df.day) return false;
  }

  return true;
}

export function sortEpisodesByDate(
  episodes: Episode[],
  order: EpisodeSortOrder,
  nowMs = DEFAULT_REFERENCE_NOW_MS
): Episode[] {
  if (order === "newest" && episodes.length <= 1) return episodes;
  const copy = [...episodes];
  copy.sort((a, b) => {
    const ta = getEpisodePublishedDate(a, nowMs).getTime();
    const tb = getEpisodePublishedDate(b, nowMs).getTime();
    return order === "newest" ? tb - ta : ta - tb;
  });
  return copy;
}
