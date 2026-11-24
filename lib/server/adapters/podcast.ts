import crypto from "node:crypto";
import type {
  Episode,
  PodcastDirectoryItem,
  Subscription,
  TranscriptSegment,
} from "@/components/arbok/types";
import { parseSrtOrVtt } from "../asr";
import { proxyFetch } from "../proxy";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeXmlEntities(m[1]) : "";
}

function matchAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*>`, "i");
  const m = xml.match(re);
  return m ? m[1].replace(/&amp;/g, "&").trim() : "";
}

export function parseDurationToSeconds(raw: string | number | undefined): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (!raw) return 0;
  const trimmed = String(raw).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed));
  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

export function formatRelativeDate(dateStr: string | number | undefined): string {
  if (!dateStr) return "近期";
  const ts =
    typeof dateStr === "number"
      ? dateStr > 1e12
        ? dateStr
        : dateStr * 1000
      : Date.parse(dateStr);
  if (Number.isNaN(ts)) return "近期";
  const diffHours = Math.floor((Date.now() - ts) / 3_600_000);
  if (diffHours < 1) return "刚刚";
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "昨天";
  if (diffDays < 30) return `${diffDays} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function detectLanguageFromText(text: string): "zh" | "en" {
  const zhChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return zhChars >= Math.max(2, text.length * 0.12) ? "zh" : "en";
}

function stableId(prefix: string, seed: string): string {
  return `${prefix}-${crypto.createHash("sha1").update(seed).digest("hex").slice(0, 10)}`;
}

export async function searchApplePodcasts(
  term: string,
  fetchImpl: typeof fetch = proxyFetch
): Promise<PodcastDirectoryItem[]> {
  const q = term.trim();
  if (!q) return [];
  const url = `https://itunes.apple.com/search?media=podcast&limit=12&term=${encodeURIComponent(q)}`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Apple Podcasts 搜索失败 (${res.status})`);
  }
  const data = (await res.json()) as {
    results?: Array<{
      collectionId?: number;
      collectionName?: string;
      artistName?: string;
      primaryGenreName?: string;
      feedUrl?: string;
      artworkUrl600?: string;
      artworkUrl100?: string;
    }>;
  };

  return (data.results ?? [])
    .filter((r) => Boolean(r.feedUrl && r.collectionName))
    .map((r) => ({
      id: `apple-${r.collectionId ?? stableId("pod", r.feedUrl!)}`,
      name: r.collectionName!,
      author: r.artistName ?? "播客创作者",
      desc: r.primaryGenreName ? `${r.primaryGenreName} · Apple Podcasts` : "Apple Podcasts 播客源",
      feedUrl: r.feedUrl!,
      coverUrl: r.artworkUrl600 ?? r.artworkUrl100,
      subscribed: false,
    }));
}

function extractPodcastTranscriptCandidates(block: string): string[] {
  const tags = block.match(/<podcast:transcript\b[^>]*>/gi) ?? [];
  const candidates: Array<{ url: string; priority: number }> = [];

  for (const tag of tags) {
    const urlMatch = tag.match(/\burl=["']([^"']+)["']/i);
    if (!urlMatch) continue;
    const url = urlMatch[1].replace(/&amp;/g, "&").trim();
    if (!url) continue;
    const typeMatch = tag.match(/\btype=["']([^"']+)["']/i);
    const mime = (typeMatch?.[1] ?? "").toLowerCase();
    const lowerUrl = url.toLowerCase();

    let priority = 5;
    if (mime.includes("vtt") || lowerUrl.includes(".vtt")) priority = 1;
    else if (
      mime.includes("srt") ||
      mime.includes("subrip") ||
      lowerUrl.includes(".srt")
    ) {
      priority = 2;
    } else if (mime.includes("json") || lowerUrl.includes(".json")) {
      priority = 3;
    } else if (mime.includes("plain") || lowerUrl.includes(".txt")) {
      priority = 4;
    }
    candidates.push({ url, priority });
  }

  return candidates
    .sort((a, b) => a.priority - b.priority)
    .map((c) => c.url);
}

function parseTimestampedPlainText(
  text: string
): Array<{ start: number; end: number; orig: string }> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const raw: Array<{ start: number; orig: string }> = [];
  const lineRe =
    /^\s*(?:\[|\()?(\d{1,2}:\d{2}(?::\d{2})?)(?:\]|\))?\s*(?:[-–—]\s*)?(.*)$/;

  for (const line of lines) {
    const m = line.match(lineRe);
    if (!m) continue;
    const ts = parseDurationToSeconds(m[1]);
    const body = m[2].trim();
    if (!body) continue;
    raw.push({ start: ts, orig: body });
  }

  if (raw.length < 3) return [];
  return raw.map((item, idx) => ({
    start: item.start,
    end:
      idx + 1 < raw.length && raw[idx + 1].start > item.start
        ? raw[idx + 1].start
        : item.start + 6,
    orig: item.orig,
  }));
}

async function fetchPodcastTranscript(
  transcriptUrls: string[],
  fetchImpl: typeof fetch
): Promise<TranscriptSegment[]> {
  for (const transcriptUrl of transcriptUrls) {
    if (!transcriptUrl) continue;
    try {
      const res = await fetchImpl(transcriptUrl, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.trim().startsWith("{")) {
        const json = JSON.parse(text) as {
          segments?: Array<{ startTime?: number; endTime?: number; body?: string }>;
        };
        const segs = (json.segments ?? [])
          .filter((s) => Boolean(s.body?.trim()))
          .map((s, idx) => ({
            id: idx + 1,
            start: Number(s.startTime ?? 0),
            end: Number(s.endTime ?? (s.startTime ?? 0) + 5),
            orig: s.body!.trim(),
          }));
        if (segs.length > 0) return segs;
      }
      const cues = parseSrtOrVtt(text);
      if (cues.length > 0) {
        return cues.map((seg, idx) => ({ id: idx + 1, ...seg }));
      }
      const plainCues = parseTimestampedPlainText(text);
      if (plainCues.length > 0) {
        return plainCues.map((seg, idx) => ({ id: idx + 1, ...seg }));
      }
    } catch {
      // Try next transcript candidate.
    }
  }
  return [];
}

export async function fetchPodcastOfficialTranscriptForEpisode(
  feedUrl: string,
  target: { externalId?: string; audioUrl?: string; title?: string },
  fetchImpl: typeof fetch = proxyFetch
): Promise<TranscriptSegment[]> {
  if (!feedUrl || feedUrl.includes("arbok.local")) return [];
  try {
    const res = await fetchImpl(feedUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemBlocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
    for (const block of itemBlocks) {
      const guid = matchTag(block, "guid") || matchTag(block, "id");
      const audioUrl =
        matchAttr(block, "enclosure", "url") ||
        matchAttr(block, "media:content", "url");
      const title = matchTag(block, "title");
      const matched =
        (target.externalId && guid && guid === target.externalId) ||
        (target.audioUrl && audioUrl && audioUrl === target.audioUrl) ||
        (target.title && title && title.trim() === target.title.trim());
      if (!matched) continue;
      const candidates = extractPodcastTranscriptCandidates(block);
      if (candidates.length === 0) return [];
      return fetchPodcastTranscript(candidates, fetchImpl);
    }
  } catch {
    // Ignore RSS network errors here; caller can proceed with ASR.
  }
  return [];
}

function cleanHtmlDescription(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || undefined;
}

function extractMetaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeXmlEntities(m[1]);
  }
  return "";
}

function discoverRssLinkFromHtml(html: string, pageUrl: string): string | null {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/\brel=["'][^"']*alternate[^"']*["']/i.test(tag)) continue;
    if (
      !/\btype=["'][^"']*(?:rss\+xml|atom\+xml|application\/xml|text\/xml)[^"']*["']/i.test(
        tag
      )
    ) {
      continue;
    }
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch?.[1]) continue;
    try {
      return new URL(hrefMatch[1].replace(/&amp;/g, "&").trim(), pageUrl).toString();
    } catch {
      // Try next <link> candidate.
    }
  }
  return null;
}

function buildDirectAudioEpisode(
  audioUrl: string,
  meta?: { title?: string; channel?: string; coverUrl?: string; description?: string; pageUrl?: string }
): Episode {
  let fallbackTitle = "在线播客音频";
  try {
    const parsed = new URL(audioUrl);
    const base = decodeURIComponent(parsed.pathname.split("/").pop() ?? "").replace(
      /\.(mp3|m4a|wav|ogg|flac|aac)$/i,
      ""
    );
    if (base) fallbackTitle = base;
  } catch {
    // Keep fallback title.
  }
  const title = meta?.title?.trim() || fallbackTitle;
  const channel = meta?.channel?.trim() || "直链播客";
  return {
    id: stableId("ep-audio", audioUrl),
    subId: null,
    externalId: audioUrl,
    platform: "podcast",
    channel,
    title,
    description: meta?.description,
    coverUrl: meta?.coverUrl,
    date: "刚刚",
    durationSec: 1800,
    positionSec: 0,
    mediaType: "audio",
    language: detectLanguageFromText(`${channel} ${title}`),
    hasOfficialSub: false,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: false,
    gradient: "linear-gradient(135deg, #312e81 0%, #5b21b6 60%, #1e1b4b 100%)",
    coverKicker: "PODCAST",
    coverLabel: channel.slice(0, 8),
    pageUrl: meta?.pageUrl ?? audioUrl,
    audioUrl,
    transcript: [],
    guide: null,
    chat: [],
  };
}

export async function parseApplePodcastsUrl(
  url: string,
  options?: { limit?: number; fetchImpl?: typeof fetch }
): Promise<{ subscription?: Subscription; episodes: Episode[] }> {
  const doFetch = options?.fetchImpl ?? proxyFetch;
  const idMatch = url.match(/\/id(\d+)/i);
  if (!idMatch) {
    throw new Error("未能从 Apple Podcasts 链接中提取节目 ID（需包含 /id数字）");
  }
  const collectionId = idMatch[1];
  const parsedUrl = new URL(url);
  const trackId = parsedUrl.searchParams.get("i");
  const countryMatch = parsedUrl.pathname.match(/^\/([a-z]{2})\//i);
  const country = countryMatch ? countryMatch[1].toUpperCase() : "US";

  const lookupUrl = `https://itunes.apple.com/lookup?id=${collectionId}&entity=podcast&country=${country}`;
  const res = await doFetch(lookupUrl, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Apple Podcasts 查询失败 (${res.status})`);
  }
  const data = (await res.json()) as {
    results?: Array<{ feedUrl?: string; collectionName?: string }>;
  };
  const feedUrl = data.results?.find((r) => Boolean(r.feedUrl))?.feedUrl;
  if (!feedUrl) {
    throw new Error("未在 Apple Podcasts 目录中找到该节目的公开 RSS 源");
  }

  const parsed = await parseRssFeed(feedUrl, {
    limit: options?.limit ?? 15,
    fetchImpl: doFetch,
  });

  if (trackId) {
    try {
      const epLookup = await doFetch(
        `https://itunes.apple.com/lookup?id=${trackId}&entity=podcastEpisode&country=${country}`,
        { headers: { "User-Agent": USER_AGENT } }
      );
      if (epLookup.ok) {
        const epData = (await epLookup.json()) as {
          results?: Array<{ trackName?: string; episodeUrl?: string; episodeGuid?: string }>;
        };
        const targetEp = epData.results?.find((r) => Boolean(r.trackName || r.episodeGuid));
        if (targetEp) {
          const matchIdx = parsed.episodes.findIndex(
            (e) =>
              (targetEp.episodeGuid && e.externalId === targetEp.episodeGuid) ||
              (targetEp.episodeUrl && e.audioUrl === targetEp.episodeUrl) ||
              (targetEp.trackName &&
                e.title.toLowerCase().includes(targetEp.trackName.toLowerCase()))
          );
          if (matchIdx > 0) {
            const [picked] = parsed.episodes.splice(matchIdx, 1);
            parsed.episodes.unshift(picked);
          }
        }
      }
    } catch {
      // Keep default latest episode ordering if track lookup fails.
    }
  }

  return parsed;
}

export async function parseRssFeed(
  feedUrl: string,
  options?: { limit?: number; fetchImpl?: typeof fetch; _depth?: number }
): Promise<{ subscription?: Subscription; episodes: Episode[] }> {
  const doFetch = options?.fetchImpl ?? proxyFetch;
  const limit = options?.limit ?? 15;
  const depth = options?._depth ?? 0;

  if (/\.(mp3|m4a|wav|ogg|flac|aac)(?:$|\?)/i.test(feedUrl)) {
    return { episodes: [buildDirectAudioEpisode(feedUrl)] };
  }

  const res = await doFetch(feedUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml, text/html, */*",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    if (/feed\.xyzfm\.space/i.test(feedUrl) && res.status === 403) {
      throw new Error(
        "该小宇宙专属 RSS（xyzfm.space）仅限 Apple 播客客户端访问，请直接粘贴小宇宙节目主页链接（xiaoyuzhoufm.com/podcast/...）进行订阅。"
      );
    }
    throw new Error(`拉取播客源失败 (${res.status})：${feedUrl}`);
  }
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.startsWith("audio/")) {
    return { episodes: [buildDirectAudioEpisode(res.url || feedUrl)] };
  }

  const xml = await res.text();
  if (!/<(rss|feed|channel)\b/i.test(xml)) {
    if (depth < 1) {
      const discoveredRss = discoverRssLinkFromHtml(xml, res.url || feedUrl);
      if (discoveredRss) {
        return parseRssFeed(discoveredRss, {
          limit,
          fetchImpl: doFetch,
          _depth: depth + 1,
        });
      }
      const ogAudio =
        extractMetaContent(xml, "og:audio") ||
        extractMetaContent(xml, "og:audio:secure_url") ||
        (xml.match(/<(?:audio|source)\b[^>]*\bsrc=["']([^"']+\.(?:mp3|m4a|wav|ogg|aac)[^"']*)["']/i)?.[1] ??
          "");
      if (ogAudio) {
        const resolvedAudio = new URL(ogAudio.replace(/&amp;/g, "&"), res.url || feedUrl).toString();
        const pageTitle =
          extractMetaContent(xml, "og:title") || matchTag(xml, "title") || undefined;
        const siteName = extractMetaContent(xml, "og:site_name") || undefined;
        const ogImage = extractMetaContent(xml, "og:image") || undefined;
        const ogDesc = extractMetaContent(xml, "og:description") || undefined;
        return {
          episodes: [
            buildDirectAudioEpisode(resolvedAudio, {
              title: pageTitle,
              channel: siteName,
              coverUrl: ogImage,
              description: ogDesc,
              pageUrl: res.url || feedUrl,
            }),
          ],
        };
      }
    }
    throw new Error("未能从该链接识别到 RSS 源或可播放音频（支持 RSS、Apple 播客、小宇宙及播客官网链接）");
  }

  const channelHeader = xml.split(/<item[\s>]|<entry[\s>]/i)[0] ?? xml;
  const channelTitle = matchTag(channelHeader, "title") || "未命名播客";
  const channelCover =
    matchAttr(channelHeader, "itunes:image", "href") ||
    matchTag(channelHeader, "url") ||
    undefined;

  const subId = stableId("sub-rss", feedUrl);
  const subscription: Subscription = {
    id: subId,
    name: channelTitle,
    platform: "podcast",
    sourceUrl: feedUrl,
    externalId: feedUrl,
    coverUrl: channelCover,
    gradient: "linear-gradient(135deg, #4338ca 0%, #6d28d9 60%, #1e1b4b 100%)",
    shortLabel: channelTitle.slice(0, 3),
  };

  const itemBlocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const episodes: Episode[] = [];

  for (const block of itemBlocks.slice(0, limit)) {
    const title = matchTag(block, "title");
    const audioUrl =
      matchAttr(block, "enclosure", "url") ||
      matchAttr(block, "media:content", "url");
    if (!title || !audioUrl) continue;

    const guid = matchTag(block, "guid") || matchTag(block, "id") || audioUrl;
    const link = matchTag(block, "link") || matchAttr(block, "link", "href") || feedUrl;
    const pubDate = matchTag(block, "pubDate") || matchTag(block, "published");
    const durationSec =
      parseDurationToSeconds(matchTag(block, "itunes:duration")) || 1800;
    const epCover =
      matchAttr(block, "itunes:image", "href") || channelCover;
    const rawDesc =
      matchTag(block, "itunes:summary") ||
      matchTag(block, "description") ||
      matchTag(block, "summary") ||
      undefined;
    const transcriptUrls = extractPodcastTranscriptCandidates(block);
    const transcript =
      transcriptUrls.length > 0
        ? await fetchPodcastTranscript(transcriptUrls, doFetch)
        : [];
    const language = detectLanguageFromText(`${channelTitle} ${title}`);

    episodes.push({
      id: stableId("ep-rss", `${feedUrl}::${guid}`),
      subId,
      externalId: guid,
      platform: "podcast",
      channel: channelTitle,
      title,
      description: rawDesc,
      coverUrl: epCover,
      date: formatRelativeDate(pubDate),
      durationSec,
      positionSec: 0,
      mediaType: "audio",
      language,
      hasOfficialSub: transcript.length > 0,
      isBilingual: false,
      hasAiGuide: false,
      isOffline: false,
      gradient: "linear-gradient(135deg, #312e81 0%, #5b21b6 60%, #1e1b4b 100%)",
      coverKicker: "PODCAST",
      coverLabel: channelTitle.slice(0, 8),
      pageUrl: link,
      audioUrl,
      transcript,
      guide: null,
      chat: [],
    });
  }

  if (episodes.length === 0) {
    throw new Error("RSS 解析成功，但未找到可播放的音频单集（enclosure）");
  }

  return { subscription, episodes };
}

export async function parseXiaoyuzhouUrl(
  url: string,
  fetchImpl: typeof fetch = proxyFetch
): Promise<{ subscription?: Subscription; episodes: Episode[] }> {
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: "https://www.xiaoyuzhoufm.com/",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`拉取小宇宙页面失败 (${res.status})`);
  }
  const html = await res.text();
  const nextDataMatch = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!nextDataMatch) {
    const ogAudio = extractMetaContent(html, "og:audio");
    if (ogAudio) {
      const title = extractMetaContent(html, "og:title") || "小宇宙单集";
      const coverUrl = extractMetaContent(html, "og:image") || undefined;
      const desc = extractMetaContent(html, "og:description") || undefined;
      return {
        episodes: [
          {
            ...buildDirectAudioEpisode(ogAudio, {
              title,
              channel: "小宇宙播客",
              coverUrl,
              description: desc,
              pageUrl: url,
            }),
            id: stableId("ep-xyz", url),
            platform: "xiaoyuzhou",
            gradient: "linear-gradient(135deg, #0369a1 0%, #0284c7 55%, #0c4a6e 100%)",
            coverKicker: "小宇宙",
            coverLabel: title.slice(0, 6),
          },
        ],
      };
    }
    throw new Error("未能从小宇宙页面提取节目数据（__NEXT_DATA__ / og:audio）");
  }

  const nextData = JSON.parse(nextDataMatch[1]) as {
    props?: {
      pageProps?: {
        episode?: {
          eid?: string;
          title?: string;
          duration?: number;
          pubDate?: string;
          shownotes?: string;
          description?: string;
          enclosure?: { url?: string };
          media?: { source?: { url?: string } };
          image?: { picUrl?: string };
          podcast?: {
            pid?: string;
            title?: string;
            image?: { picUrl?: string };
          };
        };
        podcast?: {
          pid?: string;
          title?: string;
          image?: { picUrl?: string };
          episodes?: Array<{
            eid?: string;
            title?: string;
            duration?: number;
            pubDate?: string;
            shownotes?: string;
            description?: string;
            enclosure?: { url?: string };
            media?: { source?: { url?: string } };
            image?: { picUrl?: string };
          }>;
        };
      };
    };
  };

  const pageProps = nextData.props?.pageProps;
  const single = pageProps?.episode;
  if (single) {
    const audioUrl = single.enclosure?.url ?? single.media?.source?.url;
    if (!audioUrl) {
      throw new Error("该小宇宙单集未包含可播放音频地址");
    }
    const channel = single.podcast?.title ?? "小宇宙播客";
    const coverUrl = single.image?.picUrl ?? single.podcast?.image?.picUrl;
    const ep: Episode = {
      id: stableId("ep-xyz", single.eid ?? url),
      subId: null,
      externalId: single.eid ?? url,
      platform: "xiaoyuzhou",
      channel,
      title: single.title ?? "小宇宙单集",
      description: cleanHtmlDescription(single.shownotes ?? single.description),
      coverUrl,
      date: formatRelativeDate(single.pubDate),
      durationSec: parseDurationToSeconds(single.duration) || 1800,
      positionSec: 0,
      mediaType: "audio",
      language: detectLanguageFromText(`${channel} ${single.title ?? "中文"}`),
      hasOfficialSub: false,
      isBilingual: false,
      hasAiGuide: false,
      isOffline: false,
      gradient: "linear-gradient(135deg, #0369a1 0%, #0284c7 55%, #0c4a6e 100%)",
      coverKicker: "小宇宙",
      coverLabel: channel.slice(0, 6),
      pageUrl: url,
      audioUrl,
      transcript: [],
      guide: null,
      chat: [],
    };
    return { episodes: [ep] };
  }

  const podcast = pageProps?.podcast;
  if (podcast && Array.isArray(podcast.episodes)) {
    const subId = `sub-xyz-${podcast.pid ?? stableId("xyz", url)}`;
    const channel = podcast.title ?? "小宇宙节目";
    const subCover = podcast.image?.picUrl;
    const subscription: Subscription = {
      id: subId,
      name: channel,
      platform: "xiaoyuzhou",
      sourceUrl: url,
      externalId: podcast.pid ?? url,
      coverUrl: subCover,
      gradient: "linear-gradient(135deg, #0369a1 0%, #0284c7 55%, #0c4a6e 100%)",
      shortLabel: channel.slice(0, 3),
    };

    const episodes: Episode[] = [];
    for (const item of podcast.episodes.slice(0, 15)) {
      const audioUrl = item.enclosure?.url ?? item.media?.source?.url;
      if (!audioUrl || !item.title) continue;
      episodes.push({
        id: stableId("ep-xyz", item.eid ?? audioUrl),
        subId,
        externalId: item.eid ?? audioUrl,
        platform: "xiaoyuzhou",
        channel,
        title: item.title,
        description: cleanHtmlDescription(item.shownotes ?? item.description),
        coverUrl: item.image?.picUrl ?? subCover,
        date: formatRelativeDate(item.pubDate),
        durationSec: parseDurationToSeconds(item.duration) || 1800,
        positionSec: 0,
        mediaType: "audio",
        language: detectLanguageFromText(`${channel} ${item.title}`),
        hasOfficialSub: false,
        isBilingual: false,
        hasAiGuide: false,
        isOffline: false,
        gradient: "linear-gradient(135deg, #0369a1 0%, #0284c7 55%, #0c4a6e 100%)",
        coverKicker: "小宇宙",
        coverLabel: channel.slice(0, 6),
        pageUrl: item.eid
          ? `https://www.xiaoyuzhoufm.com/episode/${item.eid}`
          : url,
        audioUrl,
        transcript: [],
        guide: null,
        chat: [],
      });
    }

    return { subscription, episodes };
  }

  throw new Error("无法识别该小宇宙链接格式");
}
