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
    Math.min(340, Math.round(190 * (params.speed && params.speed > 0 ? params.speed : 1)))
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
  const doFetch = input.fetchImpl ?? proxyFetch;

  if (engine === "local") {
    const model =
      input.model?.trim() || settings.localTtsModelId || "system-enhanced";
    const speed = input.speed ?? settings.ttsSpeed ?? 1;

    if (model === "system-enhanced" && !input.fetchImpl) {
      return synthesizeWithMacSystemVoice({
        text,
        voice: input.voice ?? settings.localTtsVoice ?? "Tingting",
        speed,
      });
    }

    const baseUrl = (
      input.baseUrl?.trim() ||
      settings.localTtsBaseUrl ||
      "http://127.0.0.1:8000/v1"
    ).replace(/\/+$/, "");
    const stylePrompt = input.stylePrompt ?? settings.localTtsVoiceStyle;

    try {
      const result = await callMiMoChatTts({
        baseUrl,
        model,
        voice: input.voice ?? settings.cloudTtsVoice ?? "冰糖",
        stylePrompt,
        text,
        apiKey: null,
        fetchImpl: doFetch,
      });
      return { ...result, engine: "local" };
    } catch (chatErr) {
      /* Fallback to standard local /audio/speech OpenAI-compatible TTS server if present. */
      const speechRes = await doFetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: text,
          voice: input.voice ?? settings.cloudTtsVoice ?? "冰糖",
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

  const provider = input.provider ?? settings.cloudTtsProvider ?? "xiaomi-mimo";
  const preset = getCloudTtsPreset(provider);
  const apiKey = input.apiKey?.trim() || getSecret(`tts:${provider}`);
  if (preset.requiresKey !== false && !apiKey) {
    throw new Error(
      `尚未配置 ${preset.label} 的 API Key，请在「偏好设置 → 语音播报 (TTS)」中填写`
    );
  }

  if (provider === "edge-tts" && !input.fetchImpl) {
    return synthesizeWithMacSystemVoice({
      text,
      voice: settings.localTtsVoice ?? "Tingting",
      speed: input.speed ?? settings.ttsSpeed ?? 1,
    });
  }

  const baseUrl = (
    input.baseUrl?.trim() ||
    (provider === settings.cloudTtsProvider
      ? settings.cloudTtsBaseUrl
      : preset.baseUrl) ||
    preset.baseUrl
  ).replace(/\/+$/, "");
  const model = input.model?.trim() || settings.cloudTtsModel || preset.defaultModel;
  const voice = input.voice?.trim() || settings.cloudTtsVoice || preset.voices[0].value;

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

  const res = await doFetch(`${baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    throw new Error(`云端 TTS 请求失败 (${res.status})：${(await res.text()).slice(0, 220)}`);
  }
  return {
    audioBuffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "audio/mpeg",
    engine: "cloud",
    model,
  };
}
