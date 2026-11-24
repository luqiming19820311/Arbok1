import crypto from "node:crypto";
import path from "node:path";
import type {
  Episode,
  Subscription,
  TranscriptSegment,
} from "@/components/arbok/types";
import { parseSrtOrVtt, runIsolatedSubprocess } from "../asr";
import { resolveBinary } from "../env";
import { proxyFetch, resolveEffectiveProxyUrl } from "../proxy";
import { detectLanguageFromText, formatRelativeDate } from "./podcast";

interface YtDlpFormat {
  url?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  tbr?: number;
  protocol?: string;
}

interface YtDlpSubtitleTrack {
  ext?: string;
  url?: string;
}

interface YtDlpVideoInfo {
  id?: string;
  title?: string;
  description?: string;
  channel?: string;
  uploader?: string;
  channel_id?: string;
  channel_url?: string;
  thumbnail?: string;
  duration?: number;
  upload_date?: string;
  webpage_url?: string;
  url?: string;
  _type?: string;
  formats?: YtDlpFormat[];
  subtitles?: Record<string, YtDlpSubtitleTrack[]>;
  automatic_captions?: Record<string, YtDlpSubtitleTrack[]>;
  entries?: YtDlpVideoInfo[];
}

function findYtDlp(): string {
  const home = process.env.HOME ?? "";
  const bin = resolveBinary([
    path.join(home, ".local", "bin", "yt-dlp"),
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "yt-dlp",
  ]);
  if (!bin) {
    throw new Error("未检测到 yt-dlp，请先运行 brew install yt-dlp");
  }
  return bin;
}

function buildProxyArgs(): string[] {
  const proxyUrl = resolveEffectiveProxyUrl();
  if (proxyUrl) {
    return ["--proxy", proxyUrl];
  }
  return [];
}

function qualityToTargetHeight(quality?: string): number {
  switch (quality) {
    case "4K":
      return 2160;
    case "2K":
      return 1440;
    case "1080P":
      return 1080;
    case "720P":
      return 720;
    case "480P":
      return 480;
    default:
      return 1080;
  }
}

function pickStreamsFromFormats(
  formats: YtDlpFormat[] = [],
  quality?: string
): {
  videoUrl?: string;
  audioUrl?: string;
} {
  const httpFormats = formats.filter(
    (f) =>
      f.url &&
      f.protocol !== "m3u8_native" &&
      f.protocol !== "m3u8" &&
      !f.url.includes(".m3u8")
  );

  const muxedMp4 = httpFormats
    .filter(
      (f) =>
        f.vcodec &&
        f.vcodec !== "none" &&
        f.acodec &&
        f.acodec !== "none" &&
        (f.ext === "mp4" || f.ext === "webm")
    )
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  const targetHeight = qualityToTargetHeight(quality);
  const bestMuxed =
    muxedMp4.find((f) => (f.height ?? 0) <= targetHeight) ?? muxedMp4[0];

  const audioOnly = httpFormats
    .filter(
      (f) =>
        (!f.vcodec || f.vcodec === "none") &&
        f.acodec &&
        f.acodec !== "none" &&
        (f.ext === "m4a" || f.ext === "mp4" || f.ext === "webm")
    )
    .sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0));

  return {
    videoUrl: bestMuxed?.url,
    audioUrl: audioOnly[0]?.url ?? bestMuxed?.url,
  };
}

export function parseJson3Subtitles(raw: string): TranscriptSegment[] {
  const data = JSON.parse(raw) as {
    events?: Array<{
      tStartMs?: number;
      dDurationMs?: number;
      segs?: Array<{ utf8?: string }>;
    }>;
  };

  const rawItems: Array<{ start: number; end: number; text: string }> = [];
  for (const ev of data.events ?? []) {
    const text = (ev.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const start = Number(((ev.tStartMs ?? 0) / 1000).toFixed(2));
    const end = Number(
      (((ev.tStartMs ?? 0) + (ev.dDurationMs ?? 3000)) / 1000).toFixed(2)
    );
    rawItems.push({ start, end, text });
  }

  /* Group fragmented auto-caption chunks into readable sentences while keeping 100% of words and full duration. */
  const merged: TranscriptSegment[] = [];
  let bufStart = 0;
  let bufEnd = 0;
  let bufText = "";

  const flush = () => {
    const clean = bufText.trim();
    if (!clean) return;
    merged.push({
      id: merged.length + 1,
      start: bufStart,
      end: Math.max(bufEnd, bufStart + 0.5),
      orig: clean,
    });
    bufText = "";
  };

  for (const item of rawItems) {
    if (!bufText) {
      bufStart = item.start;
      bufEnd = item.end;
      bufText = item.text;
    } else {
      const gap = item.start - bufEnd;
      const combined = `${bufText} ${item.text}`;
      const duration = item.end - bufStart;
      const endsSentence = /[.?!。？！]$/.test(bufText);

      if (endsSentence || gap > 2.5 || combined.length > 140 || duration > 10) {
        flush();
        bufStart = item.start;
        bufEnd = item.end;
        bufText = item.text;
      } else {
        bufText = combined;
        bufEnd = Math.max(bufEnd, item.end);
      }
    }
  }
  flush();

  return merged;
}

function selectSubtitleLanguages(
  map: Record<string, YtDlpSubtitleTrack[]>,
  preferredTitleLang: "zh" | "en"
): string[] {
  const keys = Object.keys(map);
  if (keys.length === 0) return [];

  const exactOrder =
    preferredTitleLang === "zh"
      ? ["zh-Hans", "zh-CN", "zh", "zh-Hant", "zh-TW", "en", "en-US", "en-orig", "en-GB"]
      : ["en", "en-orig", "en-US", "en-GB", "zh-Hans", "zh-CN", "zh", "zh-Hant"];

  const chosen: string[] = [];
  for (const k of exactOrder) {
    if (map[k] && !chosen.includes(k)) chosen.push(k);
  }
  for (const k of keys) {
    if ((k.startsWith("en") || k.startsWith("zh")) && !chosen.includes(k)) {
      chosen.push(k);
    }
  }
  for (const k of keys) {
    if (!chosen.includes(k)) chosen.push(k);
  }
  return chosen;
}

async function fetchBestYouTubeSubtitle(
  info: YtDlpVideoInfo,
  fetchImpl: typeof fetch = proxyFetch
): Promise<{ segments: TranscriptSegment[]; language: "zh" | "en" }> {
  const titleLang = detectLanguageFromText(info.title ?? "");
  const sources = [info.subtitles ?? {}, info.automatic_captions ?? {}];

  for (const map of sources) {
    const orderedLangs = selectSubtitleLanguages(map, titleLang);
    for (const lang of orderedLangs) {
      const tracks = map[lang];
      if (!tracks || tracks.length === 0) continue;
      const track =
        tracks.find((t) => t.ext === "json3") ??
        tracks.find((t) => t.ext === "vtt") ??
        tracks.find((t) => t.ext === "srv3") ??
        tracks[0];
      if (!track?.url) continue;
      try {
        const res = await fetchImpl(track.url);
        if (!res.ok) continue;
        const text = await res.text();
        const segs =
          track.ext === "json3"
            ? parseJson3Subtitles(text)
            : parseSrtOrVtt(text).map((s, i) => ({ id: i + 1, ...s }));
        if (segs.length > 0) {
          return {
            segments: segs,
            language: lang.startsWith("zh") ? "zh" : "en",
          };
        }
      } catch {
        continue;
      }
    }
  }

  return {
    segments: [],
    language: titleLang,
  };
}

function formatUploadDate(raw?: string): string {
  if (!raw || raw.length !== 8) return "近期";
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00Z`;
  return formatRelativeDate(iso);
}

export function isYouTubeChannelOrPlaylist(url: string): boolean {
  return /youtube\.com\/(@|channel\/|c\/|user\/|playlist\?)/i.test(url);
}

export function normalizeYouTubeChannelUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (/youtube\.com\/playlist\?/i.test(trimmed)) return trimmed;
  if (/\/(videos|streams|shorts|playlists)$/i.test(trimmed)) return trimmed;
  if (/youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)$/i.test(trimmed)) {
    return `${trimmed}/videos`;
  }
  return trimmed;
}

function flattenYtDlpEntries(entries: YtDlpVideoInfo[] = []): YtDlpVideoInfo[] {
  const out: YtDlpVideoInfo[] = [];
  for (const entry of entries) {
    if (Array.isArray(entry.entries) && entry.entries.length > 0) {
      out.push(...flattenYtDlpEntries(entry.entries));
    } else if (
      entry.id &&
      entry.title &&
      entry._type !== "playlist" &&
      !/^UC[0-9A-Za-z_-]{20,}$/.test(entry.id)
    ) {
      out.push(entry);
    }
  }
  return out;
}

export async function resolveYouTubeStreamAndSubtitles(
  videoUrl: string,
  options?: { fetchSubtitles?: boolean; quality?: string; fetchImpl?: typeof fetch }
): Promise<{
  videoUrl?: string;
  audioUrl?: string;
  durationSec: number;
  coverUrl?: string;
  title?: string;
  description?: string;
  channel?: string;
  externalId?: string;
  language?: "en" | "zh";
  transcript: TranscriptSegment[];
  streamExpiresAt: number;
}> {
  const ytdlp = findYtDlp();
  const baseArgs = [
    "--dump-single-json",
    "--no-warnings",
    "--no-playlist",
    ...buildProxyArgs(),
  ];

  /* Prefer YouTube android client because its direct MP4 URLs allow unrestricted Range seeking without 403. */
  let info: YtDlpVideoInfo | null = null;
  let streams: { videoUrl?: string; audioUrl?: string } = {};
  try {
    const { stdout } = await runIsolatedSubprocess(ytdlp, [
      "--extractor-args",
      "youtube:player_client=android",
      ...baseArgs,
      videoUrl,
    ]);
    const parsed = JSON.parse(stdout) as YtDlpVideoInfo;
    const candidate = pickStreamsFromFormats(parsed.formats, options?.quality);
    if (candidate.videoUrl || candidate.audioUrl || parsed.url) {
      info = parsed;
      streams = candidate;
    }
  } catch {
    info = null;
  }

  if (!info) {
    const { stdout } = await runIsolatedSubprocess(ytdlp, [
      ...baseArgs,
      videoUrl,
    ]);
    info = JSON.parse(stdout) as YtDlpVideoInfo;
    streams = pickStreamsFromFormats(info.formats, options?.quality);
  }

  const subResult =
    options?.fetchSubtitles !== false
      ? await fetchBestYouTubeSubtitle(info, options?.fetchImpl ?? proxyFetch)
      : { segments: [], language: detectLanguageFromText(info.title ?? "") };

  return {
    videoUrl: streams.videoUrl ?? info.url,
    audioUrl: streams.audioUrl ?? streams.videoUrl ?? info.url,
    durationSec: Math.round(info.duration ?? 0),
    coverUrl: info.thumbnail,
    title: info.title,
    description: info.description?.trim() || undefined,
    channel: info.channel ?? info.uploader,
    externalId: info.id,
    language: subResult.language,
    transcript: subResult.segments,
    streamExpiresAt: Date.now() + 4 * 3600 * 1000,
  };
}

export async function parseYouTubeUrl(
  url: string,
  options?: { limit?: number; fetchImpl?: typeof fetch }
): Promise<{ subscription?: Subscription; episodes: Episode[] }> {
  const ytdlp = findYtDlp();
  const limit = options?.limit ?? 12;

  if (isYouTubeChannelOrPlaylist(url)) {
    const normalizedUrl = normalizeYouTubeChannelUrl(url);
    const { stdout } = await runIsolatedSubprocess(ytdlp, [
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      "--playlist-end",
      String(limit),
      ...buildProxyArgs(),
      normalizedUrl,
    ]);
    const info = JSON.parse(stdout) as YtDlpVideoInfo;
    const channelTitle =
      (info.channel ?? info.uploader ?? info.title ?? "YouTube 频道").replace(
        /\s*-\s*Videos$/i,
        ""
      );
    const subId = `sub-yt-${info.channel_id ?? crypto.createHash("sha1").update(normalizedUrl).digest("hex").slice(0, 10)}`;
    const flatEntries = flattenYtDlpEntries(info.entries).slice(0, limit);
    const firstThumb = flatEntries[0]?.id
      ? `https://i.ytimg.com/vi/${flatEntries[0].id}/hqdefault.jpg`
      : undefined;

    const subscription: Subscription = {
      id: subId,
      name: channelTitle,
      platform: "youtube",
      sourceUrl: normalizedUrl,
      externalId: info.channel_id ?? normalizedUrl,
      coverUrl: info.thumbnail ?? firstThumb,
      gradient: "linear-gradient(135deg, #9f1239 0%, #e11d48 55%, #1e1b4b 100%)",
      shortLabel: channelTitle.slice(0, 3).toUpperCase(),
    };

    const episodes: Episode[] = flatEntries.map((entry) => {
      const videoPage = entry.url?.startsWith("http")
        ? entry.url
        : `https://www.youtube.com/watch?v=${entry.id}`;
      const thumb =
        entry.thumbnail ?? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
      return {
        id: `ep-yt-${entry.id}`,
        subId,
        externalId: entry.id,
        platform: "youtube",
        channel: channelTitle,
        title: entry.title!,
        coverUrl: thumb,
        date: formatUploadDate(entry.upload_date),
        durationSec: Math.round(entry.duration ?? 600),
        positionSec: 0,
        mediaType: "video",
        language: detectLanguageFromText(entry.title!),
        hasOfficialSub: false,
        isBilingual: false,
        hasAiGuide: false,
        isOffline: false,
        gradient: "linear-gradient(135deg, #1e293b 0%, #312e81 55%, #0f172a 100%)",
        coverKicker: "YOUTUBE",
        coverLabel: channelTitle.slice(0, 8),
        pageUrl: videoPage,
        transcript: [],
        guide: null,
        chat: [],
      };
    });

    if (episodes.length === 0) {
      throw new Error("未从该 YouTube 频道/播放列表解析到视频条目");
    }

    /* Pre-resolve stream and full official subtitles for the latest video so immediate playback is instant. */
    try {
      const first = episodes[0];
      const resolved = await resolveYouTubeStreamAndSubtitles(first.pageUrl, {
        fetchSubtitles: true,
        fetchImpl: options?.fetchImpl,
      });
      first.videoUrl = resolved.videoUrl;
      first.audioUrl = resolved.audioUrl;
      first.streamExpiresAt = resolved.streamExpiresAt;
      if (resolved.durationSec > 0) first.durationSec = resolved.durationSec;
      if (resolved.description) first.description = resolved.description;
      if (resolved.language) first.language = resolved.language;
      if (resolved.transcript.length > 0) {
        first.transcript = resolved.transcript;
        first.hasOfficialSub = true;
      }
    } catch {
      /* Remaining episodes still resolve lazily on play/open. */
    }

    return { subscription, episodes };
  }

  const resolved = await resolveYouTubeStreamAndSubtitles(url, {
    fetchSubtitles: true,
    fetchImpl: options?.fetchImpl,
  });
  const epId = `ep-yt-${resolved.externalId ?? crypto.createHash("sha1").update(url).digest("hex").slice(0, 10)}`;
  const channel = resolved.channel ?? "YouTube";

  const episode: Episode = {
    id: epId,
    subId: null,
    externalId: resolved.externalId ?? url,
    platform: "youtube",
    channel,
    title: resolved.title ?? "YouTube 视频",
    description: resolved.description,
    coverUrl: resolved.coverUrl,
    date: "刚刚",
    durationSec: resolved.durationSec || 600,
    positionSec: 0,
    mediaType: "video",
    language: resolved.language ?? "en",
    hasOfficialSub: resolved.transcript.length > 0,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: false,
    gradient: "linear-gradient(135deg, #1e293b 0%, #312e81 55%, #0f172a 100%)",
    coverKicker: "YOUTUBE",
    coverLabel: channel.slice(0, 8),
    pageUrl: url,
    audioUrl: resolved.audioUrl,
    videoUrl: resolved.videoUrl,
    streamExpiresAt: resolved.streamExpiresAt,
    transcript: resolved.transcript,
    guide: null,
    chat: [],
  };

  return { episodes: [episode] };
}
