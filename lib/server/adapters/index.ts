import type { Episode, Subscription, TranscriptSegment } from "@/components/arbok/types";
import {
  getEpisodeById,
  listSubscriptions,
  replaceEpisodeTranscript,
  updateEpisodeFields,
  upsertEpisodeByExternalId,
  upsertSubscription,
} from "../db";
import { parseBilibiliUrl, resolveBilibiliStream } from "./bilibili";
import {
  fetchPodcastOfficialTranscriptForEpisode,
  parseApplePodcastsUrl,
  parseRssFeed,
  parseXiaoyuzhouUrl,
} from "./podcast";
import { parseYouTubeUrl, resolveYouTubeStreamAndSubtitles } from "./youtube";

export interface IngestResult {
  kind: "subscription" | "episode";
  subscription?: Subscription;
  episode: Episode;
  addedCount: number;
  totalParsed: number;
}

export function normalizeIngestUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  const rsshubBiliMatch = trimmed.match(
    /^(?:rsshub:\/\/|https?:\/\/[^/]+\/)bilibili\/user\/video\/(\d+)/i
  );
  if (rsshubBiliMatch) {
    return `https://space.bilibili.com/${rsshubBiliMatch[1]}`;
  }

  if (
    /^(?:space\.bilibili\.com|www\.bilibili\.com|m\.bilibili\.com|b23\.tv|(?:www\.)?youtube\.com|youtu\.be|(?:www\.)?xiaoyuzhoufm\.com|podcasts\.apple\.com)\//i.test(
      trimmed
    )
  ) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

export async function ingestUrl(
  rawUrl: string,
  options?: { fetchImpl?: typeof fetch; limit?: number }
): Promise<IngestResult> {
  const url = normalizeIngestUrl(rawUrl);
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      "请输入有效的链接（支持播客 RSS、Apple 播客、小宇宙、YouTube、B站或直链音频）"
    );
  }

  let parsed: { subscription?: Subscription; episodes: Episode[] };

  if (/youtube\.com|youtu\.be/i.test(url)) {
    parsed = await parseYouTubeUrl(url, options);
  } else if (/bilibili\.com|b23\.tv/i.test(url)) {
    parsed = await parseBilibiliUrl(url, options);
  } else if (/xiaoyuzhoufm\.com/i.test(url)) {
    parsed = await parseXiaoyuzhouUrl(url, options?.fetchImpl);
  } else if (/podcasts\.apple\.com/i.test(url)) {
    parsed = await parseApplePodcastsUrl(url, options);
  } else {
    parsed = await parseRssFeed(url, options);
  }

  if (parsed.subscription) {
    upsertSubscription(parsed.subscription);
  }

  let addedCount = 0;
  let primaryEpisode: Episode | null = null;

  /* Insert oldest-to-newest so the latest feed/channel episode gets the newest created_at and surfaces first. */
  const reversed = [...parsed.episodes].reverse();
  for (let i = 0; i < reversed.length; i++) {
    const ep = reversed[i];
    const res = upsertEpisodeByExternalId(ep);
    if (res.created) addedCount += 1;
    if (i === reversed.length - 1) primaryEpisode = res.episode;
  }

  if (!primaryEpisode) {
    throw new Error("解析完成但未获取到任何可播放单集");
  }

  return {
    kind: parsed.subscription ? "subscription" : "episode",
    subscription: parsed.subscription,
    episode: primaryEpisode,
    addedCount,
    totalParsed: parsed.episodes.length,
  };
}

export async function refreshSubscriptions(
  sourceId?: string,
  fetchImpl?: typeof fetch
): Promise<{ refreshedSources: number; newEpisodes: number; errors: string[] }> {
  const all = listSubscriptions();
  const targets = all.filter((sub) => {
    if (sourceId && sub.id !== sourceId) return false;
    return Boolean(sub.sourceUrl && !sub.sourceUrl.includes("arbok.local"));
  });

  let refreshedSources = 0;
  let newEpisodes = 0;
  const errors: string[] = [];

  for (const sub of targets) {
    try {
      const res = await ingestUrl(sub.sourceUrl!, { fetchImpl, limit: 10 });
      refreshedSources += 1;
      newEpisodes += res.addedCount;
    } catch (err) {
      errors.push(
        `${sub.name}: ${err instanceof Error ? err.message : "刷新失败"}`
      );
    }
  }

  return { refreshedSources, newEpisodes, errors };
}

export async function fetchOfficialSubtitlesForEpisode(
  episodeId: string,
  options?: { force?: boolean; fetchImpl?: typeof fetch }
): Promise<{
  transcript: TranscriptSegment[];
  description?: string;
  notice?: string;
  needLogin?: boolean;
}> {
  const ep = getEpisodeById(episodeId);
  if (!ep) throw new Error(`未找到单集 ${episodeId}`);
  if (!options?.force && ep.transcript.length > 0 && ep.description) {
    return { transcript: ep.transcript, description: ep.description };
  }
  if (/arbok/i.test(ep.pageUrl)) {
    return { transcript: ep.transcript, description: ep.description };
  }

  if (ep.platform === "youtube") {
    const resolved = await resolveYouTubeStreamAndSubtitles(ep.pageUrl, {
      fetchSubtitles: options?.force || ep.transcript.length === 0,
      fetchImpl: options?.fetchImpl,
    });
    updateEpisodeFields(ep.id, {
      audioUrl: resolved.audioUrl,
      videoUrl: resolved.videoUrl,
      streamExpiresAt: resolved.streamExpiresAt,
      durationSec: resolved.durationSec || ep.durationSec,
      description: resolved.description,
    });
    const transcript =
      resolved.transcript.length > 0
        ? replaceEpisodeTranscript(ep.id, resolved.transcript)
        : ep.transcript;
    return {
      transcript,
      description: resolved.description ?? ep.description,
      notice:
        resolved.transcript.length === 0
          ? "该 YouTube 视频暂未提供可拉取的官方字幕，可使用 ASR 语音转写。"
          : undefined,
    };
  } else if (ep.platform === "bilibili") {
    const resolved = await resolveBilibiliStream(ep.pageUrl, {
      fetchSubtitles: options?.force || ep.transcript.length === 0,
      fetchImpl: options?.fetchImpl,
    });
    updateEpisodeFields(ep.id, {
      audioUrl: resolved.audioUrl,
      videoUrl: resolved.videoUrl,
      streamExpiresAt: resolved.streamExpiresAt,
      durationSec: resolved.durationSec || ep.durationSec,
      description: resolved.description,
    });
    const transcript =
      resolved.transcript.length > 0
        ? replaceEpisodeTranscript(ep.id, resolved.transcript)
        : ep.transcript;
    return {
      transcript,
      description: resolved.description ?? ep.description,
      notice: resolved.subtitleNotice,
      needLogin: resolved.needLogin,
    };
  } else if (ep.platform === "podcast" && ep.subId && (options?.force || ep.transcript.length === 0)) {
    const sub = listSubscriptions().find((s) => s.id === ep.subId);
    if (sub?.sourceUrl) {
      const official = await fetchPodcastOfficialTranscriptForEpisode(
        sub.sourceUrl,
        {
          externalId: ep.externalId,
          audioUrl: ep.audioUrl,
          title: ep.title,
        },
        options?.fetchImpl
      );
      if (official.length > 0) {
        const saved = replaceEpisodeTranscript(ep.id, official);
        return { transcript: saved, description: ep.description };
      }
    }
  }

  return { transcript: ep.transcript, description: ep.description };
}
