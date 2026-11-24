import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatTime } from "@/components/arbok/mock-data";
import type {
  AiGuide,
  AppSettings,
  ChatMessage,
  Episode,
  GuideTemplateId,
  LlmProviderId,
  TranscriptSegment,
  TranslationPairId,
} from "@/components/arbok/types";
import {
  GUIDE_TEMPLATE_PRESETS,
  getLlmPreset,
  getTranslationPairPreset,
  isLocalAiProviderId,
} from "@/lib/arbok/providers";
import {
  appendChatMessage,
  getAppSettings,
  getEpisodeById,
  saveAiGuide,
  saveSegmentTranslations,
} from "./db";
import { resolveBinary } from "./env";
import { getSecret } from "./keychain";
import { proxyFetch } from "./proxy";

export interface LlmRuntimeConfig {
  provider: LlmProviderId;
  model: string;
  baseUrl: string;
  apiKey: string | null;
  protocol: "openai" | "gemini" | "claude" | "cli";
  requiresKey: boolean;
}

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class MissingApiKeyError extends Error {
  readonly code = "MISSING_API_KEY";
  constructor(provider: string) {
    super(
      `尚未配置 ${provider} 的 API Key，请在「偏好设置 → AI 翻译」中填写，或切换至本机 AI（Claude Code / Codex / Antigravity）。`
    );
    this.name = "MissingApiKeyError";
  }
}

export function resolveLlmConfig(
  overrides?: Partial<{
    provider: LlmProviderId;
    model: string;
    baseUrl: string;
    apiKey: string;
  }>,
  settings?: AppSettings
): LlmRuntimeConfig {
  const current = settings ?? getAppSettings();
  const provider = overrides?.provider ?? current.llmProvider;
  const preset = getLlmPreset(provider);
  const cliModelMode = isLocalAiProviderId(provider)
    ? current.localAiConfigs?.[provider]?.modelMode
    : undefined;
  const model =
    overrides?.model?.trim() ||
    cliModelMode ||
    (provider === current.llmProvider ? current.llmModel : preset.defaultModel) ||
    preset.defaultModel;
  const baseUrl = (
    overrides?.baseUrl?.trim() ||
    (provider === current.llmProvider ? current.llmBaseUrl : preset.baseUrl) ||
    preset.baseUrl
  ).replace(/\/+$/, "");
  const apiKey = overrides?.apiKey?.trim() || getSecret(`llm:${provider}`);

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    protocol: preset.protocol,
    requiresKey: preset.requiresKey,
  };
}

function assertKeyPresent(cfg: LlmRuntimeConfig): void {
  if (cfg.requiresKey && !cfg.apiKey) {
    throw new MissingApiKeyError(cfg.provider);
  }
}

function resolveLocalCliBinary(provider: LlmProviderId): string | null {
  const home = process.env.HOME ?? "";
  if (provider === "claude-code") {
    return resolveBinary([
      path.join(home, ".local", "bin", "claude"),
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
      "claude",
    ]);
  }
  if (provider === "codex") {
    return resolveBinary([
      path.join(home, ".local", "bin", "codex"),
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      "codex",
    ]);
  }
  if (provider === "antigravity") {
    return resolveBinary([
      path.join(home, ".local", "bin", "agy"),
      "/opt/homebrew/bin/agy",
      "/usr/local/bin/agy",
      "agy",
      "antigravity",
    ]);
  }
  return null;
}

async function runLocalCliLlm(
  cfg: LlmRuntimeConfig,
  messages: LlmChatMessage[],
  signal?: AbortSignal
): Promise<string> {
  const preset = getLlmPreset(cfg.provider);
  const bin = resolveLocalCliBinary(cfg.provider);
  if (!bin) {
    throw new Error(
      `未检测到本机 ${preset.shortName} CLI，请先安装并登录对应客户端。`
    );
  }
  const prompt = messages
    .map((m) =>
      m.role === "system"
        ? `[System]\n${m.content}`
        : m.role === "assistant"
          ? `[Assistant]\n${m.content}`
          : m.content
    )
    .join("\n\n");

  const explicitModel = cfg.model && cfg.model !== "auto" ? cfg.model : "";

  const args =
    cfg.provider === "claude-code"
      ? ["-p", "--tools", "", ...(explicitModel ? ["--model", explicitModel] : []), prompt]
      : cfg.provider === "codex"
        ? [
            "exec",
            "--sandbox",
            "read-only",
            "--skip-git-repo-check",
            ...(explicitModel ? ["-m", explicitModel] : []),
            prompt,
          ]
        : ["ask", ...(explicitModel ? ["--model", explicitModel] : []), prompt];

  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-cli-sandbox-"));
  const cleanup = () => {
    try {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors.
    }
  };

  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      bin,
      args,
      {
        cwd: sandboxDir,
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        signal,
      },
      (err, stdout, stderr) => {
        cleanup();
        if (err) {
          const detail = stderr?.trim() || err.message;
          reject(new Error(`${preset.shortName} 调用失败：${detail.slice(0, 220)}`));
          return;
        }
        resolve(stdout.trim());
      }
    );
    child.stdin?.end();
  });
}

export async function completeLlm(
  cfg: LlmRuntimeConfig,
  messages: LlmChatMessage[],
  options?: {
    temperature?: number;
    jsonMode?: boolean;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  }
): Promise<string> {
  assertKeyPresent(cfg);
  if (cfg.protocol === "cli" && !/^https?:\/\//i.test(cfg.baseUrl)) {
    return runLocalCliLlm(cfg, messages, options?.signal);
  }
  const doFetch = options?.fetchImpl ?? proxyFetch;

  if (cfg.protocol === "gemini") {
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const url = `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey ?? "")}`;
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options?.signal,
      body: JSON.stringify({
        ...(systemMsg
          ? { systemInstruction: { parts: [{ text: systemMsg }] } }
          : {}),
        contents,
        generationConfig: {
          temperature: options?.temperature ?? 0.3,
          ...(options?.jsonMode
            ? { responseMimeType: "application/json" }
            : {}),
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini 请求失败 (${res.status}): ${(await res.text()).slice(0, 220)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? ""
    );
  }

  if (cfg.protocol === "claude") {
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await doFetch(`${cfg.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      signal: options?.signal,
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4096,
        temperature: options?.temperature ?? 0.3,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages: chatMsgs,
      }),
    });
    if (!res.ok) {
      throw new Error(`Claude 请求失败 (${res.status}): ${(await res.text()).slice(0, 220)}`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return (
      data.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("") ?? ""
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  const bodyPayload: Record<string, unknown> = {
    model: cfg.model,
    temperature: options?.temperature ?? 0.3,
    messages,
  };
  if (options?.jsonMode) {
    bodyPayload.response_format = { type: "json_object" };
  }
  if (cfg.provider === "zhipu" && options?.jsonMode) {
    bodyPayload.thinking = { type: "disabled" };
  }

  let res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    signal: options?.signal,
    body: JSON.stringify(bodyPayload),
  });
  if (!res.ok && res.status === 400 && (bodyPayload.response_format || bodyPayload.thinking)) {
    delete bodyPayload.response_format;
    delete bodyPayload.thinking;
    res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      signal: options?.signal,
      body: JSON.stringify(bodyPayload),
    });
  }
  if (!res.ok) {
    throw new Error(`${cfg.provider} 请求失败 (${res.status}): ${(await res.text()).slice(0, 220)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  return (
    data.choices?.[0]?.message?.content?.trim() ||
    data.choices?.[0]?.message?.reasoning_content?.trim() ||
    ""
  );
}

export async function streamLlm(
  cfg: LlmRuntimeConfig,
  messages: LlmChatMessage[],
  onDelta: (chunk: string) => void,
  options?: {
    temperature?: number;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  }
): Promise<string> {
  assertKeyPresent(cfg);
  const doFetch = options?.fetchImpl ?? proxyFetch;

  if (
    cfg.protocol === "gemini" ||
    (cfg.protocol === "cli" && !/^https?:\/\//i.test(cfg.baseUrl))
  ) {
    const full = await completeLlm(cfg, messages, options);
    for (let i = 0; i < full.length; i += 24) {
      onDelta(full.slice(i, i + 24));
    }
    return full;
  }

  if (cfg.protocol === "claude") {
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await doFetch(`${cfg.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      signal: options?.signal,
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 4096,
        stream: true,
        temperature: options?.temperature ?? 0.4,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages: chatMsgs,
      }),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Claude 流式请求失败 (${res.status})`);
    }
    return consumeSseStream(res.body, (json) => {
      const ev = json as { type?: string; delta?: { text?: string } };
      return ev.type === "content_block_delta" ? ev.delta?.text ?? "" : "";
    }, onDelta);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  const res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    signal: options?.signal,
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      temperature: options?.temperature ?? 0.4,
      messages,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`${cfg.provider} 流式请求失败 (${res.status})`);
  }

  return consumeSseStream(res.body, (json) => {
    const chunk = json as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return chunk.choices?.[0]?.delta?.content ?? "";
  }, onDelta);
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  extractText: (parsed: unknown) => string,
  onDelta: (chunk: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        const delta = extractText(parsed);
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // Ignore partial SSE keepalive payloads.
      }
    }
  }
  return full;
}

export async function testLlmConnection(
  overrides?: Partial<{
    provider: LlmProviderId;
    model: string;
    baseUrl: string;
    apiKey: string;
  }>,
  fetchImpl?: typeof fetch
): Promise<{ ok: boolean; latencyMs: number; model: string; message: string }> {
  const cfg = resolveLlmConfig(overrides);
  const start = Date.now();
  try {
    const reply = await completeLlm(
      cfg,
      [
        { role: "system", content: "Reply with OK only." },
        { role: "user", content: "ping" },
      ],
      { temperature: 0, fetchImpl }
    );
    const latencyMs = Math.max(1, Date.now() - start);
    return {
      ok: true,
      latencyMs,
      model: cfg.model,
      message: `连接成功（${cfg.model}，延迟 ${latencyMs}ms，回复：${reply.trim().slice(0, 24) || "OK"}）`,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      model: cfg.model,
      message: err instanceof Error ? err.message : "连接测试失败",
    };
  }
}

export function extractJsonObject<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error("模型未返回有效 JSON 结构");
  }
  return JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as T;
}

export interface TranslationBatchEvent {
  segments: Array<{ id: number; zh: string }>;
  completed: number;
  total: number;
  fromCache: boolean;
}

function isUntranslatedEcho(
  orig: string,
  translated: string,
  targetIsChinese: boolean
): boolean {
  if (!targetIsChinese) return false;
  const cleanOrig = orig.trim();
  const cleanZh = translated.trim();
  if (!cleanZh) return true;
  const hasCjk = /[\u4e00-\u9fff]/.test(cleanZh);
  const origLetters = (cleanOrig.match(/[A-Za-zÀ-ÿ\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length;
  if (!hasCjk && origLetters >= 8 && cleanZh.toLowerCase() === cleanOrig.toLowerCase()) {
    return true;
  }
  return false;
}

function parseTranslationItems(
  raw: string,
  targetIdSet: Set<number>,
  origById: Map<number, string>,
  targetIsChinese: boolean
): Array<{ id: number; zh: string }> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  let rawList: Array<Record<string, unknown>> = [];
  if (cleaned.startsWith("[")) {
    const arr = JSON.parse(cleaned) as unknown;
    if (Array.isArray(arr)) {
      rawList = arr as Array<Record<string, unknown>>;
    }
  } else {
    const obj = extractJsonObject<{
      translations?: Array<Record<string, unknown>>;
      items?: Array<Record<string, unknown>>;
      results?: Array<Record<string, unknown>>;
    }>(cleaned);
    rawList = obj.translations ?? obj.items ?? obj.results ?? [];
  }

  const dedup = new Map<number, string>();
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const id = Number(item.id);
    if (!Number.isFinite(id) || !targetIdSet.has(id)) continue;
    const rawText =
      item.zh ?? item.translation ?? item.translated ?? item.text ?? item.target;
    if (typeof rawText !== "string") continue;
    const zh = rawText.trim();
    if (!zh) continue;
    const orig = origById.get(id) ?? "";
    if (isUntranslatedEcho(orig, zh, targetIsChinese)) continue;
    dedup.set(id, zh);
  }

  return [...dedup.entries()].map(([id, zh]) => ({ id, zh }));
}

export async function translateEpisodeTranscript(
  episodeId: string,
  options?: {
    force?: boolean;
    translationPair?: TranslationPairId;
    batchSize?: number;
    contextWindow?: number;
    concurrency?: number;
    fetchImpl?: typeof fetch;
    onBatch?: (event: TranslationBatchEvent) => void;
    signal?: AbortSignal;
  }
): Promise<{
  total: number;
  translatedNow: number;
  cachedCount: number;
  segments: TranscriptSegment[];
}> {
  const ep = getEpisodeById(episodeId);
  if (!ep) throw new Error(`未找到单集 ${episodeId}`);
  if (ep.transcript.length === 0) {
    throw new Error("该单集尚无字幕，请先获取或转写字幕");
  }

  const settings = getAppSettings();
  const pairPreset = getTranslationPairPreset(
    options?.translationPair ?? settings.translationPair
  );

  const all = ep.transcript;
  if (pairPreset.id === "off") {
    return {
      total: all.length,
      translatedNow: 0,
      cachedCount: all.filter((s) => Boolean(s.zh?.trim())).length,
      segments: all,
    };
  }
  const force = options?.force ?? false;
  const pendingIndices: number[] = [];
  const translatedIdsSet = new Set<number>();

  all.forEach((seg, idx) => {
    if (!force && seg.zh?.trim()) {
      translatedIdsSet.add(seg.id);
    } else {
      pendingIndices.push(idx);
    }
  });

  const cachedCount = translatedIdsSet.size;

  if (pendingIndices.length === 0) {
    options?.onBatch?.({
      segments: all.map((s) => ({ id: s.id, zh: s.zh ?? "" })),
      completed: all.length,
      total: all.length,
      fromCache: true,
    });
    return {
      total: all.length,
      translatedNow: 0,
      cachedCount,
      segments: all,
    };
  }

  const translateProvider =
    settings.llmTranslateProvider && settings.llmTranslateProvider !== "default"
      ? settings.llmTranslateProvider
      : settings.llmProvider;
  const cfg = resolveLlmConfig(
    translateProvider !== settings.llmProvider
      ? { provider: translateProvider }
      : undefined,
    settings
  );
  assertKeyPresent(cfg);

  const batchSize = options?.batchSize ?? 12;
  const contextWindow = options?.contextWindow ?? 2;
  const concurrency = Math.max(1, Math.min(3, options?.concurrency ?? 2));

  const batches: number[][] = [];
  for (let i = 0; i < pendingIndices.length; i += batchSize) {
    batches.push(pendingIndices.slice(i, i + batchSize));
  }

  let translatedNow = 0;
  let cursor = 0;
  let lastBatchError: Error | null = null;

  async function translateSubset(
    indices: number[],
    backfillAttempt = 0
  ): Promise<void> {
    if (indices.length === 0) return;
    if (options?.signal?.aborted) return;

    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];
    const prevContext = all
      .slice(Math.max(0, firstIdx - contextWindow), firstIdx)
      .map((s) => s.orig);
    const nextContext = all
      .slice(lastIdx + 1, Math.min(all.length, lastIdx + 1 + contextWindow))
      .map((s) => s.orig);
    const targets = indices.map((i) => ({ id: all[i].id, text: all[i].orig }));
    const targetIdSet = new Set(targets.map((t) => t.id));
    const origById = new Map(targets.map((t) => [t.id, t.text]));

    const strictNote =
      backfillAttempt > 0
        ? `【补漏要求】以下 ${targets.length} 条是上一轮遗漏的句子，必须 100% 逐条翻译，返回恰好 ${targets.length} 条记录，绝不可跳过任何一条 id。`
        : `必须严格一对一返回 targets 中全部 ${targets.length} 条 id，不可合并、不可跳过或遗漏任何一条。`;

    const prompt = [
      `你是专业播客与技术视频字幕译者。请将 targets 数组中的每句原文（源语言：${pairPreset.sourceLabel}）翻译为${pairPreset.targetLabel}。`,
      "必须参考 prevContext 和 nextContext 保持代词指代、口语断句和专业术语连贯，但只翻译 targets 中的句子。",
      strictNote,
      '仅返回严格 JSON：{"translations":[{"id":数字,"zh":"译文"}]}，不要包含额外解释。',
      JSON.stringify({ prevContext, targets, nextContext }),
    ].join("\n\n");

    let valid: Array<{ id: number; zh: string }> = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (options?.signal?.aborted) return;
      try {
        const raw = await completeLlm(
          cfg,
          [
            {
              role: "system",
              content:
                "你是严谨的双语字幕翻译引擎，严格逐条对齐每个 id，绝不漏翻，只输出严格 JSON。",
            },
            { role: "user", content: prompt },
          ],
          {
            temperature: 0.2,
            jsonMode: true,
            fetchImpl: options?.fetchImpl,
            signal: options?.signal,
          }
        );
        valid = parseTranslationItems(
          raw,
          targetIdSet,
          origById,
          pairPreset.targetIsChinese
        );
        if (valid.length > 0) break;
      } catch (err) {
        lastBatchError =
          err instanceof Error ? err : new Error("批次翻译请求失败");
        if (attempt < 2 && !options?.signal?.aborted) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        }
      }
    }

    if (valid.length > 0) {
      saveSegmentTranslations(episodeId, valid);
      for (const item of valid) {
        if (!translatedIdsSet.has(item.id)) {
          translatedIdsSet.add(item.id);
          translatedNow += 1;
        }
      }
      options?.onBatch?.({
        segments: valid,
        completed: Math.min(all.length, translatedIdsSet.size),
        total: all.length,
        fromCache: false,
      });
    }

    const missingIndices = indices.filter(
      (idx) => !translatedIdsSet.has(all[idx].id)
    );
    if (missingIndices.length > 0 && backfillAttempt < 2 && !options?.signal?.aborted) {
      const subChunkSize = backfillAttempt === 0 ? 5 : 2;
      for (let m = 0; m < missingIndices.length; m += subChunkSize) {
        await translateSubset(
          missingIndices.slice(m, m + subChunkSize),
          backfillAttempt + 1
        );
      }
    }
  }

  async function worker(): Promise<void> {
    while (cursor < batches.length) {
      if (options?.signal?.aborted) break;
      const currentIdx = cursor++;
      await translateSubset(batches[currentIdx], 0);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
  );

  if (translatedNow === 0 && lastBatchError) {
    throw lastBatchError;
  }

  const updated = getEpisodeById(episodeId);
  return {
    total: all.length,
    translatedNow,
    cachedCount,
    segments: updated?.transcript ?? all,
  };
}

export function formatCompactTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTime(s.start)}] ${s.orig}${s.zh ? ` (${s.zh})` : ""}`)
    .join("\n");
}

function formatSingleLangTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTime(s.start)}] ${s.zh?.trim() || s.orig}`)
    .join("\n");
}

function parseTimestampSec(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/^\[|\]$/g, "");
    if (/^\d+(\.\d+)?$/.test(cleaned)) {
      return Math.max(0, Math.round(Number(cleaned)));
    }
    const parts = cleaned.split(":").map((p) => Number(p));
    if (parts.length === 2 && parts.every(Number.isFinite)) {
      return Math.max(0, Math.round(parts[0] * 60 + parts[1]));
    }
    if (parts.length === 3 && parts.every(Number.isFinite)) {
      return Math.max(
        0,
        Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
      );
    }
  }
  return 0;
}

const MAX_DIRECT_TRANSCRIPT_CHARS = 48_000;

export async function generateEpisodeGuide(
  episodeId: string,
  options?: {
    templateId?: GuideTemplateId;
    customPrompt?: string;
    force?: boolean;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  }
): Promise<{ guide: AiGuide; fromCache: boolean }> {
  const ep = getEpisodeById(episodeId);
  if (!ep) throw new Error(`未找到单集 ${episodeId}`);
  if (ep.transcript.length === 0) {
    throw new Error("该单集尚无字幕，请先获取或转写字幕后再生成导读");
  }

  const settings = getAppSettings();
  const templateId = options?.templateId ?? settings.guideTemplate ?? "deep";
  if (!options?.force && ep.guide && ep.guide.templateId === templateId) {
    return { guide: ep.guide, fromCache: true };
  }

  const guideProvider =
    settings.llmGuideProvider && settings.llmGuideProvider !== "default"
      ? settings.llmGuideProvider
      : settings.llmProvider;
  const cfg = resolveLlmConfig(
    guideProvider !== settings.llmProvider
      ? { provider: guideProvider }
      : undefined,
    settings
  );
  assertKeyPresent(cfg);

  const preset = GUIDE_TEMPLATE_PRESETS.find((t) => t.id === templateId);
  const templateInstruction =
    templateId === "custom"
      ? options?.customPrompt?.trim() ||
        settings.customGuidePrompt?.trim() ||
        GUIDE_TEMPLATE_PRESETS[0].instruction
      : preset?.instruction ?? GUIDE_TEMPLATE_PRESETS[0].instruction;

  let transcriptContext = formatSingleLangTranscript(ep.transcript);

  if (transcriptContext.length > MAX_DIRECT_TRANSCRIPT_CHARS) {
    const chunkCount = Math.min(
      4,
      Math.max(2, Math.ceil(transcriptContext.length / MAX_DIRECT_TRANSCRIPT_CHARS))
    );
    const chunkSize = Math.ceil(ep.transcript.length / chunkCount);
    const slices: TranscriptSegment[][] = [];
    for (let i = 0; i < ep.transcript.length; i += chunkSize) {
      slices.push(ep.transcript.slice(i, i + chunkSize));
    }
    const sectionSummaries = await Promise.all(
      slices.map((slice) =>
        completeLlm(
          cfg,
          [
            {
              role: "system",
              content:
                "你是长播客分段提炼助手。请保留关键时间戳 [MM:SS]，用简洁的简体中文要点提炼该分段的核心讨论内容、论点与数据（400字以内）。",
            },
            {
              role: "user",
              content: formatSingleLangTranscript(slice),
            },
          ],
          {
            temperature: 0.2,
            fetchImpl: options?.fetchImpl,
            signal: options?.signal,
          }
        )
      )
    );
    transcriptContext = sectionSummaries.join("\n\n---\n\n");
  }

  const prompt = [
    `单集标题：${ep.title}`,
    `频道：${ep.channel}`,
    `总时长：${formatTime(ep.durationSec)}`,
    `导读风格要求：${templateInstruction}`,
    "",
    "请严格基于以下带时间戳的字幕文稿，输出简体中文 JSON：",
    "{",
    '  "tldr": "一句话高密度总结（60-120字）",',
    '  "timeline": [{ "start": 秒数(整数), "title": "章节标题", "summary": "1-2句要点" }],',
    '  "takeaways": ["核心观点1", "核心观点2", "核心观点3"],',
    '  "highlights": [{ "start": 开始秒数, "end": 结束秒数, "reason": "推荐先听这一段的理由" }]',
    "}",
    "",
    "文稿内容：",
    transcriptContext,
  ].join("\n");

  const raw = await completeLlm(
    cfg,
    [
      {
        role: "system",
        content:
          "你是 Arbok AI 导读引擎。严格依据提供的字幕文稿与时间戳提炼结构化导读，绝不编造不存在的内容，只输出有效 JSON。",
      },
      { role: "user", content: prompt },
    ],
    {
      temperature: 0.3,
      jsonMode: true,
      fetchImpl: options?.fetchImpl,
      signal: options?.signal,
    }
  );

  const parsed = extractJsonObject<{
    tldr?: string;
    timeline?: Array<{ start: unknown; title?: string; summary?: string }>;
    takeaways?: unknown[];
    highlights?: Array<{ start: unknown; end: unknown; reason?: string }>;
  }>(raw);

  const guide: AiGuide = {
    modelName: cfg.model,
    templateId,
    tldr: parsed.tldr?.trim() || `围绕《${ep.title}》生成的结构化导读。`,
    timeline: Array.isArray(parsed.timeline)
      ? parsed.timeline
          .map((item) => ({
            start: parseTimestampSec(item.start),
            title: String(item.title ?? "").trim(),
            summary: String(item.summary ?? "").trim(),
          }))
          .filter((item) => item.title.length > 0)
      : [],
    takeaways: Array.isArray(parsed.takeaways)
      ? parsed.takeaways.map((t) => String(t ?? "").trim()).filter(Boolean)
      : [],
    highlights: Array.isArray(parsed.highlights)
      ? parsed.highlights
          .map((h) => {
            const start = parseTimestampSec(h.start);
            const rawEnd = parseTimestampSec(h.end);
            return {
              start,
              end: rawEnd > start ? rawEnd : start + 45,
              reason: String(h.reason ?? "").trim(),
            };
          })
          .filter((h) => h.reason.length > 0)
      : [],
  };

  saveAiGuide(episodeId, guide);
  return { guide, fromCache: false };
}

export function selectTranscriptContextForQuestion(
  ep: Episode,
  question: string,
  maxChars = MAX_DIRECT_TRANSCRIPT_CHARS
): string {
  const full = formatCompactTranscript(ep.transcript);
  if (full.length <= maxChars) return full;

  const keywords = question
    .toLowerCase()
    .split(/[\s,，。？！?!、;；:：]+/)
    .filter((w) => w.length >= 2);

  const formattedLines = ep.transcript.map(
    (s) => `[${formatTime(s.start)}] ${s.orig}${s.zh ? ` (${s.zh})` : ""}`
  );

  const scored = ep.transcript
    .map((seg, idx) => {
      const haystack = `${seg.orig} ${seg.zh ?? ""}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 3;
      }
      return { idx, score };
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const picked = new Set<number>();
  let usedChars = 0;

  const tryAdd = (idx: number): boolean => {
    if (idx < 0 || idx >= ep.transcript.length || picked.has(idx)) return false;
    const len = formattedLines[idx].length + 1;
    if (picked.size > 0 && usedChars + len > maxChars) return false;
    picked.add(idx);
    usedChars += len;
    return true;
  };

  for (const { idx } of scored) {
    if (usedChars >= maxChars) break;
    const added = tryAdd(idx);
    if (added) {
      tryAdd(idx - 1);
      tryAdd(idx + 1);
    }
  }

  return [...picked]
    .sort((a, b) => a - b)
    .map((idx) => formattedLines[idx])
    .join("\n")
    .slice(0, maxChars);
}

export async function streamEpisodeChat(
  episodeId: string,
  question: string,
  onDelta: (delta: string) => void,
  options?: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  }
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  const ep = getEpisodeById(episodeId);
  if (!ep) throw new Error(`未找到单集 ${episodeId}`);
  if (ep.transcript.length === 0) {
    throw new Error("该单集尚无字幕，请先获取或转写字幕后再向 AI 提问");
  }

  const cfg = resolveLlmConfig();
  assertKeyPresent(cfg);

  const contextText = selectTranscriptContextForQuestion(ep, question);
  const systemPrompt = [
    "你是 Arbok 单集问答助手。请严格基于下方提供的带时间戳字幕回答用户问题。",
    "规则：",
    "1. 回答必须使用简体中文，清晰、简洁、有条理。",
    "2. 凡引用文稿观点、数据或原话处，必须在正文中用 [MM:SS] 格式标注对应时间戳（例如 [01:45]），方便用户点击跳转原声核对。",
    "3. 若文稿未提及，请明确说明「本期文稿中未提及此细节」。",
    "",
    `单集：${ep.title}（${ep.channel}）`,
    "字幕文稿：",
    contextText,
  ].join("\n");

  const history: LlmChatMessage[] = ep.chat.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const userMessage: ChatMessage = {
    id: `u-${Date.now()}`,
    role: "user",
    content: question,
  };
  appendChatMessage(episodeId, userMessage);

  const replyText = await streamLlm(
    cfg,
    [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: question },
    ],
    onDelta,
    {
      temperature: 0.35,
      fetchImpl: options?.fetchImpl,
      signal: options?.signal,
    }
  );

  const assistantMessage: ChatMessage = {
    id: `a-${Date.now() + 1}`,
    role: "assistant",
    content: replyText.trim(),
  };
  appendChatMessage(episodeId, assistantMessage);

  return { userMessage, assistantMessage };
}
