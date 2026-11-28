// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  deleteLocalAsrModel,
  downloadDirectAudioFile,
  downloadLocalAsrModel,
  parseQwen3AsrOutput,
  parseSrtOrVtt,
  parseWhisperJson,
  resolveCloudAsrTranscriptionUrl,
  runLocalQwen3AsrJob,
  runLocalWhisperJob,
  splitQwen3TextToTimedSegments,
  transcribeChunksWithCheckpoint,
} from "./asr";
import { migrateLegacyCloudAsrSettings } from "@/lib/arbok/providers";
import { parseRssFeed } from "./adapters/podcast";
import { closeDbForTests, getAsrJob, getEpisodeById } from "./db";
import { listLocalAsrModels } from "./env";
import { resetMemoryKeychain } from "./keychain";

let tmpDir = "";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-asr-test-"));
  process.env.ARBOK_DB_PATH = path.join(tmpDir, "arbok.db");
  process.env.ARBOK_CACHE_DIR = path.join(tmpDir, "cache");
  process.env.ARBOK_MODELS_DIR = path.join(tmpDir, "models");
  process.env.ARBOK_KEYCHAIN_MODE = "memory";
  closeDbForTests();
  resetMemoryKeychain();
});

afterEach(() => {
  closeDbForTests();
  delete process.env.ARBOK_DB_PATH;
  delete process.env.ARBOK_CACHE_DIR;
  delete process.env.ARBOK_MODELS_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("parses SRT/VTT and whisper.cpp JSON formats with accurate timestamps", () => {
  const srt = `1
00:00:01,500 --> 00:00:04,250
Hello world

2
00:01:02,000 --> 00:01:05,500
Second line`;

  const parsedSrt = parseSrtOrVtt(srt);
  expect(parsedSrt).toEqual([
    { start: 1.5, end: 4.25, orig: "Hello world" },
    { start: 62, end: 65.5, orig: "Second line" },
  ]);

  const whisperJson = JSON.stringify({
    transcription: [
      { offsets: { from: 0, to: 1000 }, text: "♪ 音乐 ♪" },
      { offsets: { from: 1000, to: 1200 }, text: "[音乐]" },
      { offsets: { from: 1200, to: 4800 }, text: " 本地离线识别成功 " },
    ],
  });
  expect(parseWhisperJson(whisperJson)).toEqual([
    { start: 1.2, end: 4.8, orig: "本地离线识别成功" },
  ]);
});

test("cloud ASR checkpoints completed chunks, offsets timestamps, and resumes failed chunk without re-uploading completed ones", async () => {
  const chunk0 = path.join(tmpDir, "chunk_000.mp3");
  const chunk1 = path.join(tmpDir, "chunk_001.mp3");
  fs.writeFileSync(chunk0, Buffer.from("fake-mp3-0"));
  fs.writeFileSync(chunk1, Buffer.from("fake-mp3-1"));

  let callCount = 0;
  let shouldFailChunk1 = true;

  const mockFetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          segments: [{ start: 1.5, end: 6.0, text: "第一段开头内容" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (shouldFailChunk1) {
      return new Response("upstream timeout", { status: 503 });
    }
    return new Response(
      JSON.stringify({
        segments: [{ start: 2.0, end: 8.5, text: "第二段续传内容" }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  await expect(
    transcribeChunksWithCheckpoint("ep-bili-2", [chunk0, chunk1], {
      chunkDurationSec: 600,
      provider: "siliconflow",
      apiKey: "sf-test",
      fetchImpl: mockFetch,
    })
  ).rejects.toThrow(/503/);

  const failedJob = getAsrJob("ep-bili-2");
  expect(failedJob?.status).toBe("failed");
  expect(failedJob?.completedChunks).toBe(1);
  expect(callCount).toBe(2);

  shouldFailChunk1 = false;
  const segments = await transcribeChunksWithCheckpoint(
    "ep-bili-2",
    [chunk0, chunk1],
    {
      chunkDurationSec: 600,
      provider: "siliconflow",
      apiKey: "sf-test",
      fetchImpl: mockFetch,
    }
  );

  expect(callCount).toBe(3);
  expect(segments).toHaveLength(2);
  expect(segments[0].start).toBe(1.5);
  expect(segments[1].start).toBe(602);
  expect(segments[1].orig).toBe("第二段续传内容");
  expect(getEpisodeById("ep-bili-2")?.transcript).toHaveLength(2);
});

test("local ASR runs in isolated subprocess and main app survives subprocess SIGKILL crash", async () => {
  const fakeAudio = path.join(tmpDir, "offline.wav");
  fs.writeFileSync(fakeAudio, Buffer.from("RIFF"));

  const okScript = `
    console.error("whisper_print_progress_callback: progress = 50%");
    console.log(JSON.stringify({
      transcription: [
        { offsets: { from: 0, to: 3500 }, text: "离线 Metal 模型识别第一句" },
        { offsets: { from: 3500, to: 8000 }, text: "音频全程未离开本机" }
      ]
    }));
  `;

  const saved = await runLocalWhisperJob("ep-bili-2", fakeAudio, {
    binaryOverride: process.execPath,
    binaryArgsOverride: ["-e", okScript],
  });
  expect(saved).toHaveLength(2);
  expect(saved[0].orig).toBe("离线 Metal 模型识别第一句");
  expect(getAsrJob("ep-bili-2")?.status).toBe("completed");

  const crashScript = `process.kill(process.pid, "SIGKILL");`;
  await expect(
    runLocalWhisperJob("ep-bili-2", fakeAudio, {
      binaryOverride: process.execPath,
      binaryArgsOverride: ["-e", crashScript],
    })
  ).rejects.toThrow(/SIGKILL/);

  const crashedJob = getAsrJob("ep-bili-2");
  expect(crashedJob?.status).toBe("failed");
  expect(crashedJob?.error).toContain("SIGKILL");
});

test("local ASR model manager downloads atomically, lists installed state, and deletes cleanly", async () => {
  const mockFetch = (async () =>
    new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), {
      status: 200,
    })) as typeof fetch;

  const dl = await downloadLocalAsrModel("whisper-tiny", mockFetch);
  expect(dl.bytes).toBe(8);
  expect(fs.existsSync(dl.localPath)).toBe(true);

  const afterDownload = listLocalAsrModels().find((m) => m.id === "whisper-tiny");
  expect(afterDownload?.installed).toBe(true);

  expect(deleteLocalAsrModel("whisper-tiny")).toBe(true);
  const afterDelete = listLocalAsrModels().find((m) => m.id === "whisper-tiny");
  expect(afterDelete?.installed).toBe(false);
});

test("podcast RSS transcript picker prefers timestamped VTT over untimestamped TXT and direct HTTP audio download succeeds", async () => {
  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
    <channel>
      <title>Acquired Test</title>
      <item>
        <title>The Home Depot</title>
        <guid>ep-hd-1</guid>
        <link>https://www.acquired.fm/episodes/the-home-depot</link>
        <enclosure url="https://cdn.example.com/audio/home-depot.mp3" type="audio/mpeg" />
        <podcast:transcript url="https://cdn.example.com/hd.txt" type="text/plain" />
        <podcast:transcript url="https://cdn.example.com/hd.vtt" type="text/vtt" rel="captions" />
      </item>
    </channel>
  </rss>`;

  const vttBody = `WEBVTT

00:00:01.000 --> 00:00:04.500
Welcome to Acquired!

00:00:04.500 --> 00:00:09.000
Today we are covering The Home Depot.`;

  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/feed.xml")) {
      return new Response(rssXml, { status: 200 });
    }
    if (url.endsWith("/hd.vtt")) {
      return new Response(vttBody, { status: 200, headers: { "Content-Type": "text/vtt" } });
    }
    if (url.endsWith("/home-depot.mp3")) {
      return new Response(new Uint8Array(2048).fill(7), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg", "Content-Length": "2048" },
      });
    }
    return new Response("Untimestamped raw text", { status: 200 });
  }) as typeof fetch;

  const parsed = await parseRssFeed("https://cdn.example.com/feed.xml", {
    fetchImpl: mockFetch,
  });
  expect(parsed.episodes).toHaveLength(1);
  expect(parsed.episodes[0].hasOfficialSub).toBe(true);
  expect(parsed.episodes[0].transcript).toHaveLength(2);
  expect(parsed.episodes[0].transcript[0].orig).toBe("Welcome to Acquired!");

  const cacheDir = path.join(tmpDir, "direct-audio");
  fs.mkdirSync(cacheDir, { recursive: true });
  const audioFile = await downloadDirectAudioFile(
    "https://cdn.example.com/audio/home-depot.mp3",
    cacheDir,
    new AbortController().signal,
    () => {},
    mockFetch
  );
  expect(audioFile.endsWith("source.mp3")).toBe(true);
  expect(fs.statSync(audioFile).size).toBe(2048);

  // Verify Bilibili CDN download attaches Referer header to prevent 403
  let seenBiliReferer = "";
  const biliDir = path.join(tmpDir, "bili-audio");
  fs.mkdirSync(biliDir, { recursive: true });
  await downloadDirectAudioFile(
    "https://upos-sz-estgcos.bilivideo.com/upgcxcode/demo.m4s",
    biliDir,
    new AbortController().signal,
    () => {},
    (async (_url: string | URL | Request, init?: RequestInit) => {
      seenBiliReferer = new Headers(init?.headers).get("referer") ?? "";
      return new Response(new Uint8Array(2048).fill(3), {
        status: 200,
        headers: { "Content-Type": "audio/mp4" },
      });
    }) as typeof fetch
  );
  expect(seenBiliReferer).toBe("https://www.bilibili.com/");
});

test("Qwen3-ASR local engine parses llama-mtmd-cli output, splits timed segments, and runs locally without whisper fallback", async () => {
  const cleaned = parseQwen3AsrOutput(
    "language Chinese<asr_text>你好，这是本地语音转写测试。欢迎收听今天的科技播客！"
  );
  expect(cleaned).toBe("你好，这是本地语音转写测试。欢迎收听今天的科技播客！");

  const timed = splitQwen3TextToTimedSegments(cleaned, 25, 20);
  expect(timed.length).toBe(2);
  expect(timed[0].start).toBe(25);
  expect(timed[1].end).toBe(45);

  const modelPath = path.join(tmpDir, "models", "Qwen3-ASR-0.6B-Q8_0.gguf");
  const mmprojPath = path.join(tmpDir, "models", "mmproj-Qwen3-ASR-0.6B-Q8_0.gguf");
  fs.mkdirSync(path.dirname(modelPath), { recursive: true });
  fs.writeFileSync(modelPath, Buffer.from("GGUF-MODEL"));
  fs.writeFileSync(mmprojPath, Buffer.from("GGUF-MMPROJ"));

  const fakeWav = path.join(tmpDir, "chunk.wav");
  const dataBytes = 32000 * 2;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + dataBytes, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(dataBytes, 40);
  fs.writeFileSync(fakeWav, Buffer.concat([wavHeader, Buffer.alloc(dataBytes)]));

  const fakeMtmd = path.join(tmpDir, "fake-llama-mtmd-cli.mjs");
  fs.writeFileSync(
    fakeMtmd,
    `#!${process.execPath}\nconsole.log("language Chinese<asr_text>这是第一句足够长的本地离线语音识别测试结果。这是第二句同样带有中文标点的字幕验证。");\n`,
    { mode: 0o755 }
  );

  const saved = await runLocalQwen3AsrJob("ep-bili-2", fakeWav, {
    modelPath,
    mmprojPath,
    binaryOverride: fakeMtmd,
    ignoreCheckpoint: true,
  });

  expect(saved.length).toBeGreaterThanOrEqual(2);
  expect(saved[0].orig).toContain("这是第一句足够长的本地离线语音识别测试结果");
  const job = getAsrJob("ep-bili-2");
  expect(job?.status).toBe("completed");
  expect(job?.message).toContain("Qwen3-ASR 0.6B");
});

test("cloud ASR endpoint resolution and legacy settings migration match SubCast presets", () => {
  expect(resolveCloudAsrTranscriptionUrl("https://api.deepseek.com", "deepseek-asr")).toBe(
    "https://api.deepseek.com/v1/audio/transcriptions"
  );
  expect(resolveCloudAsrTranscriptionUrl("https://api.siliconflow.cn/v1", "siliconflow")).toBe(
    "https://api.siliconflow.cn/v1/audio/transcriptions"
  );
  expect(resolveCloudAsrTranscriptionUrl("https://open.bigmodel.cn/api/paas/v4", "zhipu-asr")).toBe(
    "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions"
  );
  expect(resolveCloudAsrTranscriptionUrl("http://127.0.0.1:8765/v1", "local-asr-service")).toBe(
    "http://127.0.0.1:8765/v1/audio/transcriptions"
  );

  const migratedSf = migrateLegacyCloudAsrSettings({
    cloudAsrProvider: "siliconflow",
    cloudAsrBaseUrl: "https://api.siliconflow.cn/v1/audio/transcriptions",
    cloudAsrModel: "FunAudioLLM/SenseVoiceSmall",
  });
  expect(migratedSf.cloudAsrBaseUrl).toBe("https://api.siliconflow.cn/v1");
  expect(migratedSf.cloudAsrModel).toBe("Qwen/Qwen3-ASR-1.7B");

  const migratedDs = migrateLegacyCloudAsrSettings({
    cloudAsrProvider: "deepseek-asr",
    cloudAsrBaseUrl: "https://api.deepseek.com/v1/audio/transcriptions",
    cloudAsrModel: "whisper-1",
  });
  expect(migratedDs.cloudAsrBaseUrl).toBe("https://api.deepseek.com");
  expect(migratedDs.cloudAsrModel).toBe("asr");
});
