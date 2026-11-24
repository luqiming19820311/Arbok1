// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  appendChatMessage,
  closeDbForTests,
  deleteNoteById,
  getAppSettings,
  getEpisodeById,
  listEpisodes,
  listNotes,
  saveAiGuide,
  saveAppSettings,
  saveSegmentTranslations,
  upsertNote,
} from "./db";
import {
  deleteSecret,
  getKeychainStatus,
  getSecret,
  maskSecret,
  resetMemoryKeychain,
  setSecret,
} from "./keychain";

let tmpDir = "";
let dbFile = "";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arbok-db-test-"));
  dbFile = path.join(tmpDir, "arbok.db");
  process.env.ARBOK_DB_PATH = dbFile;
  process.env.ARBOK_KEYCHAIN_MODE = "memory";
  closeDbForTests();
  resetMemoryKeychain();
});

afterEach(() => {
  closeDbForTests();
  delete process.env.ARBOK_DB_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("SQLite persists translations, AI guides, chat messages, notes, and settings across restarts", () => {
  const initial = listEpisodes();
  expect(initial.length).toBeGreaterThanOrEqual(5);

  const ep = initial.find((e) => e.id === "ep-yt-1")!;
  saveSegmentTranslations(ep.id, [{ id: ep.transcript[0].id, zh: "已持久化中文译文" }]);
  saveAiGuide(ep.id, {
    modelName: "deepseek-chat",
    templateId: "technical",
    tldr: "持久化导读测试",
    timeline: [{ start: 10, title: "第一章", summary: "摘要" }],
    takeaways: ["洞见 A"],
    highlights: [{ start: 10, end: 25, reason: "必听" }],
  });
  appendChatMessage(ep.id, {
    id: "chat-persist-1",
    role: "user",
    content: "测试持久化提问",
  });
  const savedNote = upsertNote({
    epId: ep.id,
    segId: ep.transcript[0].id,
    ts: 0,
    quote: ep.transcript[0].orig,
    body: "持久化单句笔记",
  });
  saveAppSettings({ llmProvider: "gemini", llmModel: "gemini-2.5-flash" });

  closeDbForTests();

  const reloaded = getEpisodeById(ep.id)!;
  expect(reloaded.transcript[0].zh).toBe("已持久化中文译文");
  expect(reloaded.guide?.tldr).toBe("持久化导读测试");
  expect(reloaded.guide?.templateId).toBe("technical");
  expect(reloaded.chat.some((m) => m.id === "chat-persist-1")).toBe(true);
  expect(listNotes(ep.id).some((n) => n.body === "持久化单句笔记")).toBe(true);
  expect(getAppSettings().llmProvider).toBe("gemini");

  deleteNoteById(savedNote.id);
  expect(listNotes(ep.id).some((n) => n.id === savedNote.id)).toBe(false);
});

test("API keys live strictly in keychain and never leak plaintext into SQLite", () => {
  const secretKey = "sk-arbok-super-secret-99887766";
  setSecret("llm:deepseek", secretKey);
  setSecret("asr:siliconflow", "sf-secret-11223344");
  setSecret("auth:bilibili", "bili-sessdata-xyz");

  expect(getSecret("llm:deepseek")).toBe(secretKey);
  expect(maskSecret(secretKey)).toBe("sk-a••••7766");

  const status = getKeychainStatus();
  expect(status.llmKeys.deepseek.configured).toBe(true);
  expect(status.llmKeys.deepseek.masked).toBe("sk-a••••7766");
  expect(status.asrKeys.siliconflow.configured).toBe(true);
  expect(status.biliCookieConfigured).toBe(true);

  saveAppSettings({
    llmProvider: "deepseek",
    ...({ apiKey: secretKey, llmApiKey: secretKey } as Record<string, string>),
  });

  closeDbForTests();
  const rawDbText = fs.readFileSync(dbFile).toString("latin1");
  expect(rawDbText).not.toContain(secretKey);

  deleteSecret("llm:deepseek");
  expect(getSecret("llm:deepseek")).toBeNull();
});
