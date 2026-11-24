import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Episode } from "@/components/arbok/types";
import { insertEpisode } from "./db";
import { resolveBinary } from "./env";
import { getLocalMediaDir } from "./storage";

export const SUPPORTED_LOCAL_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".wav",
  ".mp4",
  ".mov",
] as const;

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);

export function isSupportedLocalMediaFilename(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return (SUPPORTED_LOCAL_EXTENSIONS as readonly string[]).includes(ext);
}

export function probeLocalMediaMetadata(filePath: string): {
  durationSec: number;
  mediaType: "audio" | "video";
} {
  const ext = path.extname(filePath).toLowerCase();
  const fallbackMediaType: "audio" | "video" = VIDEO_EXTENSIONS.has(ext)
    ? "video"
    : "audio";

  const ffprobe = resolveBinary([
    "/opt/homebrew/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "ffprobe",
  ]);
  if (!ffprobe) {
    return { durationSec: 0, mediaType: fallbackMediaType };
  }

  try {
    const out = execFileSync(
      ffprobe,
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }
    );
    const parsed = JSON.parse(out) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string }>;
    };
    const durationNum = Number(parsed.format?.duration ?? 0);
    const hasVideo = Boolean(
      parsed.streams?.some((s) => s.codec_type === "video")
    );
    return {
      durationSec:
        Number.isFinite(durationNum) && durationNum > 0
          ? Math.round(durationNum)
          : 0,
      mediaType: hasVideo ? "video" : "audio",
    };
  } catch {
    return { durationSec: 0, mediaType: fallbackMediaType };
  }
}

export function importLocalMediaBuffer(options: {
  filename: string;
  buffer: Buffer;
  title?: string;
  language?: "en" | "zh";
}): Episode {
  const originalName = path.basename(options.filename || "").trim();
  if (!originalName || !isSupportedLocalMediaFilename(originalName)) {
    throw new Error(
      `暂不支持该文件格式，请导入 ${SUPPORTED_LOCAL_EXTENSIONS.join(" / ")} 文件`
    );
  }
  if (options.buffer.byteLength === 0) {
    throw new Error("上传的文件内容为空");
  }

  const ext = path.extname(originalName).toLowerCase();
  const stem = path.basename(originalName, ext).trim() || "本地音视频";
  const safeStem = stem
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const hash = crypto.randomBytes(4).toString("hex");
  const episodeId = `ep-local-${Date.now()}-${hash}`;

  const localDir = getLocalMediaDir();
  fs.mkdirSync(localDir, { recursive: true });
  const savedFilePath = path.join(
    localDir,
    `${episodeId}-${safeStem || "media"}${ext}`
  );
  fs.writeFileSync(savedFilePath, options.buffer);

  const probed = probeLocalMediaMetadata(savedFilePath);
  const displayTitle = options.title?.trim() || stem;
  const sizeMb = (options.buffer.byteLength / (1024 * 1024)).toFixed(1);

  const episode: Episode = {
    id: episodeId,
    subId: null,
    externalId: `local:${episodeId}`,
    platform: "local",
    channel: "本地文件",
    title: displayTitle,
    subtitle: `${ext.slice(1).toUpperCase()} · ${sizeMb} MB · 本地离线可用`,
    description: `已导入本地${probed.mediaType === "video" ? "视频" : "音频"}文件：${originalName}（${sizeMb} MB）。可直接播放、执行云端或本地离线 ASR 转写、双语翻译与 AI 导读。`,
    date: "刚刚导入",
    durationSec: probed.durationSec > 0 ? probed.durationSec : 180,
    positionSec: 0,
    mediaType: probed.mediaType,
    language: options.language ?? (/[\u4e00-\u9fff]/.test(displayTitle) ? "zh" : "en"),
    hasOfficialSub: false,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: true,
    gradient:
      probed.mediaType === "video"
        ? "linear-gradient(135deg, #0f766e, #0e7490)"
        : "linear-gradient(135deg, #115e59, #059669)",
    coverKicker: probed.mediaType === "video" ? "LOCAL VIDEO" : "LOCAL AUDIO",
    coverLabel: ext.slice(1).toUpperCase(),
    pageUrl: `local://${encodeURIComponent(originalName)}`,
    localFilePath: savedFilePath,
    transcript: [],
    guide: null,
    chat: [],
  };

  return insertEpisode(episode);
}
