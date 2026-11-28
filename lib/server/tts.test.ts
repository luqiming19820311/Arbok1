// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  CLOUD_TTS_PRESETS,
  LOCAL_TTS_MODEL_CATALOG,
  SYSTEM_TTS_VOICES,
} from "@/lib/arbok/providers";
import {
  canResumePausedTtsAudio,
  computeOverlayFontPx,
  evaluateTtsSync,
} from "@/lib/arbok/tts-sync";
import { closeDbForTests, saveAppSettings } from "./db";
import { getKeychainStatus, resetMemoryKeychain, setSecret } from "./keychain";
import { listLocalTtsModels, synthesizeSpeech } from "./tts";

let tmpDir = "";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-tts-test-"));
  process.env.ARBOK_DB_PATH = path.join(tmpDir, "arbok.db");
  process.env.ARBOK_TTS_MODELS_DIR = path.join(tmpDir, "tts-models");
  process.env.ARBOK_KEYCHAIN_MODE = "memory";
  closeDbForTests();
  resetMemoryKeychain();
});

afterEach(() => {
  closeDbForTests();
  delete process.env.ARBOK_DB_PATH;
  delete process.env.ARBOK_TTS_MODELS_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Xiaomi MiMo cloud TTS sends chat/completions audio payload and decodes base64 WAV", async () => {
  await expect(
    synthesizeSpeech({ text: "测试语音", engine: "cloud", provider: "xiaomi-mimo" })
  ).rejects.toThrow("API Key");

  setSecret("tts:xiaomi-mimo", "sk-mimo-secret-1234");
  expect(getKeychainStatus().ttsKeys["xiaomi-mimo"]?.configured).toBe(true);

  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  const fakeWav = Buffer.from("RIFF....WAVEfmt ");

  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(input);
    seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              audio: {
                format: "wav",
                data: fakeWav.toString("base64"),
              },
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const res = await synthesizeSpeech({
    text: "欢迎使用小米 MiMo 语音播报",
    engine: "cloud",
    provider: "xiaomi-mimo",
    model: "mimo-v2.5-tts",
    voice: "冰糖",
    stylePrompt: "用自然的播客口吻朗读",
    fetchImpl: mockFetch,
  });

  expect(seenUrl).toBe("https://api.xiaomimimo.com/v1/chat/completions");
  expect(seenBody.model).toBe("mimo-v2.5-tts");
  expect(seenBody.audio).toEqual({ format: "wav", voice: "冰糖" });
  expect(res.contentType).toBe("audio/wav");
  expect(res.audioBuffer.toString("ascii")).toBe("RIFF....WAVEfmt ");
});

test("Local Xiaomi MiMo-Audio TTS lists models and supports local server synthesis", async () => {
  const initialModels = listLocalTtsModels();
  expect(initialModels.map((m) => m.id)).toContain("mimo-audio-7b-instruct");
  expect(initialModels.every((m) => !m.installed)).toBe(true);

  const installedDir = path.join(
    process.env.ARBOK_TTS_MODELS_DIR!,
    "mimo-audio-7b-instruct"
  );
  fs.mkdirSync(installedDir, { recursive: true });
  fs.writeFileSync(path.join(installedDir, "config.json"), "{}");

  const updatedModels = listLocalTtsModels();
  expect(
    updatedModels.find((m) => m.id === "mimo-audio-7b-instruct")?.installed
  ).toBe(true);

  saveAppSettings({
    ttsEngine: "local",
    localTtsBaseUrl: "http://127.0.0.1:8000/v1",
  });

  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/chat/completions")) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(new Uint8Array(Buffer.from("RIFFlocalwav")), {
      status: 200,
      headers: { "Content-Type": "audio/wav" },
    });
  }) as typeof fetch;

  const out = await synthesizeSpeech({
    text: "本地离线小米语音测试",
    engine: "local",
    fetchImpl: mockFetch,
  });
  expect(out.engine).toBe("local");
  expect(out.audioBuffer.toString("ascii")).toBe("RIFFlocalwav");
});

test("TTS catch-up controller pauses video when English leads by >= 2 sentences and resumes once Chinese catches up", () => {
  expect(
    evaluateTtsSync({ videoSegIndex: 4, ttsSegIndex: 3, pausedByTts: false })
  ).toEqual({ action: "hold", lag: 1 });

  expect(
    evaluateTtsSync({ videoSegIndex: 5, ttsSegIndex: 3, pausedByTts: false })
  ).toEqual({ action: "pause_video", lag: 2 });

  expect(
    evaluateTtsSync({ videoSegIndex: 5, ttsSegIndex: 4, pausedByTts: true })
  ).toEqual({ action: "hold", lag: 1 });

  expect(
    evaluateTtsSync({ videoSegIndex: 5, ttsSegIndex: 5, pausedByTts: true })
  ).toEqual({ action: "resume_video", lag: 0 });

  expect(computeOverlayFontPx(65, "zh")).toBe(51);
  expect(computeOverlayFontPx(65, "orig")).toBe(37);
  expect(computeOverlayFontPx(100, "zh")).toBe(70);
  expect(computeOverlayFontPx(100, "orig")).toBe(50);
  expect(computeOverlayFontPx(0, "zh")).toBe(0);

  // Regression: ended HTMLAudioElement has paused===true and must never be replayed from start.
  expect(
    canResumePausedTtsAudio({
      paused: true,
      ended: true,
      currentTime: 3.2,
      duration: 3.2,
    })
  ).toBe(false);
  expect(
    canResumePausedTtsAudio({
      paused: true,
      ended: false,
      currentTime: 1.1,
      duration: 3.2,
    })
  ).toBe(true);
});

test("Cloud TTS removes xiaomi-mimo-cn, adds new providers, expands local models, and fixes Doubao/Qwen/DeepSeek", async () => {
  expect(CLOUD_TTS_PRESETS.some((p) => (p.id as string) === "xiaomi-mimo-cn")).toBe(
    false
  );
  expect(CLOUD_TTS_PRESETS.map((p) => p.id)).toEqual(
    expect.arrayContaining([
      "doubao-tts",
      "qwen-tts",
      "minimax-tts",
      "siliconflow-tts",
      "stepfun-tts",
      "elevenlabs-tts",
      "fish-audio-tts",
    ])
  );
  expect(LOCAL_TTS_MODEL_CATALOG.map((m) => m.id)).toEqual(
    expect.arrayContaining([
      "kokoro-82m",
      "cosyvoice2-0.5b",
      "chattts-local",
      "fish-speech-1.5",
      "sherpa-onnx-vits-zh",
    ])
  );
  expect(SYSTEM_TTS_VOICES.length).toBeGreaterThanOrEqual(14);

  // Doubao V3 unidirectional reuses asr:doubao key and decodes NDJSON base64 audio chunks
  setSecret("asr:doubao", "12345678:volc_token_secret");
  let doubaoHeaders: Headers | null = null;
  let doubaoUrl = "";
  const doubaoRes = await synthesizeSpeech({
    text: "豆包语音测试",
    engine: "cloud",
    provider: "doubao-tts",
    model: "seed-tts-2.0",
    voice: "zh_female_vv_uranus_bigtts",
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      doubaoUrl = String(input);
      doubaoHeaders = new Headers(init?.headers);
      const chunk1 = Buffer.from("ID3part1").toString("base64");
      const chunk2 = Buffer.from("part2").toString("base64");
      return new Response(
        `${JSON.stringify({ code: 0, data: chunk1 })}\n${JSON.stringify({ code: 0, data: chunk2 })}\n${JSON.stringify({ code: 20000000, message: "OK" })}`,
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch,
  });
  expect(doubaoUrl).toBe(
    "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
  );
  expect(doubaoHeaders!.get("X-Api-App-Id")).toBe("12345678");
  expect(doubaoHeaders!.get("X-Api-Access-Key")).toBe("volc_token_secret");
  expect(doubaoRes.audioBuffer.toString("ascii")).toBe("ID3part1part2");

  // Qwen-TTS upgrades legacy compatible-mode URL to DashScope multimodal-generation and fetches audio URL
  setSecret("llm:qwen", "sk-qwen-dashscope-key");
  const seenQwenUrls: string[] = [];
  const qwenRes = await synthesizeSpeech({
    text: "通义千问语音测试",
    engine: "cloud",
    provider: "qwen-tts",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-tts",
    voice: "Cherry",
    fetchImpl: (async (input: string | URL | Request) => {
      const u = String(input);
      seenQwenUrls.push(u);
      if (u.includes("multimodal-generation")) {
        return new Response(
          JSON.stringify({
            output: { audio: { url: "https://oss.example.com/qwen.wav" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(Buffer.from("RIFFqwenwav"), {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      });
    }) as typeof fetch,
  });
  expect(seenQwenUrls[0]).toContain("multimodal-generation/generation");
  expect(qwenRes.audioBuffer.toString("ascii")).toBe("RIFFqwenwav");

  // DeepSeek official endpoint explains lack of native TTS clearly; compatible gateway succeeds
  setSecret("tts:deepseek-tts", "sk-ds-tts-key");
  await expect(
    synthesizeSpeech({
      text: "测试",
      engine: "cloud",
      provider: "deepseek-tts",
      baseUrl: "https://api.deepseek.com/v1",
    })
  ).rejects.toThrow(/DeepSeek 官方接口暂未开放原生语音合成/);

  const gatewayRes = await synthesizeSpeech({
    text: "兼容网关测试",
    engine: "cloud",
    provider: "deepseek-tts",
    baseUrl: "https://api.siliconflow.cn/v1/audio/speech",
    fetchImpl: (async (input: string | URL | Request) => {
      expect(String(input)).toBe("https://api.siliconflow.cn/v1/audio/speech");
      return new Response(Buffer.from("MP3OK"), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }) as typeof fetch,
  });
  expect(gatewayRes.audioBuffer.toString("ascii")).toBe("MP3OK");
});
