import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  CloudTtsProviderId,
  LocalTtsModel,
  TtsEngine,
} from "@/components/arbok/types";
import {
  LOCAL_TTS_MODEL_CATALOG,
  getCloudTtsPreset,
} from "@/lib/arbok/providers";
import { runIsolatedSubprocess } from "./asr";
import { getAppSettings } from "./db";
import { resolveBinary } from "./env";
import { getSecret } from "./keychain";
import { proxyFetch } from "./proxy";

function getTtsModelsDir(): string {
  const baseDir = process.env.ARBOK_DATA_DIR ?? path.join(process.cwd(), "data");
  return process.env.ARBOK_TTS_MODELS_DIR || path.join(baseDir, "models", "tts");
}

export function listLocalTtsModels(): LocalTtsModel[] {
  const dir = getTtsModelsDir();
  return LOCAL_TTS_MODEL_CATALOG.map((item) => {
    const modelDir = path.join(/*turbopackIgnore: true*/ dir, item.id);
    const hasDir =
      fs.existsSync(/*turbopackIgnore: true*/ modelDir) &&
      fs.readdirSync(/*turbopackIgnore: true*/ modelDir).length > 0;
    return {
      ...item,
      installed: hasDir,
      localPath: hasDir ? modelDir : undefined,
    };
  });
}

export async function downloadLocalTtsModel(
  modelId: string
): Promise<LocalTtsModel[]> {
  const target = LOCAL_TTS_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!target) {
    throw new Error(`未知的本地 TTS 模型：${modelId}`);
  }

  const hfBin = resolveBinary([
    path.join(process.env.HOME ?? "", ".local", "bin", "hf"),
    path.join(process.env.HOME ?? "", ".local", "bin", "huggingface-cli"),
    "/opt/homebrew/bin/hf",
    "/opt/homebrew/bin/huggingface-cli",
    "hf",
    "huggingface-cli",
  ]);
  if (!hfBin) {
    throw new Error(
      `本机未检测到 hf / huggingface-cli，请先运行 pip install huggingface-hub，再执行：hf download ${target.repoId} --local-dir ./data/models/tts/${target.id}`
    );
  }

  const destDir = path.join(/*turbopackIgnore: true*/ getTtsModelsDir(), target.id);
  fs.mkdirSync(/*turbopackIgnore: true*/ destDir, { recursive: true });
  await runIsolatedSubprocess(hfBin, [
    "download",
    target.repoId,
    "--local-dir",
    destDir,
  ]);
  return listLocalTtsModels();
}

export function deleteLocalTtsModel(modelId: string): LocalTtsModel[] {
  const target = LOCAL_TTS_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!target) return listLocalTtsModels();
  const destDir = path.join(/*turbopackIgnore: true*/ getTtsModelsDir(), target.id);
  if (fs.existsSync(/*turbopackIgnore: true*/ destDir)) {
    fs.rmSync(/*turbopackIgnore: true*/ destDir, { recursive: true, force: true });
  }
  return listLocalTtsModels();
}

export interface SynthesizeSpeechInput {
  text: string;
  engine?: TtsEngine;
  provider?: CloudTtsProviderId;
  model?: string;
  baseUrl?: string;
  voice?: string;
  speed?: number;
  stylePrompt?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface SynthesizeSpeechOutput {
  audioBuffer: Buffer;
  contentType: string;
  engine: TtsEngine;
  model: string;
}

function clampSpeed(speed?: number): number {
  if (!speed || !Number.isFinite(speed) || speed <= 0) return 1;
  return Math.max(0.5, Math.min(2.0, speed));
}

function resolveSpeechEndpoint(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  if (cleaned.endsWith("/audio/speech")) return cleaned;
  return `${cleaned}/audio/speech`;
}

function resolveCloudTtsApiKey(
  provider: CloudTtsProviderId,
  explicitKey?: string
): string | null {
  if (explicitKey?.trim()) return explicitKey.trim();
  const direct = getSecret(`tts:${provider}`);
  if (direct) return direct;

  if (provider === "doubao-tts") return getSecret("asr:doubao");
  if (provider === "qwen-tts") return getSecret("llm:qwen");
  if (provider === "siliconflow-tts") return getSecret("llm:siliconflow");
  if (provider === "openai-tts") return getSecret("llm:openai");
  if (provider === "deepseek-tts") {
    return getSecret("llm:siliconflow") ?? getSecret("llm:deepseek");
  }
  return null;
}

function parseDoubaoCredentials(rawKey: string): {
  appId?: string;
  accessToken?: string;
  apiKey?: string;
} {
  const trimmed = rawKey.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as {
        appId?: string;
        app_id?: string;
        accessToken?: string;
        access_key?: string;
        token?: string;
      };
      const appId = obj.appId ?? obj.app_id;
      const accessToken = obj.accessToken ?? obj.access_key ?? obj.token;
      if (appId && accessToken) {
        return { appId: appId.trim(), accessToken: accessToken.trim() };
      }
    } catch {
      // Fall through to delimiter parsing.
    }
  }
  const sepIdx = trimmed.search(/[:|]/);
  if (sepIdx > 0 && sepIdx < trimmed.length - 1) {
    const left = trimmed.slice(0, sepIdx).trim();
    const right = trimmed.slice(sepIdx + 1).trim();
    if (/^\d{5,}$/.test(left) && right.length >= 8) {
      return { appId: left, accessToken: right };
    }
  }
  return { apiKey: trimmed };
}

async function callDoubaoTts(params: {
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  text: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): Promise<SynthesizeSpeechOutput> {
  const cleanedUrl = params.baseUrl.replace(/\/+$/, "");
  if (!/bytedance\.com|volces\.com|volcengine/i.test(cleanedUrl)) {
    return callOpenAiSpeechTts({
      provider: "doubao-tts",
      label: "豆包语音 TTS",
      baseUrl: cleanedUrl,
      model: params.model,
      voice: params.voice,
      speed: params.speed,
      text: params.text,
      apiKey: params.apiKey,
      fetchImpl: params.fetchImpl,
    });
  }

  const endpoint = cleanedUrl.endsWith("/audio/speech")
    ? cleanedUrl.replace(/\/audio\/speech$/, "")
    : cleanedUrl;
  const creds = parseDoubaoCredentials(params.apiKey);
  const resourceId = params.model.includes("1.")
    ? "seed-tts-1.0"
    : "seed-tts-2.0";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": crypto.randomUUID(),
  };
  if (creds.appId && creds.accessToken) {
    headers["X-Api-App-Id"] = creds.appId;
    headers["X-Api-Access-Key"] = creds.accessToken;
  } else {
    headers["x-api-key"] = creds.apiKey ?? params.apiKey;
    headers.Authorization = `Bearer ${creds.apiKey ?? params.apiKey}`;
  }

  const speechRate = Math.max(
    -50,
    Math.min(100, Math.round((params.speed - 1) * 100))
  );
  const res = await params.fetchImpl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: { uid: "arbok-user" },
      req_params: {
        text: params.text,
        speaker: params.voice || "zh_female_vv_uranus_bigtts",
        audio_params: {
          format: "mp3",
          sample_rate: 24000,
          speech_rate: speechRate,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 260);
    throw new Error(
      `豆包语音 TTS 请求失败 (${res.status})：${errText}（提示：火山引擎 V3 需填写有效 API Key 或「AppID:AccessToken」格式凭证）`
    );
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.startsWith("audio/")) {
    return {
      audioBuffer: Buffer.from(await res.arrayBuffer()),
      contentType: ct,
      engine: "cloud",
      model: params.model,
    };
  }

  const rawText = await res.text();
  const chunks: Buffer[] = [];
  let apiError = "";
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/^data:\s*/, "").trim();
    if (!line || line === "[DONE]") continue;
    try {
      const obj = JSON.parse(line) as {
        code?: number;
        message?: string;
        data?: string | null;
      };
      if (
        typeof obj.code === "number" &&
        obj.code !== 0 &&
        obj.code !== 20000000
      ) {
        apiError = obj.message || `错误码 ${obj.code}`;
      }
      if (typeof obj.data === "string" && obj.data.length > 0) {
        chunks.push(Buffer.from(obj.data, "base64"));
      }
    } catch {
      // Ignore non-JSON keepalive fragments.
    }
  }

  if (chunks.length === 0) {
    throw new Error(
      `豆包语音 TTS 未返回有效音频数据${apiError ? `：${apiError}` : "（请检查 AppID:AccessToken 或 API Key 及音色权限）"}`
    );
  }

  return {
    audioBuffer: Buffer.concat(chunks),
    contentType: "audio/mpeg",
    engine: "cloud",
    model: params.model,
  };
}

async function callQwenDashScopeTts(params: {
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  text: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): Promise<SynthesizeSpeechOutput> {
  const cleanedUrl = params.baseUrl.replace(/\/+$/, "");
  if (!/dashscope\.aliyuncs\.com/i.test(cleanedUrl)) {
    return callOpenAiSpeechTts({
      provider: "qwen-tts",
      label: "通义 Qwen-TTS",
      baseUrl: cleanedUrl,
      model: params.model,
      voice: params.voice,
      speed: params.speed,
      text: params.text,
      apiKey: params.apiKey,
      fetchImpl: params.fetchImpl,
    });
  }

  // Upgrade legacy compatible-mode URL to DashScope's native multimodal-generation endpoint.
  const endpoint = cleanedUrl.includes("/multimodal-generation/generation")
    ? cleanedUrl
    : "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

  const hasChinese = /[\u4e00-\u9fff]/.test(params.text);
  const res = await params.fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model || "qwen-tts",
      input: {
        text: params.text,
        voice: params.voice || "Cherry",
        language_type: hasChinese ? "Chinese" : "English",
      },
    }),
  });

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 260);
    throw new Error(`通义 Qwen-TTS 请求失败 (${res.status})：${errText}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.startsWith("audio/")) {
    return {
      audioBuffer: Buffer.from(await res.arrayBuffer()),
      contentType: ct,
      engine: "cloud",
      model: params.model,
    };
  }

  const payload = (await res.json()) as {
    code?: string;
    message?: string;
    output?: {
      audio?: {
        url?: string;
        data?: string;
      };
    };
  };
  if (payload.code && payload.message) {
    throw new Error(`通义 Qwen-TTS 合成失败 (${payload.code})：${payload.message}`);
  }

  const audioData = payload.output?.audio?.data;
  if (audioData) {
    return {
      audioBuffer: Buffer.from(audioData, "base64"),
      contentType: "audio/wav",
      engine: "cloud",
      model: params.model,
    };
  }

  const audioUrl = payload.output?.audio?.url;
  if (!audioUrl) {
    throw new Error("通义 Qwen-TTS 未返回有效音频链接或音频数据");
  }

  const audioRes = await params.fetchImpl(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`拉取通义 Qwen-TTS 音频文件失败 (${audioRes.status})`);
  }
  return {
    audioBuffer: Buffer.from(await audioRes.arrayBuffer()),
    contentType: audioRes.headers.get("content-type") || "audio/wav",
    engine: "cloud",
    model: params.model,
  };
}

async function callMiniMaxTts(params: {
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  text: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): Promise<SynthesizeSpeechOutput> {
  const endpoint = params.baseUrl.replace(/\/+$/, "");
  const res = await params.fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model || "speech-02-turbo",
      text: params.text,
      stream: false,
      voice_setting: {
        voice_id: params.voice || "female-shaonv",
        speed: params.speed,
        vol: 1,
        pitch: 0,
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(
      `MiniMax 语音合成失败 (${res.status})：${(await res.text()).slice(0, 240)}`
    );
  }

  const data = (await res.json()) as {
    base_resp?: { status_code?: number; status_msg?: string };
    data?: { audio?: string };
  };
  if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax 语音合成失败 (${data.base_resp.status_code})：${data.base_resp.status_msg ?? "未知错误"}`
    );
  }
  const hexAudio = data.data?.audio;
  if (!hexAudio) {
    throw new Error("MiniMax 语音合成未返回有效音频数据");
  }
  return {
    audioBuffer: Buffer.from(hexAudio, "hex"),
    contentType: "audio/mpeg",
    engine: "cloud",
    model: params.model,
  };
}

async function callElevenLabsTts(params: {
  baseUrl: string;
  model: string;
  voice: string;
  text: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): Promise<SynthesizeSpeechOutput> {
  const base = params.baseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/text-to-speech/${encodeURIComponent(params.voice || "21m00Tcm4TlvDq8ikWAM")}`;
  const res = await params.fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": params.apiKey,
    },
    body: JSON.stringify({
      text: params.text,
      model_id: params.model || "eleven_multilingual_v2",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `ElevenLabs TTS 请求失败 (${res.status})：${(await res.text()).slice(0, 240)}`
    );
  }
  return {
    audioBuffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "audio/mpeg",
    engine: "cloud",
    model: params.model,
  };
}

async function callFishAudioTts(params: {
  baseUrl: string;
  model: string;
  voice: string;
  text: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): Promise<SynthesizeSpeechOutput> {
  const base = params.baseUrl.replace(/\/+$/, "");
  const endpoint = base.endsWith("/tts") ? base : `${base}/tts`;
  const res = await params.fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
      model: params.model || "speech-1.6",
    },
    body: JSON.stringify({
      text: params.text,
      reference_id: params.voice || undefined,
      format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Fish Audio TTS 请求失败 (${res.status})：${(await res.text()).slice(0, 240)}`
    );
  }
  return {
    audioBuffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "audio/mpeg",
    engine: "cloud",
    model: params.model,
  };
}

async function callOpenAiSpeechTts(params: {
  provider: CloudTtsProviderId;
  label: string;
  baseUrl: string;
  model: string;
  voice: string;
  speed: number;
  text: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}): Promise<SynthesizeSpeechOutput> {
  if (
    params.provider === "deepseek-tts" &&
    /^https?:\/\/api\.deepseek\.com(?:\/|$)/i.test(params.baseUrl)
  ) {
    throw new Error(
      "DeepSeek 官方接口暂未开放原生语音合成（/audio/speech）。请在「高级设置 → 接口地址」中填写 OpenAI 兼容语音网关（例如硅基流动 https://api.siliconflow.cn/v1），或切换豆包 / 通义千问 / 硅基流动 / MiniMax / Edge 在线语音。"
    );
  }

  const endpoint = resolveSpeechEndpoint(params.baseUrl);
  const res = await params.fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      input: params.text,
      voice: params.voice,
      speed: params.speed,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 240);
    throw new Error(`${params.label} 请求失败 (${res.status})：${errBody}`);
  }
  return {
    audioBuffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "audio/mpeg",
    engine: "cloud",
    model: params.model,
  };
}

async function callMiMoChatTts(params: {
  baseUrl: string;
  model: string;
  voice: string;
  stylePrompt?: string;
  text: string;
  apiKey?: string | null;
  fetchImpl: typeof fetch;
}): Promise<SynthesizeSpeechOutput> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.apiKey) {
    headers.Authorization = `Bearer ${params.apiKey}`;
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (params.stylePrompt?.trim()) {
    messages.push({ role: "user", content: params.stylePrompt.trim() });
  }
  messages.push({ role: "assistant", content: params.text });

  const endpoint = `${params.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await params.fetchImpl(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      messages,
      audio: {
        format: "wav",
        voice: params.voice || "冰糖",
      },
    }),
  });

  if (!res.ok) {
    const errText = (await res.text()).slice(0, 240);
    throw new Error(`小米 MiMo TTS 请求失败 (${res.status})：${errText}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.startsWith("audio/")) {
    return {
      audioBuffer: Buffer.from(await res.arrayBuffer()),
      contentType: ct,
      engine: "cloud",
      model: params.model,
    };
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        audio?: { data?: string; format?: string };
      };
    }>;
  };
  const b64 = data.choices?.[0]?.message?.audio?.data;
  if (!b64) {
    throw new Error("小米 MiMo TTS 未返回有效音频数据（choices[0].message.audio.data 为空）");
  }
  const fmt = data.choices?.[0]?.message?.audio?.format ?? "wav";
  const contentType = fmt === "mp3" ? "audio/mpeg" : "audio/wav";
  return {
    audioBuffer: Buffer.from(b64, "base64"),
    contentType,
    engine: "cloud",
    model: params.model,
  };
}

function synthesizeWithEdgeCli(params: {
  text: string;
  voice?: string;
  speed?: number;
}): SynthesizeSpeechOutput | null {
  const edgeBin = resolveBinary([
    path.join(process.env.HOME ?? "", ".local", "bin", "edge-tts"),
    "/opt/homebrew/bin/edge-tts",
    "/usr/local/bin/edge-tts",
    "edge-tts",
  ]);
  if (!edgeBin) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-edge-"));
  const mp3Path = path.join(tmpDir, "speech.mp3");
  const pct = Math.round((clampSpeed(params.speed) - 1) * 100);
  const rateArg = `${pct >= 0 ? "+" : ""}${pct}%`;

  try {
    execFileSync(
      edgeBin,
      [
        "--voice",
        params.voice?.trim() || "zh-CN-XiaoxiaoNeural",
        `--rate=${rateArg}`,
        "--text",
        params.text,
        "--write-media",
        mp3Path,
      ],
      { timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] }
    );
    if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 256) {
      return {
        audioBuffer: fs.readFileSync(mp3Path),
        contentType: "audio/mpeg",
        engine: "cloud",
        model: "edge-neural",
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function synthesizeWithMacSystemVoice(params: {
  text: string;
  voice?: string;
  speed?: number;
}): SynthesizeSpeechOutput {
  if (process.platform !== "darwin" || !fs.existsSync("/usr/bin/say")) {
    throw new Error("当前操作系统不支持 macOS 系统增强语音，请切换至云端 TTS 服务");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-say-"));
  const aiffPath = path.join(tmpDir, "speech.aiff");
  const wavPath = path.join(tmpDir, "speech.wav");
  const rate = Math.max(
    110,
    Math.min(340, Math.round(190 * clampSpeed(params.speed)))
  );

  try {
    const requestedVoice = params.voice?.trim() || "Tingting";
    try {
      execFileSync(
        "/usr/bin/say",
        ["-v", requestedVoice, "-r", String(rate), "-o", aiffPath, params.text],
        { timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch {
      execFileSync(
        "/usr/bin/say",
        ["-r", String(rate), "-o", aiffPath, params.text],
        { timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] }
      );
    }

    const ffmpeg = resolveBinary([
      "/opt/homebrew/bin/ffmpeg",
      "/usr/local/bin/ffmpeg",
      "ffmpeg",
    ]);
    if (ffmpeg) {
      execFileSync(
        ffmpeg,
        ["-y", "-i", aiffPath, "-acodec", "pcm_s16le", "-ar", "24000", wavPath],
        { timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] }
      );
      return {
        audioBuffer: fs.readFileSync(wavPath),
        contentType: "audio/wav",
        engine: "local",
        model: "system-enhanced",
      };
    }

    return {
      audioBuffer: fs.readFileSync(aiffPath),
      contentType: "audio/aiff",
      engine: "local",
      model: "system-enhanced",
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function synthesizeSpeech(
  input: SynthesizeSpeechInput
): Promise<SynthesizeSpeechOutput> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("请输入需要语音播报的文本");
  }

  const settings = getAppSettings();
  const engine = input.engine ?? settings.ttsEngine ?? "cloud";
  const speed = clampSpeed(input.speed ?? settings.ttsSpeed ?? 1);
  const doFetch = input.fetchImpl ?? proxyFetch;

  if (engine === "local") {
    const model =
      input.model?.trim() || settings.localTtsModelId || "system-enhanced";

    if (model === "system-enhanced" && !input.fetchImpl) {
      return synthesizeWithMacSystemVoice({
        text,
        voice: input.voice ?? settings.localTtsVoice ?? "Tingting",
        speed,
      });
    }

    const catalogItem = LOCAL_TTS_MODEL_CATALOG.find((m) => m.id === model);
    const baseUrl = (
      input.baseUrl?.trim() ||
      settings.localTtsBaseUrl ||
      catalogItem?.defaultBaseUrl ||
      "http://127.0.0.1:8000/v1"
    ).replace(/\/+$/, "");
    const voice =
      input.voice?.trim() ||
      settings.localTtsVoice ||
      catalogItem?.voices?.[0]?.value ||
      "冰糖";
    const stylePrompt = input.stylePrompt ?? settings.localTtsVoiceStyle;

    // Non-MiMo local servers (Kokoro, CosyVoice, ChatTTS, Fish Speech, Sherpa-ONNX) prefer /audio/speech first.
    const preferSpeechFirst =
      catalogItem?.engine && catalogItem.engine !== "mimo-audio";

    if (preferSpeechFirst) {
      const speechRes = await doFetch(resolveSpeechEndpoint(baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          speed,
          instructions: stylePrompt,
          response_format: "wav",
        }),
      }).catch(() => null);

      if (speechRes?.ok) {
        return {
          audioBuffer: Buffer.from(await speechRes.arrayBuffer()),
          contentType: speechRes.headers.get("content-type") || "audio/wav",
          engine: "local",
          model,
        };
      }
    }

    try {
      const result = await callMiMoChatTts({
        baseUrl,
        model,
        voice,
        stylePrompt,
        text,
        apiKey: null,
        fetchImpl: doFetch,
      });
      return { ...result, engine: "local" };
    } catch (chatErr) {
      const speechRes = await doFetch(resolveSpeechEndpoint(baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: text,
          voice,
          speed,
          instructions: stylePrompt,
          response_format: "wav",
        }),
      }).catch(() => null);

      if (speechRes?.ok) {
        return {
          audioBuffer: Buffer.from(await speechRes.arrayBuffer()),
          contentType: speechRes.headers.get("content-type") || "audio/wav",
          engine: "local",
          model,
        };
      }

      throw new Error(
        `本地语音服务 (${baseUrl}) 连接失败：${
          chatErr instanceof Error ? chatErr.message : "请确认已启动本地推理服务"
        }`
      );
    }
  }

  const rawProvider =
    (input.provider as string | undefined) ??
    (settings.cloudTtsProvider as string | undefined) ??
    "doubao-tts";
  const preset = getCloudTtsPreset(rawProvider);
  const provider = preset.id;
  const apiKey = resolveCloudTtsApiKey(provider, input.apiKey);

  if (preset.requiresKey !== false && !apiKey) {
    throw new Error(
      `尚未配置 ${preset.label} 的 API Key，请在「偏好设置 → 语音播报 (TTS)」中填写`
    );
  }

  if (provider === "edge-tts" && !input.fetchImpl) {
    const edgeAudio = synthesizeWithEdgeCli({
      text,
      voice: input.voice ?? settings.cloudTtsVoice ?? "zh-CN-XiaoxiaoNeural",
      speed,
    });
    if (edgeAudio) return edgeAudio;
    return synthesizeWithMacSystemVoice({
      text,
      voice: settings.localTtsVoice ?? "Tingting",
      speed,
    });
  }

  const sameAsSavedProvider = provider === settings.cloudTtsProvider;
  const baseUrl = (
    input.baseUrl?.trim() ||
    (sameAsSavedProvider ? settings.cloudTtsBaseUrl : preset.baseUrl) ||
    preset.baseUrl
  ).replace(/\/+$/, "");
  const model =
    input.model?.trim() ||
    (sameAsSavedProvider ? settings.cloudTtsModel : preset.defaultModel) ||
    preset.defaultModel;
  const voice =
    input.voice?.trim() ||
    (sameAsSavedProvider ? settings.cloudTtsVoice : preset.voices[0].value) ||
    preset.voices[0].value;

  if (preset.protocol === "xiaomi-mimo") {
    return callMiMoChatTts({
      baseUrl,
      model,
      voice,
      stylePrompt: input.stylePrompt ?? settings.localTtsVoiceStyle,
      text,
      apiKey,
      fetchImpl: doFetch,
    });
  }

  if (preset.protocol === "doubao") {
    return callDoubaoTts({
      baseUrl,
      model,
      voice,
      speed,
      text,
      apiKey: apiKey!,
      fetchImpl: doFetch,
    });
  }

  if (preset.protocol === "qwen-dashscope") {
    return callQwenDashScopeTts({
      baseUrl,
      model,
      voice,
      speed,
      text,
      apiKey: apiKey!,
      fetchImpl: doFetch,
    });
  }

  if (preset.protocol === "minimax") {
    return callMiniMaxTts({
      baseUrl,
      model,
      voice,
      speed,
      text,
      apiKey: apiKey!,
      fetchImpl: doFetch,
    });
  }

  if (preset.protocol === "elevenlabs") {
    return callElevenLabsTts({
      baseUrl,
      model,
      voice,
      text,
      apiKey: apiKey!,
      fetchImpl: doFetch,
    });
  }

  if (preset.protocol === "fish-audio") {
    return callFishAudioTts({
      baseUrl,
      model,
      voice,
      text,
      apiKey: apiKey!,
      fetchImpl: doFetch,
    });
  }

  return callOpenAiSpeechTts({
    provider,
    label: preset.label,
    baseUrl,
    model,
    voice,
    speed,
    text,
    apiKey: apiKey!,
    fetchImpl: doFetch,
  });
}
