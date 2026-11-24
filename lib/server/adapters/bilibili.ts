import crypto from "node:crypto";
import path from "node:path";
import QRCode from "qrcode";
import type {
  Episode,
  Subscription,
  TranscriptSegment,
} from "@/components/arbok/types";
import { runIsolatedSubprocess } from "../asr";
import { resolveBinary } from "../env";
import { getSecret, setSecret } from "../keychain";
import { detectLanguageFromText, formatRelativeDate } from "./podcast";

const BILI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function getBiliHeaders(): Record<string, string> {
  const cookie = getSecret("auth:bilibili");
  const headers: Record<string, string> = {
    "User-Agent": BILI_UA,
    Referer: "https://www.bilibili.com/",
    Origin: "https://www.bilibili.com",
  };
  if (cookie) {
    headers.Cookie = cookie.includes("SESSDATA=") ? cookie : `SESSDATA=${cookie}`;
  }
  return headers;
}

export async function generateBilibiliQr(fetchImpl: typeof fetch = fetch): Promise<{
  qrcodeKey: string;
  url: string;
  qrSvg: string;
}> {
  const res = await fetchImpl(
    "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
    { headers: { "User-Agent": BILI_UA, Referer: "https://www.bilibili.com/" } }
  );
  if (!res.ok) {
    throw new Error(`获取 B站二维码失败 (${res.status})`);
  }
  const data = (await res.json()) as {
    code: number;
    message?: string;
    data?: { url: string; qrcode_key: string };
  };
  if (data.code !== 0 || !data.data?.url || !data.data?.qrcode_key) {
    throw new Error(data.message ?? "B站二维码接口返回异常");
  }
  const qrSvg = await QRCode.toString(data.data.url, {
    type: "svg",
    margin: 1,
    width: 148,
  });
  return {
    qrcodeKey: data.data.qrcode_key,
    url: data.data.url,
    qrSvg,
  };
}

export async function pollBilibiliQr(
  qrcodeKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<{
  status: "waiting" | "scanned" | "expired" | "confirmed";
  message: string;
}> {
  const res = await fetchImpl(
    `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
    { headers: { "User-Agent": BILI_UA, Referer: "https://www.bilibili.com/" } }
  );
  if (!res.ok) {
    throw new Error(`轮询 B站扫码状态失败 (${res.status})`);
  }
  const payload = (await res.json()) as {
    code: number;
    data?: { code: number; message?: string; url?: string };
  };
  const innerCode = payload.data?.code;
  if (innerCode === 86101) {
    return { status: "waiting", message: "等待使用哔哩哔哩 App 扫码…" };
  }
  if (innerCode === 86090) {
    return { status: "scanned", message: "已扫码，请在手机端点击确认登录" };
  }
  if (innerCode === 86038) {
    return { status: "expired", message: "二维码已过期，请重新获取" };
  }
  if (innerCode === 0) {
    const cookieParts: string[] = [];
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    for (const raw of setCookies) {
      const kv = raw.split(";")[0]?.trim();
      if (kv && /^(SESSDATA|bili_jct|DedeUserID)=/.test(kv)) {
        cookieParts.push(kv);
      }
    }
    if (cookieParts.length === 0 && payload.data?.url) {
      const parsed = new URL(payload.data.url);
      for (const key of ["SESSDATA", "bili_jct", "DedeUserID"]) {
        const val = parsed.searchParams.get(key);
        if (val) cookieParts.push(`${key}=${val}`);
      }
    }
    if (cookieParts.length > 0) {
      setSecret("auth:bilibili", cookieParts.join("; "));
    }
    return { status: "confirmed", message: "B站扫码登录成功，凭证已写入 macOS Keychain" };
  }

  return {
    status: "waiting",
    message: payload.data?.message ?? "等待扫码确认…",
  };
}

export async function resolveBiliShortUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!/b23\.tv/i.test(url)) return url;
  const res = await fetchImpl(url, {
    redirect: "follow",
    headers: { "User-Agent": BILI_UA },
  });
  return res.url || url;
}

export function extractBvid(url: string): string | null {
  const m = url.match(/BV[0-9A-Za-z]{10}/);
  return m ? m[0] : null;
}

export function extractBiliSpaceMid(url: string): string | null {
  const spaceMatch = url.match(/space\.bilibili\.com\/(\d+)/i);
  if (spaceMatch) return spaceMatch[1];
  const mobileMatch = url.match(/m\.bilibili\.com\/space\/(\d+)/i);
  if (mobileMatch) return mobileMatch[1];
  const rsshubMatch = url.match(/bilibili\/user\/video\/(\d+)/i);
  if (rsshubMatch) return rsshubMatch[1];
  return null;
}

function normalizeHttpsUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("http://")) return raw.replace("http://", "https://");
  return raw;
}

export function parseBccSubtitles(raw: string): TranscriptSegment[] {
  const data = JSON.parse(raw) as {
    body?: Array<{ from: number; to: number; content: string }>;
  };
  return (data.body ?? [])
    .filter((item) => Boolean(item.content?.trim()))
    .map((item, idx) => ({
      id: idx + 1,
      start: Number(item.from.toFixed(2)),
      end: Number(item.to.toFixed(2)),
      orig: item.content.trim(),
    }));
}

export async function fetchBilibiliOfficialSubtitles(
  bvid: string,
  cid: number,
  fetchImpl: typeof fetch = fetch
): Promise<TranscriptSegment[]> {
  try {
    const res = await fetchImpl(
      `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`,
      { headers: getBiliHeaders() }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: {
        subtitle?: {
          subtitles?: Array<{ lan?: string; subtitle_url?: string }>;
        };
      };
    };
    const list = data.data?.subtitle?.subtitles ?? [];
    if (list.length === 0) return [];
    const preferred =
      list.find((s) => s.lan?.startsWith("zh")) ??
      list.find((s) => s.lan?.startsWith("ai-zh")) ??
      list[0];
    if (!preferred?.subtitle_url) return [];
    const subUrl = preferred.subtitle_url.startsWith("//")
      ? `https:${preferred.subtitle_url}`
      : preferred.subtitle_url;
    const subRes = await fetchImpl(subUrl, { headers: getBiliHeaders() });
    if (!subRes.ok) return [];
    return parseBccSubtitles(await subRes.text());
  } catch {
    return [];
  }
}

function qualityToBiliQn(quality?: string): { qn: number; fourk: number } {
  switch (quality) {
    case "4K":
      return { qn: 120, fourk: 1 };
    case "2K":
      return { qn: 116, fourk: 0 };
    case "720P":
      return { qn: 64, fourk: 0 };
    case "480P":
      return { qn: 32, fourk: 0 };
    default:
      return { qn: 80, fourk: 0 };
  }
}

export async function resolveBilibiliStream(
  pageUrl: string,
  options?: { fetchSubtitles?: boolean; quality?: string; fetchImpl?: typeof fetch }
): Promise<{
  bvid: string;
  cid?: number;
  title?: string;
  description?: string;
  channel?: string;
  coverUrl?: string;
  durationSec: number;
  pubdate?: number;
  videoUrl?: string;
  audioUrl?: string;
  transcript: TranscriptSegment[];
  streamExpiresAt: number;
}> {
  const doFetch = options?.fetchImpl ?? fetch;
  const expandedUrl = await resolveBiliShortUrl(pageUrl, doFetch);
  const bvid = extractBvid(expandedUrl);
  if (!bvid) {
    throw new Error("未在链接中识别到 B站 BV 号");
  }

  const viewRes = await doFetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    { headers: getBiliHeaders() }
  );
  if (!viewRes.ok) {
    throw new Error(`获取 B站视频详情失败 (${viewRes.status})`);
  }
  const viewJson = (await viewRes.json()) as {
    code: number;
    message?: string;
    data?: {
      bvid: string;
      cid: number;
      title: string;
      desc?: string;
      pic: string;
      duration: number;
      pubdate: number;
      owner?: { name?: string };
    };
  };
  if (viewJson.code !== 0 || !viewJson.data) {
    throw new Error(viewJson.message ?? "B站视频不存在或不可访问");
  }
  const v = viewJson.data;
  const coverUrl = v.pic?.startsWith("http://")
    ? v.pic.replace("http://", "https://")
    : v.pic;

  let videoUrl: string | undefined;
  let audioUrl: string | undefined;

  const { qn, fourk } = qualityToBiliQn(options?.quality);
  const mp4Res = await doFetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(v.bvid)}&cid=${v.cid}&qn=${qn}&fnval=1&fourk=${fourk}&platform=html5&high_quality=1`,
    { headers: getBiliHeaders() }
  );
  if (mp4Res.ok) {
    const mp4Json = (await mp4Res.json()) as {
      code: number;
      data?: { durl?: Array<{ url?: string }> };
    };
    videoUrl = mp4Json.data?.durl?.[0]?.url;
  }

  const dashRes = await doFetch(
    `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(v.bvid)}&cid=${v.cid}&qn=80&fnval=16`,
    { headers: getBiliHeaders() }
  );
  if (dashRes.ok) {
    const dashJson = (await dashRes.json()) as {
      code: number;
      data?: {
        dash?: {
          audio?: Array<{ baseUrl?: string; base_url?: string; bandwidth?: number }>;
        };
      };
    };
    const audios = (dashJson.data?.dash?.audio ?? []).sort(
      (a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0)
    );
    audioUrl = audios[0]?.baseUrl ?? audios[0]?.base_url ?? videoUrl;
  }

  if (!videoUrl && !audioUrl) {
    const home = process.env.HOME ?? "";
    const ytdlp = resolveBinary([
      path.join(home, ".local", "bin", "yt-dlp"),
      "/opt/homebrew/bin/yt-dlp",
      "yt-dlp",
    ]);
    if (ytdlp) {
      const { stdout } = await runIsolatedSubprocess(ytdlp, [
        "--dump-single-json",
        "--no-warnings",
        expandedUrl,
      ]);
      const info = JSON.parse(stdout) as {
        url?: string;
        formats?: Array<{ url?: string; vcodec?: string; acodec?: string }>;
      };
      videoUrl =
        info.formats?.find((f) => f.vcodec !== "none" && f.acodec !== "none")?.url ??
        info.url;
      audioUrl =
        info.formats?.find((f) => f.vcodec === "none" && f.acodec !== "none")?.url ??
        videoUrl;
    }
  }

  const transcript =
    options?.fetchSubtitles !== false
      ? await fetchBilibiliOfficialSubtitles(v.bvid, v.cid, doFetch)
      : [];

  return {
    bvid: v.bvid,
    cid: v.cid,
    title: v.title,
    description: v.desc?.trim() || undefined,
    channel: v.owner?.name ?? "B站 UP主",
    coverUrl,
    durationSec: v.duration || 300,
    pubdate: v.pubdate,
    videoUrl,
    audioUrl: audioUrl ?? videoUrl,
    transcript,
    streamExpiresAt: Date.now() + 90 * 60 * 1000,
  };
}

async function fetchBilibiliSpaceViaMediaList(
  mid: string,
  limit: number,
  doFetch: typeof fetch
): Promise<{
  channel: string;
  avatarUrl?: string;
  items: Array<{
    bvid: string;
    title: string;
    intro?: string;
    coverUrl?: string;
    durationSec: number;
    pubtime?: number;
  }>;
} | null> {
  const spaceReferer = `https://space.bilibili.com/${mid}`;
  const headers = {
    ...getBiliHeaders(),
    Referer: spaceReferer,
  };

  try {
    const res = await doFetch(
      `https://api.bilibili.com/x/v2/medialist/resource/list?type=1&biz_id=${encodeURIComponent(mid)}&ps=${Math.max(1, Math.min(20, limit))}`,
      { headers }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code: number;
      data?: {
        media_list?: Array<{
          bv_id?: string;
          bvid?: string;
          title?: string;
          intro?: string;
          cover?: string;
          duration?: number;
          pubtime?: number;
          upper?: { name?: string; face?: string };
        }>;
      };
    };
    if (json.code !== 0 || !Array.isArray(json.data?.media_list)) {
      return null;
    }

    const list = json.data.media_list;
    let channel = list.find((m) => m.upper?.name)?.upper?.name ?? "";
    let avatarUrl = normalizeHttpsUrl(
      list.find((m) => m.upper?.face)?.upper?.face
    );

    if (!channel || !avatarUrl) {
      try {
        const cardRes = await doFetch(
          `https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(mid)}`,
          { headers }
        );
        if (cardRes.ok) {
          const cardJson = (await cardRes.json()) as {
            code: number;
            data?: { card?: { name?: string; face?: string } };
          };
          if (cardJson.code === 0 && cardJson.data?.card) {
            channel = channel || cardJson.data.card.name || "";
            avatarUrl = avatarUrl || normalizeHttpsUrl(cardJson.data.card.face);
          }
        }
      } catch {
        // Optional profile card enrichment.
      }
    }

    const items = list
      .map((item) => {
        const bvid = item.bv_id || item.bvid || "";
        return {
          bvid,
          title: (item.title ?? "").trim(),
          intro: item.intro?.trim() || undefined,
          coverUrl: normalizeHttpsUrl(item.cover),
          durationSec: Math.round(item.duration ?? 600),
          pubtime: item.pubtime,
        };
      })
      .filter((item) => Boolean(item.bvid && item.title));

    if (items.length === 0) return null;
    return {
      channel: channel || `B站 UP主 ${mid}`,
      avatarUrl,
      items,
    };
  } catch {
    return null;
  }
}

export async function parseBilibiliUrl(
  url: string,
  options?: { limit?: number; fetchImpl?: typeof fetch }
): Promise<{ subscription?: Subscription; episodes: Episode[] }> {
  const doFetch = options?.fetchImpl ?? fetch;
  const expanded = await resolveBiliShortUrl(url, doFetch);
  const spaceMid = extractBiliSpaceMid(expanded);

  if (spaceMid) {
    const mid = spaceMid;
    const canonicalSpaceUrl = `https://space.bilibili.com/${mid}`;
    const limit = options?.limit ?? 12;
    const subId = `sub-bili-${mid}`;

    const mediaListResult = await fetchBilibiliSpaceViaMediaList(
      mid,
      limit,
      doFetch
    );
    if (mediaListResult && mediaListResult.items.length > 0) {
      const channel = mediaListResult.channel;
      const subscription: Subscription = {
        id: subId,
        name: channel,
        platform: "bilibili",
        sourceUrl: canonicalSpaceUrl,
        externalId: mid,
        coverUrl: mediaListResult.avatarUrl,
        gradient: "linear-gradient(135deg, #9d174d 0%, #db2777 55%, #4c1d95 100%)",
        shortLabel: channel.slice(0, 3),
      };

      const episodes: Episode[] = mediaListResult.items.map((item) => ({
        id: `ep-bili-${item.bvid}`,
        subId,
        externalId: item.bvid,
        platform: "bilibili",
        channel,
        title: item.title,
        description: item.intro,
        coverUrl: item.coverUrl,
        date: formatRelativeDate(item.pubtime),
        durationSec: item.durationSec > 0 ? item.durationSec : 600,
        positionSec: 0,
        mediaType: "video",
        language: detectLanguageFromText(item.title),
        hasOfficialSub: false,
        isBilingual: false,
        hasAiGuide: false,
        isOffline: false,
        gradient: "linear-gradient(135deg, #9d174d 0%, #db2777 55%, #4c1d95 100%)",
        coverKicker: "B站",
        coverLabel: channel.slice(0, 6),
        pageUrl: `https://www.bilibili.com/video/${item.bvid}`,
        transcript: [],
        guide: null,
        chat: [],
      }));

      return { subscription, episodes };
    }

    const home = process.env.HOME ?? "";
    const ytdlp = resolveBinary([
      path.join(home, ".local", "bin", "yt-dlp"),
      "/opt/homebrew/bin/yt-dlp",
      "yt-dlp",
    ]);
    if (!ytdlp) {
      throw new Error("解析 B站 UP 主主页失败，且本机未安装 yt-dlp 回退工具");
    }
    const ytdlpArgs = [
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      "--playlist-end",
      String(limit),
    ];
    const biliCookie = getSecret("auth:bilibili");
    if (biliCookie) {
      const cookieVal = biliCookie.includes("SESSDATA=")
        ? biliCookie
        : `SESSDATA=${biliCookie}`;
      ytdlpArgs.push("--add-header", `Cookie:${cookieVal}`);
    }
    ytdlpArgs.push(canonicalSpaceUrl);

    const { stdout } = await runIsolatedSubprocess(ytdlp, ytdlpArgs);
    const info = JSON.parse(stdout) as {
      uploader?: string;
      title?: string;
      entries?: Array<{
        id?: string;
        title?: string;
        duration?: number;
        thumbnail?: string;
        url?: string;
      }>;
    };
    const channel = info.uploader ?? info.title ?? `B站 UP主 ${mid}`;
    const subscription: Subscription = {
      id: subId,
      name: channel,
      platform: "bilibili",
      sourceUrl: canonicalSpaceUrl,
      externalId: mid,
      gradient: "linear-gradient(135deg, #9d174d 0%, #db2777 55%, #4c1d95 100%)",
      shortLabel: channel.slice(0, 3),
    };

    const episodes: Episode[] = (info.entries ?? [])
      .filter((e) => Boolean(e.id && e.title))
      .map((e) => ({
        id: `ep-bili-${e.id}`,
        subId,
        externalId: e.id,
        platform: "bilibili",
        channel,
        title: e.title!,
        coverUrl: normalizeHttpsUrl(e.thumbnail),
        date: "近期",
        durationSec: Math.round(e.duration ?? 600),
        positionSec: 0,
        mediaType: "video",
        language: detectLanguageFromText(e.title!),
        hasOfficialSub: false,
        isBilingual: false,
        hasAiGuide: false,
        isOffline: false,
        gradient: "linear-gradient(135deg, #9d174d 0%, #db2777 55%, #4c1d95 100%)",
        coverKicker: "B站",
        coverLabel: channel.slice(0, 6),
        pageUrl: e.url?.startsWith("http")
          ? e.url
          : `https://www.bilibili.com/video/${e.id}`,
        transcript: [],
        guide: null,
        chat: [],
      }));

    if (episodes.length === 0) {
      throw new Error("未从该 B站 UP 主主页解析到视频");
    }
    return { subscription, episodes };
  }

  const resolved = await resolveBilibiliStream(expanded, {
    fetchSubtitles: true,
    fetchImpl: doFetch,
  });

  const episode: Episode = {
    id: `ep-bili-${resolved.bvid || crypto.createHash("sha1").update(expanded).digest("hex").slice(0, 10)}`,
    subId: null,
    externalId: resolved.bvid,
    platform: "bilibili",
    channel: resolved.channel ?? "B站",
    title: resolved.title ?? "B站视频",
    description: resolved.description,
    coverUrl: resolved.coverUrl,
    date: formatRelativeDate(resolved.pubdate),
    durationSec: resolved.durationSec,
    positionSec: 0,
    mediaType: "video",
    language: detectLanguageFromText(resolved.title ?? "中文"),
    hasOfficialSub: resolved.transcript.length > 0,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: false,
    gradient: "linear-gradient(135deg, #9d174d 0%, #db2777 55%, #4c1d95 100%)",
    coverKicker: "B站",
    coverLabel: (resolved.channel ?? "B站").slice(0, 6),
    pageUrl: `https://www.bilibili.com/video/${resolved.bvid}`,
    audioUrl: resolved.audioUrl,
    videoUrl: resolved.videoUrl,
    streamExpiresAt: resolved.streamExpiresAt,
    transcript: resolved.transcript,
    guide: null,
    chat: [],
  };

  return { episodes: [episode] };
}
