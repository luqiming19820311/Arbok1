import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  AsrEngine,
  AsrJobState,
  CloudAsrProviderId,
  LocalModelDownloadState,
  TranscriptSegment,
} from "@/components/arbok/types";
import { getCloudAsrPreset } from "@/lib/arbok/providers";
import {
  getAppSettings,
  getAsrJob,
  getEpisodeById,
  listSubscriptions,
  replaceEpisodeTranscript,
  saveAsrJob,
  updateEpisodeFields,
} from "./db";
import { fetchPodcastOfficialTranscriptForEpisode } from "./adapters/podcast";
import {
  getAudioCacheDir,
  getModelsDir,
  listLocalAsrModels,
  resolveBinary,
} from "./env";
import { getSecret } from "./keychain";
import { proxyFetch } from "./proxy";

export interface AsrChunkCheckpoint {
  chunkFiles: string[];
  chunkDurationSec: number;
  completedSegments: Array<{
    chunkIndex: number;
    segments: Array<{ start: number; end: number; orig: string }>;
  }>;
}

const activeControllers = new Map<string, AbortController>();
const activeChildren = new Map<string, ChildProcess>();
const modelDownloadStates = new Map<string, LocalModelDownloadState>();
const activeModelDownloadPromises = new Map<
  string,
  Promise<{ modelId: string; localPath: string; bytes: number }>
>();

export function parseSrtTimestamp(ts: string): number {
  const match = ts
    .trim()
    .match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!match) return 0;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const ms = Number(match[4].padEnd(3, "0"));
  return Number((h * 3600 + m * 60 + s + ms / 1000).toFixed(2));
}

export function parseSrtOrVtt(
  content: string
): Array<{ start: number; end: number; orig: string }> {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .replace(/^WEBVTT[^\n]*\n+/, "")
    .trim()
    .split(/\n{2,}/);

  const segments: Array<{ start: number; end: number; orig: string }> = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue;
    const [rawStart, rawEnd] = lines[timeIdx].split("-->");
    const text = lines
      .slice(timeIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    segments.push({
      start: parseSrtTimestamp(rawStart),
      end: parseSrtTimestamp(rawEnd),
      orig: text,
    });
  }
  return segments;
}

export function parseWhisperJson(
  rawJson: string
): Array<{ start: number; end: number; orig: string }> {
  const parsed = JSON.parse(rawJson) as {
    transcription?: Array<{
      offsets?: { from: number; to: number };
      text?: string;
    }>;
    segments?: Array<{ start: number; end: number; text?: string }>;
  };

  if (Array.isArray(parsed.transcription)) {
    return parsed.transcription
      .map((item) => ({
        start: Number(((item.offsets?.from ?? 0) / 1000).toFixed(2)),
        end: Number(((item.offsets?.to ?? 0) / 1000).toFixed(2)),
        orig: (item.text ?? "").trim(),
      }))
      .filter((s) => s.orig.length > 0);
  }

  if (Array.isArray(parsed.segments)) {
    return parsed.segments
      .map((item) => ({
        start: Number((item.start ?? 0).toFixed(2)),
        end: Number((item.end ?? 0).toFixed(2)),
        orig: (item.text ?? "").trim(),
      }))
      .filter((s) => s.orig.length > 0);
  }

  return [];
}

export async function runIsolatedSubprocess(
  command: string,
  args: string[],
  options?: {
    episodeId?: string;
    signal?: AbortSignal;
    onProgress?: (percent: number, line: string) => void;
    cwd?: string;
  }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (options?.episodeId) {
      activeChildren.set(options.episodeId, child);
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const cleanup = () => {
      if (options?.episodeId && activeChildren.get(options.episodeId) === child) {
        activeChildren.delete(options.episodeId);
      }
      options?.signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };
    options?.signal?.addEventListener("abort", onAbort);

    const inspectProgress = (chunk: string) => {
      const pctMatch = chunk.match(/(\d{1,3})%/);
      if (pctMatch && options?.onProgress) {
        options.onProgress(Math.min(99, Number(pctMatch[1])), chunk.trim());
      }
    };

    child.stdout?.on("data", (buf: Buffer) => {
      const text = buf.toString("utf8");
      stdout += text;
      inspectProgress(text);
    });

    child.stderr?.on("data", (buf: Buffer) => {
      const text = buf.toString("utf8");
      stderr += text;
      inspectProgress(text);
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`ASR 子进程启动失败（${command}）：${err.message}`));
    });

    child.on("close", (code, sig) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (options?.signal?.aborted) {
        reject(new Error("ASR 任务已被用户取消"));
        return;
      }
      if (sig) {
        reject(
          new Error(`ASR 子进程异常中断（信号 ${sig}），主程序未受影响，可直接重试`)
        );
        return;
      }
      if (code !== 0) {
        reject(
          new Error(
            `ASR 子进程退出码 ${code}：${stderr.trim().slice(-240) || "未知错误"}`
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function transcribeChunkWithCloudApi(
  chunkPath: string,
  options: {
    provider: CloudAsrProviderId;
    model?: string;
    apiKey: string;
    language?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  }
): Promise<Array<{ start: number; end: number; orig: string }>> {
  const preset = getCloudAsrPreset(options.provider);
  const doFetch = options.fetchImpl ?? fetch;
  const audioBytes = fs.readFileSync(chunkPath);
  const ext = path.extname(chunkPath).slice(1) || "mp3";
  const mime = ext === "wav" ? "audio/wav" : ext === "m4a" ? "audio/mp4" : "audio/mpeg";

  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBytes], { type: mime }),
    path.basename(chunkPath)
  );
  form.append("model", options.model || preset.defaultModel);
  form.append("response_format", "verbose_json");
  if (options.language) {
    form.append("language", options.language);
  }

  const res = await doFetch(preset.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: form,
    signal: options.signal,
  });

  if (!res.ok) {
    throw new Error(
      `云端 ASR (${preset.label}) 请求失败 (${res.status})：${(await res.text()).slice(0, 220)}`
    );
  }

  const data = (await res.json()) as {
    text?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  if (Array.isArray(data.segments) && data.segments.length > 0) {
    return data.segments
      .map((s) => ({
        start: Number(s.start.toFixed(2)),
        end: Number(s.end.toFixed(2)),
        orig: s.text.trim(),
      }))
      .filter((s) => s.orig.length > 0);
  }

  const fallbackText = data.text?.trim();
  if (!fallbackText) return [];
  return [{ start: 0, end: 15, orig: fallbackText }];
}

export async function transcribeChunksWithCheckpoint(
  episodeId: string,
  chunkFiles: string[],
  options: {
    chunkDurationSec: number;
    provider: CloudAsrProviderId;
    model?: string;
    apiKey: string;
    language?: string;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    ignoreCheckpoint?: boolean;
    onProgress?: (state: AsrJobState) => void;
  }
): Promise<TranscriptSegment[]> {
  const existing = options.ignoreCheckpoint ? null : getAsrJob(episodeId);
  const existingCkpt = existing?.checkpoint as AsrChunkCheckpoint | undefined;
  const completedMap = new Map<
    number,
    Array<{ start: number; end: number; orig: string }>
  >();

  if (existingCkpt?.completedSegments) {
    for (const entry of existingCkpt.completedSegments) {
      completedMap.set(entry.chunkIndex, entry.segments);
    }
  }

  const persistCheckpoint = (
    status: AsrJobState["status"],
    message: string,
    error?: string
  ) => {
    const completedChunks = completedMap.size;
    const progress =
      chunkFiles.length > 0
        ? Math.min(99, Math.round((completedChunks / chunkFiles.length) * 100))
        : 0;
    const job: AsrJobState & { checkpoint: AsrChunkCheckpoint } = {
      episodeId,
      engine: "cloud",
      provider: options.provider,
      status,
      progress: status === "completed" ? 100 : progress,
      message,
      completedChunks,
      totalChunks: chunkFiles.length,
      error,
      updatedAt: Date.now(),
      checkpoint: {
        chunkFiles,
        chunkDurationSec: options.chunkDurationSec,
        completedSegments: [...completedMap.entries()].map(
          ([chunkIndex, segments]) => ({ chunkIndex, segments })
        ),
      },
    };
    saveAsrJob(job);
    options.onProgress?.(job);
  };

  for (let idx = 0; idx < chunkFiles.length; idx++) {
    if (options.signal?.aborted) {
      persistCheckpoint("cancelled", "已取消云端转写");
      throw new Error("ASR 任务已被用户取消");
    }
    if (completedMap.has(idx)) {
      continue;
    }

    persistCheckpoint(
      "transcribing",
      `正在转写第 ${idx + 1}/${chunkFiles.length} 段音频…`
    );

    try {
      const rawSegs = await transcribeChunkWithCloudApi(chunkFiles[idx], options);
      const offset = idx * options.chunkDurationSec;
      const adjusted = rawSegs.map((seg) => ({
        start: Number((seg.start + offset).toFixed(2)),
        end: Number((seg.end + offset).toFixed(2)),
        orig: seg.orig,
      }));
      completedMap.set(idx, adjusted);
      persistCheckpoint(
        "transcribing",
        `已完成 ${completedMap.size}/${chunkFiles.length} 段转写`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "云端转写失败";
      persistCheckpoint("failed", "部分分片转写失败，支持从断点重试", msg);
      throw err;
    }
  }

  const merged = [...completedMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, segs]) => segs);

  const saved = replaceEpisodeTranscript(episodeId, merged);
  persistCheckpoint("completed", `转写完成，共生成 ${saved.length} 条字幕`);
  return saved;
}

function inferAudioExtension(url: string, contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("wav")) return "wav";
  if (ct.includes("mp4") || ct.includes("m4a") || ct.includes("aac")) return "m4a";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("flac")) return "flac";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const m = pathname.match(/\.(mp3|m4a|wav|ogg|flac|aac)(?:$|\?)/);
    if (m) return m[1] === "aac" ? "m4a" : m[1];
  } catch {
    // Fallback to mp3.
  }
  return "mp3";
}

export async function downloadDirectAudioFile(
  audioUrl: string,
  cacheDir: string,
  signal: AbortSignal,
  onStatus: (msg: string, progress: number) => void,
  fetchImpl: typeof fetch = proxyFetch
): Promise<string> {
  onStatus("正在直连下载播客音频…", 6);
  const res = await fetchImpl(audioUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    redirect: "follow",
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`音频直链下载失败 (${res.status})：${audioUrl}`);
  }

  const ext = inferAudioExtension(res.url || audioUrl, res.headers.get("content-type"));
  const finalPath = path.join(cacheDir, `source.${ext}`);
  const tempPath = `${finalPath}.part`;
  const totalBytes = Number(res.headers.get("content-length") ?? "0");

  const writer = fs.createWriteStream(tempPath);
  const reader = res.body.getReader();
  let downloadedBytes = 0;
  let lastEmitAt = 0;

  try {
    while (true) {
      if (signal.aborted) {
        throw new Error("ASR 任务已被用户取消");
      }
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        writer.write(Buffer.from(value));
        downloadedBytes += value.byteLength;
        const now = Date.now();
        if (now - lastEmitAt >= 300) {
          lastEmitAt = now;
          const mbDone = (downloadedBytes / (1024 * 1024)).toFixed(1);
          if (totalBytes > 0) {
            const pct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
            const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
            onStatus(
              `正在下载播客音频… ${pct}%（${mbDone} / ${mbTotal} MB）`,
              Math.max(6, Math.min(22, Math.round(6 + pct * 0.16)))
            );
          } else {
            onStatus(`正在下载播客音频… 已下载 ${mbDone} MB`, 14);
          }
        }
      }
    }
    await new Promise<void>((resolve, reject) => {
      writer.end((err?: Error | null) => (err ? reject(err) : resolve()));
    });
    if (downloadedBytes < 1024) {
      throw new Error("下载到的音频文件为空或已损坏");
    }
    fs.renameSync(tempPath, finalPath);
    return finalPath;
  } catch (err) {
    writer.destroy();
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
    throw err;
  }
}

async function ensureEpisodeAudioFile(
  episodeId: string,
  pageUrl: string,
  audioUrl: string | undefined,
  localFilePath: string | undefined,
  signal: AbortSignal,
  onStatus: (msg: string, progress: number) => void,
  fetchImpl: typeof fetch = proxyFetch
): Promise<string> {
  if (localFilePath && fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 1024) {
    return localFilePath;
  }

  const cacheDir = path.join(getAudioCacheDir(), episodeId);
  fs.mkdirSync(cacheDir, { recursive: true });
  const existingAudio = fs
    .readdirSync(cacheDir)
    .find(
      (f) =>
        /\.(wav|mp3|m4a|ogg|flac)$/i.test(f) &&
        !f.startsWith("chunk_") &&
        !f.endsWith(".part") &&
        fs.statSync(path.join(cacheDir, f)).size > 1024
    );
  if (existingAudio) {
    return path.join(cacheDir, existingAudio);
  }

  if (audioUrl && /^https?:\/\//i.test(audioUrl)) {
    return downloadDirectAudioFile(
      audioUrl,
      cacheDir,
      signal,
      onStatus,
      fetchImpl
    );
  }

  const home = process.env.HOME ?? "";
  const ytdlp = resolveBinary([
    path.join(home, ".local", "bin", "yt-dlp"),
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "yt-dlp",
  ]);
  if (!ytdlp) {
    throw new Error("未检测到 yt-dlp，请先安装（brew install yt-dlp）或指定本地音频路径");
  }

  onStatus("正在通过 yt-dlp 拉取单集音频…", 12);
  const outTemplate = path.join(cacheDir, "source.%(ext)s");
  const args = ["-x", "--audio-format", "mp3", "--no-playlist", "-o", outTemplate];

  const settings = getAppSettings();
  if (settings.proxyMode === "custom" && settings.proxyUrl) {
    args.push("--proxy", settings.proxyUrl);
  }
  args.push(pageUrl);

  await runIsolatedSubprocess(ytdlp, args, { episodeId, signal });

  const downloaded = fs
    .readdirSync(cacheDir)
    .find((f) => f.startsWith("source.") && !f.endsWith(".part"));
  if (!downloaded) {
    throw new Error("音频下载完成但未找到输出文件");
  }
  const fullPath = path.join(cacheDir, downloaded);
  return fullPath;
}

async function splitAudioForCloud(
  episodeId: string,
  audioPath: string,
  chunkDurationSec: number,
  signal: AbortSignal
): Promise<string[]> {
  const stat = fs.statSync(audioPath);
  if (stat.size <= 18 * 1024 * 1024) {
    return [audioPath];
  }

  const ffmpeg = resolveBinary([
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ]);
  if (!ffmpeg) {
    return [audioPath];
  }

  const chunkDir = path.join(getAudioCacheDir(), episodeId, "chunks");
  fs.mkdirSync(chunkDir, { recursive: true });
  const existingChunks = fs
    .readdirSync(chunkDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort()
    .map((f) => path.join(chunkDir, f));
  if (existingChunks.length > 0) {
    return existingChunks;
  }

  const pattern = path.join(chunkDir, "chunk_%03d.mp3");
  await runIsolatedSubprocess(
    ffmpeg,
    [
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkDurationSec),
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      pattern,
    ],
    { episodeId, signal }
  );

  return fs
    .readdirSync(chunkDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort()
    .map((f) => path.join(chunkDir, f));
}

const LOCAL_WHISPER_CHUNK_SEC = 180;

async function splitAudioForLocalWhisper(
  episodeId: string,
  audioPath: string,
  chunkDurationSec: number,
  signal: AbortSignal
): Promise<string[]> {
  const ffmpeg = resolveBinary([
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ]);
  if (!ffmpeg) {
    return [audioPath];
  }

  const chunkDir = path.join(getAudioCacheDir(), episodeId, "local_chunks");
  fs.mkdirSync(chunkDir, { recursive: true });
  const existingChunks = fs
    .readdirSync(chunkDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".wav"))
    .sort()
    .map((f) => path.join(chunkDir, f));
  if (existingChunks.length > 0) {
    return existingChunks;
  }

  const pattern = path.join(chunkDir, "chunk_%03d.wav");
  await runIsolatedSubprocess(
    ffmpeg,
    [
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkDurationSec),
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      pattern,
    ],
    { episodeId, signal }
  );

  const created = fs
    .readdirSync(chunkDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".wav"))
    .sort()
    .map((f) => path.join(chunkDir, f));

  return created.length > 0 ? created : [audioPath];
}

function resolveWhisperCompatibleModel(explicitModelPath?: string): {
  modelPath: string;
  providerLabel: string;
  fallbackNotice?: string;
} {
  if (explicitModelPath && fs.existsSync(explicitModelPath)) {
    return { modelPath: explicitModelPath, providerLabel: "whisper.cpp" };
  }
  const models = listLocalAsrModels();
  const settings = getAppSettings();
  const preferred = models.find((m) => m.id === settings.localAsrModelId);

  if (preferred?.installed && preferred.engine === "whisper.cpp" && preferred.localPath) {
    return { modelPath: preferred.localPath, providerLabel: preferred.name };
  }

  const whisperInstalled = models.filter(
    (m) => m.engine === "whisper.cpp" && m.installed && Boolean(m.localPath)
  );
  if (whisperInstalled.length > 0) {
    const chosen = whisperInstalled[0];
    const fallbackNotice =
      preferred?.engine === "qwen3-asr"
        ? `本机未安装 qwen3-asr 运行程序，已自动切换 ${chosen.name}（whisper.cpp）`
        : undefined;
    return {
      modelPath: chosen.localPath!,
      providerLabel: chosen.name,
      fallbackNotice,
    };
  }

  if (preferred?.engine === "qwen3-asr") {
    throw new Error(
      "本机尚未安装 qwen3-asr 识别程序；请在「偏好设置 → 语音转写 (ASR)」中下载任意 Whisper 模型（如 Whisper large-v3-turbo 或 Whisper small），或切换云端 ASR。"
    );
  }
  throw new Error("尚未下载本地 Whisper 模型，请在「偏好设置 → 语音转写 (ASR)」中先下载模型");
}

export async function runLocalWhisperJob(
  episodeId: string,
  audioPath: string,
  options?: {
    modelPath?: string;
    language?: string;
    binaryOverride?: string;
    binaryArgsOverride?: string[];
    signal?: AbortSignal;
    ignoreCheckpoint?: boolean;
    onProgress?: (state: AsrJobState) => void;
  }
): Promise<TranscriptSegment[]> {
  const whisperBin =
    options?.binaryOverride ??
    resolveBinary([
      "/opt/homebrew/bin/whisper-cli",
      "/usr/local/bin/whisper-cli",
      "whisper-cli",
      "whisper-cpp",
    ]);

  if (!whisperBin) {
    throw new Error("未检测到 whisper-cli，请执行 brew install whisper-cpp 安装本地引擎");
  }

  let resolvedModel: {
    modelPath: string;
    providerLabel: string;
    fallbackNotice?: string;
  } = { modelPath: "", providerLabel: "whisper.cpp" };

  if (!options?.binaryArgsOverride) {
    resolvedModel = resolveWhisperCompatibleModel(options?.modelPath);
  }

  const outDir = path.join(getAudioCacheDir(), episodeId);
  fs.mkdirSync(outDir, { recursive: true });

  // Direct single-run mode for custom args overrides (used by unit tests).
  if (options?.binaryArgsOverride) {
    const outPrefix = path.join(outDir, "local_asr_output");
    const updateJob = (
      status: AsrJobState["status"],
      progress: number,
      message: string,
      error?: string
    ) => {
      const state: AsrJobState = {
        episodeId,
        engine: "local",
        provider: resolvedModel.providerLabel,
        status,
        progress,
        message,
        completedChunks: status === "completed" ? 1 : 0,
        totalChunks: 1,
        error,
        updatedAt: Date.now(),
      };
      saveAsrJob(state);
      options?.onProgress?.(state);
    };

    updateJob("transcribing", 15, "正在独立子进程中执行本地离线 ASR 转写…");
    try {
      const { stdout } = await runIsolatedSubprocess(
        whisperBin,
        options.binaryArgsOverride,
        {
          episodeId,
          signal: options.signal,
          onProgress: (pct) => {
            updateJob("transcribing", Math.max(15, pct), `本地离线转写进度 ${pct}%`);
          },
        }
      );

      const jsonFile = `${outPrefix}.json`;
      let rawSegments: Array<{ start: number; end: number; orig: string }> = [];
      if (fs.existsSync(jsonFile)) {
        rawSegments = parseWhisperJson(fs.readFileSync(jsonFile, "utf8"));
      } else if (stdout.trim().startsWith("{")) {
        rawSegments = parseWhisperJson(stdout);
      } else if (stdout.includes("-->")) {
        rawSegments = parseSrtOrVtt(stdout);
      }
      if (rawSegments.length === 0) {
        throw new Error("本地 ASR 运行结束但未解析到有效字幕段");
      }
      const saved = replaceEpisodeTranscript(episodeId, rawSegments);
      updateJob("completed", 100, `本地离线转写完成，共生成 ${saved.length} 条字幕`);
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : "本地 ASR 子进程失败";
      const cancelled = options.signal?.aborted;
      updateJob(
        cancelled ? "cancelled" : "failed",
        0,
        cancelled ? "已取消本地离线转写" : "本地离线转写失败（主程序安全运行）",
        cancelled ? undefined : message
      );
      throw err;
    }
  }

  // SubCast-style chunked progressive local transcription with checkpoint & live updates.
  const existing = options?.ignoreCheckpoint ? null : getAsrJob(episodeId);
  const existingCkpt =
    existing?.engine === "local"
      ? (existing.checkpoint as AsrChunkCheckpoint | undefined)
      : undefined;

  const saveLocalState = (
    status: AsrJobState["status"],
    progress: number,
    message: string,
    completedChunks: number,
    totalChunks: number,
    checkpoint?: AsrChunkCheckpoint,
    error?: string
  ) => {
    const state: AsrJobState & { checkpoint?: AsrChunkCheckpoint } = {
      episodeId,
      engine: "local",
      provider: resolvedModel.providerLabel,
      status,
      progress,
      message,
      completedChunks,
      totalChunks,
      error,
      updatedAt: Date.now(),
      checkpoint,
    };
    saveAsrJob(state);
    options?.onProgress?.(state);
  };

  saveLocalState(
    "splitting",
    22,
    resolvedModel.fallbackNotice
      ? `${resolvedModel.fallbackNotice}，正在切分 16kHz 音频分片…`
      : "正在将音频切分为 3 分钟分片（支持边转边看字幕）…",
    0,
    1
  );

  const chunks = await splitAudioForLocalWhisper(
    episodeId,
    audioPath,
    LOCAL_WHISPER_CHUNK_SEC,
    options?.signal ?? new AbortController().signal
  );

  const completedMap = new Map<
    number,
    Array<{ start: number; end: number; orig: string }>
  >();
  if (
    existingCkpt?.chunkDurationSec === LOCAL_WHISPER_CHUNK_SEC &&
    existingCkpt.chunkFiles.length === chunks.length
  ) {
    for (const entry of existingCkpt.completedSegments) {
      completedMap.set(entry.chunkIndex, entry.segments);
    }
  }

  const buildCheckpoint = (): AsrChunkCheckpoint => ({
    chunkFiles: chunks,
    chunkDurationSec: LOCAL_WHISPER_CHUNK_SEC,
    completedSegments: [...completedMap.entries()].map(
      ([chunkIndex, segments]) => ({ chunkIndex, segments })
    ),
  });

  const flushMergedTranscript = (): TranscriptSegment[] => {
    const merged = [...completedMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .flatMap(([, segs]) => segs);
    if (merged.length === 0) return [];
    return replaceEpisodeTranscript(episodeId, merged);
  };

  try {
    for (let idx = 0; idx < chunks.length; idx++) {
      if (options?.signal?.aborted) {
        saveLocalState(
          "cancelled",
          Math.round((completedMap.size / Math.max(1, chunks.length)) * 100),
          "已取消本地离线转写（已完成分片已保留）",
          completedMap.size,
          chunks.length,
          buildCheckpoint()
        );
        throw new Error("ASR 任务已被用户取消");
      }
      if (completedMap.has(idx)) {
        continue;
      }

      const basePct = 24 + Math.round((completedMap.size / chunks.length) * 74);
      const chunkNote =
        chunks.length > 1
          ? `正在本地转写第 ${idx + 1}/${chunks.length} 段（${resolvedModel.providerLabel}）…`
          : `正在本地转写（${resolvedModel.providerLabel}）…`;
      saveLocalState(
        "transcribing",
        Math.min(98, basePct),
        chunkNote,
        completedMap.size,
        chunks.length,
        buildCheckpoint()
      );

      const chunkOutPrefix = path.join(outDir, `local_chunk_${idx}`);
      const args = [
        "-m",
        resolvedModel.modelPath,
        "-f",
        chunks[idx],
        "-l",
        options?.language || "auto",
        "-oj",
        "-of",
        chunkOutPrefix,
        "--print-progress",
      ];

      const { stdout } = await runIsolatedSubprocess(whisperBin, args, {
        episodeId,
        signal: options?.signal,
        onProgress: (pct) => {
          const chunkSpan = 74 / Math.max(1, chunks.length);
          const overall = Math.min(
            99,
            Math.round(24 + completedMap.size * chunkSpan + (pct / 100) * chunkSpan)
          );
          saveLocalState(
            "transcribing",
            overall,
            chunks.length > 1
              ? `正在本地转写第 ${idx + 1}/${chunks.length} 段（本段 ${pct}%）`
              : `本地离线转写进度 ${pct}%`,
            completedMap.size,
            chunks.length,
            buildCheckpoint()
          );
        },
      });

      const jsonFile = `${chunkOutPrefix}.json`;
      let rawSegments: Array<{ start: number; end: number; orig: string }> = [];
      if (fs.existsSync(jsonFile)) {
        rawSegments = parseWhisperJson(fs.readFileSync(jsonFile, "utf8"));
      } else if (stdout.trim().startsWith("{")) {
        rawSegments = parseWhisperJson(stdout);
      } else if (stdout.includes("-->")) {
        rawSegments = parseSrtOrVtt(stdout);
      }

      const offset = chunks.length > 1 ? idx * LOCAL_WHISPER_CHUNK_SEC : 0;
      const adjusted = rawSegments.map((seg) => ({
        start: Number((seg.start + offset).toFixed(2)),
        end: Number((seg.end + offset).toFixed(2)),
        orig: seg.orig,
      }));
      completedMap.set(idx, adjusted);

      const savedSoFar = flushMergedTranscript();
      const donePct = Math.min(
        99,
        24 + Math.round((completedMap.size / chunks.length) * 75)
      );
      saveLocalState(
        "transcribing",
        donePct,
        chunks.length > 1
          ? `已完成 ${completedMap.size}/${chunks.length} 段，已生成 ${savedSoFar.length} 句字幕（可边听边看）`
          : `已生成 ${savedSoFar.length} 句字幕`,
        completedMap.size,
        chunks.length,
        buildCheckpoint()
      );
    }

    const finalSaved = flushMergedTranscript();
    if (finalSaved.length === 0) {
      throw new Error("本地 ASR 运行结束但未解析到有效字幕段");
    }

    saveLocalState(
      "completed",
      100,
      `本地离线转写完成，共生成 ${finalSaved.length} 条字幕`,
      chunks.length,
      chunks.length,
      buildCheckpoint()
    );
    return finalSaved;
  } catch (err) {
    const message = err instanceof Error ? err.message : "本地 ASR 子进程失败";
    const cancelled = options?.signal?.aborted;
    saveLocalState(
      cancelled ? "cancelled" : "failed",
      Math.round((completedMap.size / Math.max(1, chunks.length)) * 100),
      cancelled
        ? "已取消本地离线转写"
        : "本地离线转写失败（主程序安全运行，支持断点重试）",
      completedMap.size,
      chunks.length,
      buildCheckpoint(),
      cancelled ? undefined : message
    );
    throw err;
  }
}

export function startAsrJob(
  episodeId: string,
  options?: {
    engine?: AsrEngine;
    localAudioPath?: string;
    demoFallback?: boolean;
    force?: boolean;
  }
): AsrJobState {
  const ep = getEpisodeById(episodeId);
  if (!ep) {
    throw new Error(`未找到单集 ${episodeId}`);
  }

  cancelAsrJob(episodeId);

  const settings = getAppSettings();
  const engine = options?.engine ?? settings.asrEngine;
  const force = Boolean(options?.force);
  const providerLabel =
    engine === "cloud" ? settings.cloudAsrProvider : settings.localAsrModelId;

  const controller = new AbortController();
  activeControllers.set(episodeId, controller);

  const initial: AsrJobState = {
    episodeId,
    engine,
    provider: providerLabel,
    status: "downloading",
    progress: 5,
    message: force
      ? "准备从头重新生成字幕（跳过旧断点）…"
      : engine === "cloud"
        ? "准备云端 ASR 任务…"
        : "准备本地离线 ASR 子进程…",
    completedChunks: 0,
    totalChunks: 1,
    updatedAt: Date.now(),
  };
  saveAsrJob(initial);
  updateEpisodeFields(episodeId, { subtitleStatus: "transcribing" });

  void (async () => {
    try {
      const cloudKey = getSecret(`asr:${settings.cloudAsrProvider}`);
      const hasRealAudioSource =
        Boolean(options?.localAudioPath && fs.existsSync(options.localAudioPath)) ||
        Boolean(ep.localFilePath && fs.existsSync(ep.localFilePath)) ||
        Boolean(ep.audioUrl && /^https?:\/\//i.test(ep.audioUrl)) ||
        !/arbok/i.test(ep.pageUrl);

      if (engine === "cloud" && !cloudKey) {
        throw new Error(
          `尚未配置云端 ASR (${settings.cloudAsrProvider}) 的 API Key，请在「偏好设置 → 语音转写」中配置，或切换为本地离线引擎。`
        );
      }

      if (!hasRealAudioSource && options?.demoFallback) {
        throw new Error("当前为演示占位链接，请导入真实的播客/YouTube/B站链接或提供本地音频文件路径进行真实转写。");
      }

      if (!force && ep.platform === "podcast" && ep.subId && !options?.localAudioPath) {
        const sub = listSubscriptions().find((s) => s.id === ep.subId);
        if (sub?.sourceUrl) {
          saveAsrJob({
            ...initial,
            status: "downloading",
            progress: 4,
            message: "先检查播客 RSS 是否自带官方时间戳字幕…",
            updatedAt: Date.now(),
          });
          const official = await fetchPodcastOfficialTranscriptForEpisode(
            sub.sourceUrl,
            {
              externalId: ep.externalId,
              audioUrl: ep.audioUrl,
              title: ep.title,
            }
          );
          if (official.length > 0) {
            const saved = replaceEpisodeTranscript(episodeId, official);
            saveAsrJob({
              ...initial,
              status: "completed",
              progress: 100,
              completedChunks: 1,
              totalChunks: 1,
              message: `已获取播客 RSS 自带官方字幕，共 ${saved.length} 句`,
              updatedAt: Date.now(),
            });
            return;
          }
        }
      }

      const audioPath = await ensureEpisodeAudioFile(
        episodeId,
        ep.pageUrl,
        ep.audioUrl,
        options?.localAudioPath ?? ep.localFilePath,
        controller.signal,
        (msg, progress) => {
          saveAsrJob({
            ...initial,
            status: "downloading",
            progress,
            message: msg,
            updatedAt: Date.now(),
          });
        }
      );

      if (engine === "local") {
        await runLocalWhisperJob(episodeId, audioPath, {
          language: ep.language,
          signal: controller.signal,
          ignoreCheckpoint: force,
        });
      } else {
        saveAsrJob({
          ...initial,
          status: "splitting",
          progress: 25,
          message: "正在检查音频体积并切分片段…",
          updatedAt: Date.now(),
        });
        const chunks = await splitAudioForCloud(
          episodeId,
          audioPath,
          600,
          controller.signal
        );
        await transcribeChunksWithCheckpoint(episodeId, chunks, {
          chunkDurationSec: 600,
          provider: settings.cloudAsrProvider,
          model: settings.cloudAsrModel,
          apiKey: cloudKey!,
          language: ep.language,
          signal: controller.signal,
          ignoreCheckpoint: force,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ASR 转写失败";
      const existing = getAsrJob(episodeId);
      if (existing?.status !== "failed" && existing?.status !== "cancelled") {
        saveAsrJob({
          episodeId,
          engine,
          provider: providerLabel,
          status: controller.signal.aborted ? "cancelled" : "failed",
          progress: existing?.progress ?? 0,
          message: controller.signal.aborted ? "已取消转写" : "转写失败，可点击断点重试",
          completedChunks: existing?.completedChunks ?? 0,
          totalChunks: existing?.totalChunks ?? 1,
          error: controller.signal.aborted ? undefined : msg,
          updatedAt: Date.now(),
          checkpoint: existing?.checkpoint,
        });
      }
      updateEpisodeFields(episodeId, { subtitleStatus: "failed" });
    } finally {
      activeControllers.delete(episodeId);
    }
  })();

  return initial;
}

export function cancelAsrJob(episodeId: string): boolean {
  const controller = activeControllers.get(episodeId);
  const child = activeChildren.get(episodeId);
  if (!controller && !child) return false;
  controller?.abort();
  if (child && !child.killed) {
    child.kill("SIGTERM");
  }
  activeControllers.delete(episodeId);
  activeChildren.delete(episodeId);
  return true;
}

export function listLocalAsrDownloadStates(): Record<
  string,
  LocalModelDownloadState
> {
  const out: Record<string, LocalModelDownloadState> = {};
  for (const [id, state] of modelDownloadStates.entries()) {
    out[id] = state;
  }
  return out;
}

export function startLocalAsrModelDownload(
  modelId: string,
  fetchImpl?: typeof fetch
): LocalModelDownloadState {
  const existing = modelDownloadStates.get(modelId);
  if (existing && existing.status === "downloading") {
    return existing;
  }
  const model = listLocalAsrModels().find((m) => m.id === modelId);
  if (!model) {
    throw new Error(`未知的本地模型：${modelId}`);
  }
  const initial: LocalModelDownloadState = {
    modelId,
    status: "downloading",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    updatedAt: Date.now(),
  };
  modelDownloadStates.set(modelId, initial);
  void downloadLocalAsrModel(modelId, fetchImpl).catch(() => {});
  return initial;
}

export async function downloadLocalAsrModel(
  modelId: string,
  fetchImpl?: typeof fetch
): Promise<{ modelId: string; localPath: string; bytes: number }> {
  const inflight = activeModelDownloadPromises.get(modelId);
  if (inflight) return inflight;

  const task = (async () => {
    const model = listLocalAsrModels().find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`未知的本地模型：${modelId}`);
    }

    const dir = getModelsDir();
    fs.mkdirSync(dir, { recursive: true });
    const targetPath = path.join(/*turbopackIgnore: true*/ dir, model.filename);
    const partPath = `${targetPath}.part`;

    modelDownloadStates.set(modelId, {
      modelId,
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      updatedAt: Date.now(),
    });

    const doFetch = fetchImpl ?? proxyFetch;
    const candidateUrls = [model.downloadUrl];
    if (model.downloadUrl.startsWith("https://huggingface.co/")) {
      candidateUrls.push(
        model.downloadUrl.replace(
          "https://huggingface.co/",
          "https://hf-mirror.com/"
        )
      );
    }

    let res: Response | null = null;
    let lastError = "";
    for (const url of candidateUrls) {
      try {
        const attempt = await doFetch(url, {
          redirect: "follow",
          headers: {
            "User-Agent": "Arbok/1.0 (macOS)",
          },
        });
        if (attempt.ok && attempt.body) {
          res = attempt;
          break;
        }
        lastError = `模型下载失败 (${attempt.status})：${url}`;
      } catch (err) {
        lastError = `模型下载网络异常：${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (!res || !res.body) {
      const errMsg = lastError || `模型下载失败：${model.downloadUrl}`;
      modelDownloadStates.set(modelId, {
        modelId,
        status: "failed",
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        error: errMsg,
        updatedAt: Date.now(),
      });
      throw new Error(errMsg);
    }

    const totalBytes = Number(res.headers.get("content-length") || 0);
    modelDownloadStates.set(modelId, {
      modelId,
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes,
      updatedAt: Date.now(),
    });

    const reader = res.body.getReader();
    const writeStream = fs.createWriteStream(partPath);
    let bytes = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        const progress =
          totalBytes > 0
            ? Math.min(99, Math.round((bytes / totalBytes) * 100))
            : Math.min(95, Math.round((bytes / (100 * 1024 * 1024)) * 100));
        modelDownloadStates.set(modelId, {
          modelId,
          status: "downloading",
          progress,
          downloadedBytes: bytes,
          totalBytes,
          updatedAt: Date.now(),
        });
        if (!writeStream.write(Buffer.from(value))) {
          await new Promise<void>((resolve) =>
            writeStream.once("drain", resolve)
          );
        }
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on("error", reject);
      });
      if (bytes === 0) {
        throw new Error("模型下载完成但文件内容为空");
      }
      fs.renameSync(partPath, targetPath);
      modelDownloadStates.set(modelId, {
        modelId,
        status: "completed",
        progress: 100,
        downloadedBytes: bytes,
        totalBytes: totalBytes || bytes,
        updatedAt: Date.now(),
      });
      return { modelId, localPath: targetPath, bytes };
    } catch (err) {
      writeStream.destroy();
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      const errMsg = err instanceof Error ? err.message : "模型下载失败";
      modelDownloadStates.set(modelId, {
        modelId,
        status: "failed",
        progress: 0,
        downloadedBytes: bytes,
        totalBytes,
        error: errMsg,
        updatedAt: Date.now(),
      });
      throw err;
    } finally {
      activeModelDownloadPromises.delete(modelId);
    }
  })();

  activeModelDownloadPromises.set(modelId, task);
  return task;
}

export function deleteLocalAsrModel(modelId: string): boolean {
  modelDownloadStates.delete(modelId);
  const model = listLocalAsrModels().find((m) => m.id === modelId);
  if (!model?.localPath || !fs.existsSync(model.localPath)) return false;
  fs.unlinkSync(model.localPath);
  return true;
}
