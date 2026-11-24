// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  closeDbForTests,
  getEpisodeById,
  insertEpisode,
  replaceEpisodeTranscript,
  saveAppSettings,
} from "./db";
import { resetMemoryKeychain, setSecret } from "./keychain";
import {
  MissingApiKeyError,
  generateEpisodeGuide,
  selectTranscriptContextForQuestion,
  streamEpisodeChat,
  testLlmConnection,
  translateEpisodeTranscript,
} from "./llm";

let tmpDir = "";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-llm-test-"));
  process.env.ARBOK_DB_PATH = path.join(tmpDir, "arbok.db");
  process.env.ARBOK_KEYCHAIN_MODE = "memory";
  closeDbForTests();
  resetMemoryKeychain();
});

afterEach(() => {
  closeDbForTests();
  delete process.env.ARBOK_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("BYOK connection test supports OpenAI-compatible, Gemini native, Claude native, and keyless Ollama", async () => {
  const seenUrls: string[] = [];
  const mockFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seenUrls.push(url);
    if (url.includes("generativelanguage.googleapis.com")) {
      return makeJsonResponse({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
      });
    }
    if (url.includes("api.anthropic.com")) {
      return makeJsonResponse({
        content: [{ type: "text", text: "OK" }],
      });
    }
    return makeJsonResponse({
      choices: [{ message: { content: "OK" } }],
    });
  }) as typeof fetch;

  const missingKeyRes = await testLlmConnection(
    { provider: "deepseek" },
    mockFetch
  );
  expect(missingKeyRes.ok).toBe(false);
  expect(missingKeyRes.message).toContain("API Key");

  setSecret("llm:deepseek", "sk-ds-test");
  const dsRes = await testLlmConnection({ provider: "deepseek" }, mockFetch);
  expect(dsRes.ok).toBe(true);
  expect(dsRes.latencyMs).toBeGreaterThanOrEqual(1);

  setSecret("llm:gemini", "gm-test-key");
  const gmRes = await testLlmConnection({ provider: "gemini" }, mockFetch);
  expect(gmRes.ok).toBe(true);

  setSecret("llm:claude", "sk-ant-test");
  const claudeRes = await testLlmConnection({ provider: "claude" }, mockFetch);
  expect(claudeRes.ok).toBe(true);

  const ollamaRes = await testLlmConnection({ provider: "ollama" }, mockFetch);
  expect(ollamaRes.ok).toBe(true);

  expect(seenUrls.some((u) => u.includes("api.deepseek.com"))).toBe(true);
  expect(seenUrls.some((u) => u.includes("generativelanguage.googleapis.com"))).toBe(true);
  expect(seenUrls.some((u) => u.includes("api.anthropic.com/v1/messages"))).toBe(true);
  expect(seenUrls.some((u) => u.includes("127.0.0.1:11434"))).toBe(true);
});

test("chunked bilingual translation includes sliding context, persists batches, and hits SQLite cache with zero calls on second run", async () => {
  setSecret("llm:deepseek", "sk-ds-test");
  saveAppSettings({ llmProvider: "deepseek", llmModel: "deepseek-chat" });

  insertEpisode({
    id: "ep-en-trans",
    subId: null,
    platform: "youtube",
    channel: "Test",
    title: "English Episode",
    date: "刚刚",
    durationSec: 60,
    positionSec: 0,
    mediaType: "video",
    language: "en",
    hasOfficialSub: true,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: false,
    gradient: "linear-gradient(#111,#222)",
    coverLabel: "EN",
    pageUrl: "https://youtube.com/watch?v=test",
    transcript: [
      { id: 1, start: 0, end: 10, orig: "Sentence one." },
      { id: 2, start: 10, end: 20, orig: "Sentence two." },
      { id: 3, start: 20, end: 30, orig: "Sentence three." },
      { id: 4, start: 30, end: 40, orig: "Sentence four." },
      { id: 5, start: 40, end: 50, orig: "Sentence five." },
    ],
    guide: null,
    chat: [],
  });

  const capturedPayloads: Array<{
    prevContext: string[];
    targets: Array<{ id: number; text: string }>;
    nextContext: string[];
  }> = [];

  let fetchCalls = 0;
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    fetchCalls += 1;
    const reqBody = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string }>;
    };
    const userPrompt = reqBody.messages[1].content;
    const jsonPart = userPrompt.slice(userPrompt.indexOf('{"prevContext"'));
    const parsed = JSON.parse(jsonPart) as {
      prevContext: string[];
      targets: Array<{ id: number; text: string }>;
      nextContext: string[];
    };
    capturedPayloads.push(parsed);

    return makeJsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              translations: parsed.targets.map((t) => ({
                id: t.id,
                zh: `中文：${t.text}`,
              })),
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  const batches: number[] = [];
  const firstRun = await translateEpisodeTranscript("ep-en-trans", {
    batchSize: 2,
    contextWindow: 2,
    concurrency: 1,
    fetchImpl: mockFetch,
    onBatch: (ev) => batches.push(ev.completed),
  });

  expect(firstRun.translatedNow).toBe(5);
  expect(batches).toEqual([2, 4, 5]);
  expect(capturedPayloads[1].prevContext).toEqual(["Sentence one.", "Sentence two."]);
  expect(capturedPayloads[1].nextContext).toEqual(["Sentence five."]);
  expect(fetchCalls).toBe(3);

  const secondRun = await translateEpisodeTranscript("ep-en-trans", {
    fetchImpl: mockFetch,
  });
  expect(secondRun.translatedNow).toBe(0);
  expect(secondRun.cachedCount).toBe(5);
  expect(fetchCalls).toBe(3);
});

test("AI guide supports custom templates, Map-Reduce for long transcripts, and SQLite persistence", async () => {
  setSecret("llm:deepseek", "sk-ds-test");
  saveAppSettings({ llmProvider: "deepseek", llmModel: "deepseek-chat" });

  const longSegments = Array.from({ length: 120 }, (_, i) => ({
    start: i * 30,
    end: (i + 1) * 30,
    orig: `Segment ${i} discussing distributed systems and local-first architecture ${"x".repeat(420)}`,
  }));
  replaceEpisodeTranscript("ep-xyz-1", longSegments);

  let llmCalls = 0;
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    llmCalls += 1;
    const req = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string }>;
    };
    if (req.messages[0].content.includes("分段提炼")) {
      return makeJsonResponse({
        choices: [{ message: { content: "[00:30] 分段提炼摘要" } }],
      });
    }
    return makeJsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tldr: "长文稿 Map-Reduce 总结完成",
              timeline: [{ start: 30, title: "系统演进", summary: "核心演进路线" }],
              takeaways: ["观点 1", "观点 2"],
              highlights: [{ start: 30, end: 90, reason: "精华部分" }],
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  const result = await generateEpisodeGuide("ep-xyz-1", {
    templateId: "technical",
    force: true,
    fetchImpl: mockFetch,
  });

  expect(llmCalls).toBeGreaterThan(2);
  expect(result.guide.tldr).toBe("长文稿 Map-Reduce 总结完成");
  expect(getEpisodeById("ep-xyz-1")?.guide?.templateId).toBe("technical");
});

test("AI chat streams SSE tokens with [MM:SS] citations and persists conversation", async () => {
  await expect(
    streamEpisodeChat("ep-yt-1", "上下文工程是什么？", () => {})
  ).rejects.toBeInstanceOf(MissingApiKeyError);

  setSecret("llm:deepseek", "sk-ds-test");
  saveAppSettings({ llmProvider: "deepseek", llmModel: "deepseek-chat" });

  const encoder = new TextEncoder();
  const sseBody = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"根据 [00:29] 的论述，"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"LLM 上下文类似 RAM。"}}]}\n\n',
        "data: [DONE]\n\n",
      ];
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });

  const mockFetch = (async () =>
    new Response(sseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })) as typeof fetch;

  const deltas: string[] = [];
  const res = await streamEpisodeChat(
    "ep-yt-1",
    "上下文工程怎么比喻？",
    (delta) => deltas.push(delta),
    { fetchImpl: mockFetch }
  );

  expect(deltas.join("")).toBe("根据 [00:29] 的论述，LLM 上下文类似 RAM。");
  expect(res.assistantMessage.content).toContain("[00:29]");

  const ep = getEpisodeById("ep-yt-1")!;
  expect(ep.chat.at(-1)?.content).toContain("[00:29]");

  const retrieved = selectTranscriptContextForQuestion(ep, "SQLite RAM", 300);
  expect(retrieved).toContain("SQLite");
});

test("translation automatically retries transient failures, coerces string IDs, rejects untranslated echoes, and backfills missing lines to 100%", async () => {
  setSecret("llm:deepseek", "sk-ds-test");
  saveAppSettings({ llmProvider: "deepseek", llmModel: "deepseek-chat" });

  insertEpisode({
    id: "ep-backfill",
    subId: null,
    platform: "youtube",
    channel: "Test",
    title: "German Tech Talk",
    date: "刚刚",
    durationSec: 60,
    positionSec: 0,
    mediaType: "video",
    language: "en",
    hasOfficialSub: true,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: false,
    gradient: "linear-gradient(#111,#222)",
    coverLabel: "DE",
    pageUrl: "https://youtube.com/watch?v=de_test",
    transcript: [
      { id: 1, start: 0, end: 10, orig: "Guten Tag und willkommen zu diesem Vortrag." },
      { id: 2, start: 10, end: 20, orig: "Heute sprechen wir über lokale KI-Agenten." },
      { id: 3, start: 20, end: 30, orig: "Die Latenz sinkt dadurch fast auf Null." },
      { id: 4, start: 30, end: 40, orig: "Alle persönlichen Notizen bleiben auf Ihrem Mac." },
    ],
    guide: null,
    chat: [],
  });

  let callNum = 0;
  let sawGermanInstruction = false;
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    callNum += 1;
    const reqBody = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string }>;
    };
    const userPrompt = reqBody.messages[1].content;
    if (userPrompt.includes("德文")) sawGermanInstruction = true;

    const jsonPart = userPrompt.slice(userPrompt.indexOf('{"prevContext"'));
    const parsed = JSON.parse(jsonPart) as {
      targets: Array<{ id: number; text: string }>;
    };

    if (callNum === 1) {
      return new Response("Service Unavailable", { status: 503 });
    }

    if (callNum === 2) {
      /* Simulate LLM returning string ID for 1st item, untranslated echo for 2nd, and completely skipping 3rd & 4th! */
      return makeJsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [
                  { id: String(parsed.targets[0].id), zh: "大家好，欢迎来到今天的演讲。" },
                  { id: parsed.targets[1].id, zh: parsed.targets[1].text },
                ],
              }),
            },
          },
        ],
      });
    }

    /* Backfill call receives ONLY the 3 missing/echoed IDs and translates all of them. */
    return makeJsonResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              translations: parsed.targets.map((t) => ({
                id: t.id,
                zh: `已补翻：${t.text}`,
              })),
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  const result = await translateEpisodeTranscript("ep-backfill", {
    translationPair: "de-zh",
    batchSize: 4,
    concurrency: 1,
    fetchImpl: mockFetch,
  });

  expect(sawGermanInstruction).toBe(true);
  expect(callNum).toBe(3);
  expect(result.translatedNow).toBe(4);
  expect(result.segments.every((s) => Boolean(s.zh && s.zh.trim()))).toBe(true);
  expect(result.segments[0].zh).toBe("大家好，欢迎来到今天的演讲。");
  expect(result.segments[1].zh).toContain("已补翻");
  expect(result.segments[2].zh).toContain("已补翻");
  expect(result.segments[3].zh).toContain("已补翻");
});
