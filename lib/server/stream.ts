import fs from "node:fs";
import path from "node:path";
import type { Episode } from "@/components/arbok/types";
import { resolveBilibiliStream } from "./adapters/bilibili";
import { resolveYouTubeStreamAndSubtitles } from "./adapters/youtube";
import { getEpisodeById, replaceEpisodeTranscript, updateEpisodeFields } from "./db";
import { getSecret } from "./keychain";
import { proxyFetch } from "./proxy";

const PROXY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function isDemoPlaceholderEpisode(ep: Episode): boolean {
  if (
    ep.audioUrl ||
    ep.videoUrl ||
    (ep.localFilePath && fs.existsSync(ep.localFilePath))
  ) {
    return false;
  }
  return (
    /arbok/i.test(ep.pageUrl) ||
    ep.pageUrl === "https://lexfridman.com/podcast/462"
  );
}

function serveLocalFileWithRange(
  filePath: string,
  rangeHeader: string | null
): Response {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".mp4"
      ? "video/mp4"
      : ext === ".mov"
        ? "video/quicktime"
        : ext === ".m4a"
          ? "audio/mp4"
          : ext === ".wav"
            ? "audio/wav"
            : ext === ".webm"
              ? "video/webm"
              : ext === ".ogg"
                ? "audio/ogg"
                : ext === ".flac"
                  ? "audio/flac"
                  : ext === ".aac"
                    ? "audio/aac"
                    : "audio/mpeg";

  if (rangeHeader && total > 0) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = Math.max(0, match[1] ? Number(match[1]) : 0);
      if (start >= total) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      const end = match[2]
        ? Math.min(total - 1, Number(match[2]))
        : Math.min(total - 1, start + 1024 * 1024 - 1);
      const length = Math.max(0, end - start + 1);
      const fd = fs.openSync(filePath, "r");
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, start);
      fs.closeSync(fd);
      return new Response(new Uint8Array(buf), {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(length),
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  const stream = fs.createReadStream(filePath);
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk) => {
        const bytes =
          typeof chunk === "string"
            ? Buffer.from(chunk)
            : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        controller.enqueue(bytes);
      });
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.destroy();
    },
  });

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(total),
      "Accept-Ranges": "bytes",
    },
  });
}

function upstreamHeadersForPlatform(
  platform: Episode["platform"],
  rangeHeader: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": PROXY_UA,
  };
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }
  if (platform === "bilibili") {
    headers.Referer = "https://www.bilibili.com/";
    headers.Origin = "https://www.bilibili.com";
    const cookie = getSecret("auth:bilibili");
    if (cookie) {
      headers.Cookie = cookie.includes("SESSDATA=") ? cookie : `SESSDATA=${cookie}`;
    }
  } else if (platform === "xiaoyuzhou") {
    headers.Referer = "https://www.xiaoyuzhoufm.com/";
  }
  return headers;
}

const resolvedQualityByEpisode = new Map<string, string>();

async function refreshEpisodeStreamUrls(
  ep: Episode,
  fetchImpl: typeof fetch,
  quality?: string
): Promise<{ audioUrl?: string; videoUrl?: string }> {
  if (ep.platform === "youtube") {
    const resolved = await resolveYouTubeStreamAndSubtitles(ep.pageUrl, {
      fetchSubtitles: ep.transcript.length === 0,
      quality,
      fetchImpl,
    });
    updateEpisodeFields(ep.id, {
      audioUrl: resolved.audioUrl,
      videoUrl: resolved.videoUrl,
      streamExpiresAt: resolved.streamExpiresAt,
      durationSec: resolved.durationSec || ep.durationSec,
    });
    if (quality) resolvedQualityByEpisode.set(ep.id, quality);
    if (ep.transcript.length === 0 && resolved.transcript.length > 0) {
      replaceEpisodeTranscript(ep.id, resolved.transcript);
    }
    return { audioUrl: resolved.audioUrl, videoUrl: resolved.videoUrl };
  }

  if (ep.platform === "bilibili") {
    const resolved = await resolveBilibiliStream(ep.pageUrl, {
      fetchSubtitles: ep.transcript.length === 0,
      quality,
      fetchImpl,
    });
    updateEpisodeFields(ep.id, {
      audioUrl: resolved.audioUrl,
      videoUrl: resolved.videoUrl,
      streamExpiresAt: resolved.streamExpiresAt,
      durationSec: resolved.durationSec || ep.durationSec,
    });
    if (quality) resolvedQualityByEpisode.set(ep.id, quality);
    if (ep.transcript.length === 0 && resolved.transcript.length > 0) {
      replaceEpisodeTranscript(ep.id, resolved.transcript);
    }
    return { audioUrl: resolved.audioUrl, videoUrl: resolved.videoUrl };
  }

  return { audioUrl: ep.audioUrl, videoUrl: ep.videoUrl };
}

function isVideoFilePath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return (
    ext === ".mp4" ||
    ext === ".mov" ||
    ext === ".webm" ||
    ext === ".mkv" ||
    ext === ".m4v"
  );
}

export async function proxyEpisodeMediaStream(
  episodeId: string,
  options: {
    mode: "audio" | "video";
    quality?: string;
    rangeHeader: string | null;
    fetchImpl?: typeof fetch;
  }
): Promise<Response> {
  const ep = getEpisodeById(episodeId);
  if (!ep) {
    return Response.json({ error: "未找到该单集" }, { status: 404 });
  }

  if (
    ep.localFilePath &&
    fs.existsSync(ep.localFilePath) &&
    (options.mode !== "video" || isVideoFilePath(ep.localFilePath))
  ) {
    return serveLocalFileWithRange(ep.localFilePath, options.rangeHeader);
  }

  if (isDemoPlaceholderEpisode(ep)) {
    return Response.json(
      {
        code: "DEMO_PLACEHOLDER",
        error:
          "该条目为内置演示占位数据（无真实音视频源），请导入真实播客、YouTube 或 B站链接播放",
      },
      { status: 422 }
    );
  }

  const doFetch = options.fetchImpl ?? proxyFetch;
  try {
    const expired =
      typeof ep.streamExpiresAt === "number" && ep.streamExpiresAt < Date.now();
    const qualityChanged =
      options.mode === "video" &&
      Boolean(options.quality) &&
      (ep.platform === "bilibili" || ep.platform === "youtube") &&
      resolvedQualityByEpisode.has(ep.id) &&
      resolvedQualityByEpisode.get(ep.id) !== options.quality;
    let targetUrl =
      options.mode === "video"
        ? ep.videoUrl ?? ep.audioUrl
        : ep.audioUrl ?? ep.videoUrl;

    if (!targetUrl || expired || qualityChanged) {
      const fresh = await refreshEpisodeStreamUrls(ep, doFetch, options.quality);
      targetUrl =
        options.mode === "video"
          ? fresh.videoUrl ?? fresh.audioUrl
          : fresh.audioUrl ?? fresh.videoUrl;
    } else if (options.quality && !resolvedQualityByEpisode.has(ep.id)) {
      resolvedQualityByEpisode.set(ep.id, options.quality);
    }

    if (!targetUrl) {
      return Response.json(
        { error: "未能获取该单集的有效媒体流地址，请检查代理或登录状态" },
        { status: 502 }
      );
    }

    let upstream = await doFetch(targetUrl, {
      headers: upstreamHeadersForPlatform(ep.platform, options.rangeHeader),
      redirect: "follow",
    });

    if (
      (upstream.status === 403 || upstream.status === 410) &&
      (ep.platform === "youtube" || ep.platform === "bilibili")
    ) {
      const fresh = await refreshEpisodeStreamUrls(ep, doFetch, options.quality);
      const retryUrl =
        options.mode === "video"
          ? fresh.videoUrl ?? fresh.audioUrl
          : fresh.audioUrl ?? fresh.videoUrl;
      if (retryUrl) {
        upstream = await doFetch(retryUrl, {
          headers: upstreamHeadersForPlatform(ep.platform, options.rangeHeader),
          redirect: "follow",
        });
      }
    }

    if (!upstream.ok && upstream.status !== 206) {
      return Response.json(
        { error: `上游媒体流返回 ${upstream.status}` },
        { status: 502 }
      );
    }

    const responseHeaders = new Headers();
    const passThrough = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ];
    for (const key of passThrough) {
      const val = upstream.headers.get(key);
      if (val) responseHeaders.set(key, val);
    }
    if (!responseHeaders.has("accept-ranges")) {
      responseHeaders.set("accept-ranges", "bytes");
    }
    if (!responseHeaders.has("content-type")) {
      responseHeaders.set(
        "content-type",
        options.mode === "video" ? "video/mp4" : "audio/mpeg"
      );
    }
    responseHeaders.set("Cache-Control", "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "代理媒体流失败，请稍后重试";
    return Response.json({ error: message }, { status: 502 });
  }
}
