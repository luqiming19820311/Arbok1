import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseBilibiliUrl } from "./adapters/bilibili";
import { normalizeIngestUrl } from "./adapters/index";
import { downloadLocalAsrModel, listLocalAsrDownloadStates } from "./asr";
import { listLocalAsrModels } from "./env";
import {
  closeDbForTests,
  getEpisodeById,
  getPlayQueue,
  insertEpisode,
  listSubscriptions,
  savePlayQueue,
  searchGlobalTranscriptsAndNotes,
  updateSubscriptionPlaybackRate,
  upsertNote,
  upsertSubscription,
} from "./db";
import {
  cancelOfflineDownload,
  enqueueOfflineDownload,
  getOfflineDownloadJob,
  pauseOfflineDownload,
  removeOfflineDownload,
  resetDownloadQueueForTests,
} from "./downloads";
import { importLocalMediaBuffer } from "./local-import";
import {
  clearTempCache,
  enforceTempCacheLruLimit,
  getLocalMediaDir,
  getOfflineDir,
  inspectStorageUsage,
} from "./storage";
import { proxyEpisodeMediaStream } from "./stream";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-phase3-"));
  process.env.ARBOK_DB_PATH = path.join(tmpRoot, "arbok.db");
  process.env.ARBOK_CACHE_DIR = path.join(tmpRoot, "cache", "audio");
  process.env.ARBOK_OFFLINE_DIR = path.join(tmpRoot, "offline");
  process.env.ARBOK_LOCAL_MEDIA_DIR = path.join(tmpRoot, "local-media");
  closeDbForTests();
  resetDownloadQueueForTests();
});

afterEach(() => {
  resetDownloadQueueForTests();
  closeDbForTests();
  delete process.env.ARBOK_DB_PATH;
  delete process.env.ARBOK_CACHE_DIR;
  delete process.env.ARBOK_OFFLINE_DIR;
  delete process.env.ARBOK_LOCAL_MEDIA_DIR;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function waitForDownloadState(
  episodeId: string,
  expected: string[],
  timeoutMs = 3000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = getOfflineDownloadJob(episodeId);
    if (job && expected.includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 25));
  }
  return getOfflineDownloadJob(episodeId);
}

describe("Phase 3 — Offline Downloads, LRU Cache Governance, Local Import & Playback Memory", () => {
  test("LRU cache eviction removes oldest temp files only and never deletes offline or local media", () => {
    const cacheDir = process.env.ARBOK_CACHE_DIR!;
    const offlineDir = getOfflineDir();
    const localDir = getLocalMediaDir();
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(offlineDir, { recursive: true });
    fs.mkdirSync(localDir, { recursive: true });

    const oneMb = Buffer.alloc(1024 * 1024, 0x61);
    const oldestCache = path.join(cacheDir, "oldest.mp3");
    const middleCache = path.join(cacheDir, "middle.mp3");
    const newestCache = path.join(cacheDir, "newest.mp3");
    const offlineFile = path.join(offlineDir, "ep-saved.mp3");
    const localFile = path.join(localDir, "imported.mp4");

    fs.writeFileSync(oldestCache, oneMb);
    fs.writeFileSync(middleCache, oneMb);
    fs.writeFileSync(newestCache, oneMb);
    fs.writeFileSync(offlineFile, oneMb);
    fs.writeFileSync(localFile, oneMb);

    const nowSec = Date.now() / 1000;
    fs.utimesSync(oldestCache, nowSec - 300, nowSec - 300);
    fs.utimesSync(middleCache, nowSec - 150, nowSec - 150);
    fs.utimesSync(newestCache, nowSec - 10, nowSec - 10);

    const lruResult = enforceTempCacheLruLimit(1.5);
    expect(lruResult.evictedFiles).toEqual([oldestCache, middleCache]);
    expect(fs.existsSync(oldestCache)).toBe(false);
    expect(fs.existsSync(middleCache)).toBe(false);
    expect(fs.existsSync(newestCache)).toBe(true);
    expect(fs.existsSync(offlineFile)).toBe(true);
    expect(fs.existsSync(localFile)).toBe(true);
    expect(lruResult.usage.offlineCount).toBe(1);
    expect(lruResult.usage.localMediaMb).toBe(1);

    const cleared = clearTempCache();
    expect(cleared.usage.tempCacheBytes).toBe(0);
    expect(fs.existsSync(offlineFile)).toBe(true);
    expect(fs.existsSync(localFile)).toBe(true);
  });

  test("offline download writes media to disk, plays offline with Range 206, and removes cleanly", async () => {
    const payload = Buffer.from("ID3-OFFLINE-AUDIO-PAYLOAD-0123456789ABCDEF");
    insertEpisode({
      id: "ep-dl-1",
      subId: null,
      platform: "podcast",
      channel: "Offline Test Pod",
      title: "Downloadable Episode",
      date: "今天",
      durationSec: 600,
      positionSec: 0,
      mediaType: "audio",
      language: "en",
      hasOfficialSub: true,
      isBilingual: false,
      hasAiGuide: false,
      isOffline: false,
      gradient: "linear-gradient(135deg, #111, #333)",
      coverLabel: "DL",
      pageUrl: "https://example.com/ep-dl-1",
      audioUrl: "https://cdn.example.com/ep-dl-1.mp3",
      transcript: [
        { id: 1, start: 0, end: 5, orig: "Offline transcript still works" },
      ],
      guide: null,
      chat: [],
    });

    const mockFetch: typeof fetch = async () =>
      new Response(payload, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(payload.byteLength),
        },
      });

    enqueueOfflineDownload("ep-dl-1", { fetchImpl: mockFetch });
    const doneJob = await waitForDownloadState("ep-dl-1", ["completed", "failed"]);
    expect(doneJob?.status).toBe("completed");
    expect(doneJob?.progress).toBe(100);
    expect(doneJob?.filePath && fs.existsSync(doneJob.filePath)).toBe(true);

    const savedEp = getEpisodeById("ep-dl-1");
    expect(savedEp?.isOffline).toBe(true);
    expect(savedEp?.localFilePath).toBe(doneJob?.filePath);

    // Offline playback must succeed from local disk even if network throws.
    const throwingFetch: typeof fetch = async () => {
      throw new Error("NETWORK_OFFLINE");
    };
    const streamRes = await proxyEpisodeMediaStream("ep-dl-1", {
      mode: "audio",
      rangeHeader: "bytes=0-15",
      fetchImpl: throwingFetch,
    });
    expect(streamRes.status).toBe(206);
    expect(streamRes.headers.get("content-range")).toBe(
      `bytes 0-15/${payload.byteLength}`
    );
    const chunk = Buffer.from(await streamRes.arrayBuffer());
    expect(chunk.toString("utf8")).toBe(payload.subarray(0, 16).toString("utf8"));

    removeOfflineDownload("ep-dl-1");
    expect(doneJob?.filePath && fs.existsSync(doneJob.filePath)).toBe(false);
    expect(getEpisodeById("ep-dl-1")?.isOffline).toBe(false);
  });

  test("offline download queue supports pause and cancel cleanly", async () => {
    insertEpisode({
      id: "ep-dl-pause",
      subId: null,
      platform: "podcast",
      channel: "Pause Test",
      title: "Pausable Episode",
      date: "今天",
      durationSec: 300,
      positionSec: 0,
      mediaType: "audio",
      language: "zh",
      hasOfficialSub: false,
      isBilingual: false,
      hasAiGuide: false,
      isOffline: false,
      gradient: "linear-gradient(135deg, #111, #333)",
      coverLabel: "PS",
      pageUrl: "https://example.com/ep-dl-pause",
      audioUrl: "https://cdn.example.com/ep-dl-pause.mp3",
      transcript: [],
      guide: null,
      chat: [],
    });

    const slowFetch: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      });

    enqueueOfflineDownload("ep-dl-pause", { fetchImpl: slowFetch });
    const paused = pauseOfflineDownload("ep-dl-pause");
    expect(paused?.status).toBe("paused");
    const afterPause = await waitForDownloadState("ep-dl-pause", ["paused"]);
    expect(afterPause?.status).toBe("paused");

    const cancelled = cancelOfflineDownload("ep-dl-pause");
    expect(cancelled?.status).toBe("cancelled");
  });

  test("local media import supports mp3/mp4, rejects unsupported extensions, and serves Range playback", async () => {
    expect(() =>
      importLocalMediaBuffer({
        filename: "notes.pdf",
        buffer: Buffer.from("pdf-data"),
      })
    ).toThrow(/暂不支持该文件格式/);

    const mp3Bytes = Buffer.from("FAKE-MP3-HEADER-CONTENT-1234567890");
    const audioEp = importLocalMediaBuffer({
      filename: "founder-interview.mp3",
      buffer: mp3Bytes,
      title: "创始人深度访谈录音",
    });
    expect(audioEp.platform).toBe("local");
    expect(audioEp.mediaType).toBe("audio");
    expect(audioEp.isOffline).toBe(true);
    expect(audioEp.localFilePath && fs.existsSync(audioEp.localFilePath)).toBe(true);

    const movEp = importLocalMediaBuffer({
      filename: "keynote-demo.mov",
      buffer: Buffer.from("FAKE-MOV-CONTENT"),
    });
    expect(movEp.platform).toBe("local");
    expect(movEp.mediaType).toBe("video");

    const streamRes = await proxyEpisodeMediaStream(audioEp.id, {
      mode: "audio",
      rangeHeader: "bytes=0-9",
    });
    expect(streamRes.status).toBe(206);
    expect(Buffer.from(await streamRes.arrayBuffer()).toString("utf8")).toBe(
      "FAKE-MP3-H"
    );

    const usage = inspectStorageUsage();
    expect(usage.localMediaBytes).toBeGreaterThanOrEqual(mp3Bytes.byteLength);
  });

  test("persists per-channel playbackRate, Play Next queue, and searches transcripts & notes globally", () => {
    upsertSubscription({
      id: "sub-speed-test",
      name: "Speed Channel",
      platform: "podcast",
      sourceUrl: "https://example.com/feed.xml",
      gradient: "linear-gradient(135deg, #111, #444)",
      shortLabel: "SPD",
    });

    updateSubscriptionPlaybackRate("sub-speed-test", 1.75);
    const subs = listSubscriptions();
    expect(subs.find((s) => s.id === "sub-speed-test")?.playbackRate).toBe(1.75);

    const savedQueue = savePlayQueue(["ep-a", "ep-b", "ep-a", "ep-c"]);
    expect(savedQueue).toEqual(["ep-a", "ep-b", "ep-c"]);
    expect(getPlayQueue()).toEqual(["ep-a", "ep-b", "ep-c"]);

    insertEpisode({
      id: "ep-search-1",
      subId: "sub-speed-test",
      platform: "podcast",
      channel: "Speed Channel",
      title: "Distributed Systems Deep Dive",
      date: "今天",
      durationSec: 1200,
      positionSec: 0,
      mediaType: "audio",
      language: "en",
      hasOfficialSub: true,
      isBilingual: true,
      hasAiGuide: false,
      isOffline: false,
      gradient: "linear-gradient(135deg, #111, #444)",
      coverLabel: "SYS",
      pageUrl: "https://example.com/ep-search-1",
      transcript: [
        {
          id: 101,
          start: 142,
          end: 150,
          orig: "Raft consensus guarantees leader completeness under partition.",
          zh: "Raft 共识算法在网络分区下保证领导者完备性。",
        },
      ],
      guide: null,
      chat: [],
    });

    upsertNote({
      epId: "ep-search-1",
      segId: 101,
      ts: 142,
      quote: "Raft 共识算法",
      body: "复盘 Raft 共识选举超时机制",
    });

    const hits = searchGlobalTranscriptsAndNotes("Raft");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((h) => h.kind === "note" && h.startSec === 142)).toBe(true);
    expect(
      hits.some(
        (h) =>
          h.kind === "transcript" &&
          h.episodeId === "ep-search-1" &&
          h.startSec === 142
      )
    ).toBe(true);
  });

  test("downloads qwen3-asr-0.6b GGUF model with automatic hf-mirror fallback", async () => {
    process.env.ARBOK_MODELS_DIR = path.join(tmpRoot, "models");
    const visited: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      visited.push(url);
      if (url.startsWith("https://huggingface.co/")) {
        return new Response("gateway error", { status: 502 });
      }
      return new Response(Buffer.from("GGUF-QWEN3-ASR-MODEL-BYTES"), {
        status: 200,
        headers: { "content-length": "26" },
      });
    };

    try {
      const res = await downloadLocalAsrModel("qwen3-asr-0.6b", mockFetch);
      expect(visited[0]).toContain(
        "https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF/resolve/main/Qwen3-ASR-0.6B-Q8_0.gguf"
      );
      expect(visited[1]).toContain(
        "https://hf-mirror.com/ggml-org/Qwen3-ASR-0.6B-GGUF/resolve/main/Qwen3-ASR-0.6B-Q8_0.gguf"
      );
      expect(fs.existsSync(res.localPath)).toBe(true);
      const dlState = listLocalAsrDownloadStates()["qwen3-asr-0.6b"];
      expect(dlState?.status).toBe("completed");
      expect(dlState?.progress).toBe(100);
      expect(dlState?.downloadedBytes).toBe(26);
      const model = listLocalAsrModels().find((m) => m.id === "qwen3-asr-0.6b");
      expect(model?.installed).toBe(true);
    } finally {
      delete process.env.ARBOK_MODELS_DIR;
    }
  });

  test("parses Bilibili UP space URL with trailing ? and rsshub:// format via medialist API", async () => {
    expect(normalizeIngestUrl("rsshub://bilibili/user/video/520819684")).toBe(
      "https://space.bilibili.com/520819684"
    );
    expect(normalizeIngestUrl("space.bilibili.com/615957867?")).toBe(
      "https://space.bilibili.com/615957867?"
    );

    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("api.bilibili.com/x/v2/medialist/resource/list");
      expect(url).toContain("biz_id=615957867");
      return Response.json({
        code: 0,
        data: {
          media_list: [
            {
              bv_id: "BV1B5yGz4EFz",
              title: "测试 B站 UP 视频",
              intro: "视频简介内容",
              cover: "http://i0.hdslb.com/bfs/archive/test.jpg",
              duration: 645,
              pubtime: Math.floor(Date.now() / 1000) - 3600,
              upper: {
                name: "五里墩茶社",
                face: "http://i0.hdslb.com/bfs/face/test.jpg",
              },
            },
          ],
        },
      });
    };

    const parsed = await parseBilibiliUrl("https://space.bilibili.com/615957867?", {
      fetchImpl: mockFetch,
    });
    expect(parsed.subscription?.name).toBe("五里墩茶社");
    expect(parsed.subscription?.sourceUrl).toBe(
      "https://space.bilibili.com/615957867"
    );
    expect(parsed.subscription?.coverUrl).toBe(
      "https://i0.hdslb.com/bfs/face/test.jpg"
    );
    expect(parsed.episodes).toHaveLength(1);
    expect(parsed.episodes[0].externalId).toBe("BV1B5yGz4EFz");
    expect(parsed.episodes[0].coverUrl).toBe(
      "https://i0.hdslb.com/bfs/archive/test.jpg"
    );
  });
});
