import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  INITIAL_EPISODES,
  INITIAL_NOTES,
  INITIAL_SUBSCRIPTIONS,
} from "@/components/arbok/mock-data";
import type {
  AiGuide,
  AppSettings,
  AsrJobState,
  ChatMessage,
  Episode,
  EpisodeNote,
  GlobalSearchHit,
  Platform,
  Subscription,
  TranscriptSegment,
} from "@/components/arbok/types";
import { DEFAULT_APP_SETTINGS } from "@/lib/arbok/providers";

let cachedDb: DatabaseSync | null = null;
let cachedPath: string | null = null;

export function getDatabasePath(): string {
  if (process.env.ARBOK_DB_PATH) {
    return process.env.ARBOK_DB_PATH;
  }
  const dataDir = process.env.ARBOK_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(dataDir, "arbok.db");
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      external_id TEXT,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      cover_url TEXT,
      source_url TEXT NOT NULL,
      gradient TEXT,
      short_label TEXT,
      playback_rate REAL DEFAULT 1.0,
      folder_id TEXT,
      last_synced_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      external_id TEXT,
      channel TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT,
      description TEXT,
      cover_url TEXT,
      gradient TEXT,
      cover_label TEXT,
      cover_kicker TEXT,
      page_url TEXT NOT NULL,
      date_label TEXT,
      duration_sec INTEGER DEFAULT 0,
      published_at INTEGER,
      play_position_sec REAL DEFAULT 0,
      is_finished INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      media_type TEXT DEFAULT 'audio',
      audio_url TEXT,
      video_url TEXT,
      stream_expires_at INTEGER,
      local_file_path TEXT,
      download_status TEXT DEFAULT 'none',
      subtitle_status TEXT DEFAULT 'none',
      is_bilingual INTEGER DEFAULT 0,
      language TEXT DEFAULT 'zh',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transcript_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      seq_index INTEGER NOT NULL,
      start_sec REAL NOT NULL,
      end_sec REAL NOT NULL,
      text_original TEXT NOT NULL,
      text_translated TEXT,
      speaker TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_segments_episode
      ON transcript_segments(episode_id, seq_index);

    CREATE TABLE IF NOT EXISTS ai_guides (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL UNIQUE REFERENCES episodes(id) ON DELETE CASCADE,
      model_name TEXT NOT NULL,
      template_id TEXT DEFAULT 'deep',
      tldr TEXT,
      timeline_json TEXT,
      takeaways_json TEXT,
      highlights_json TEXT,
      raw_markdown TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_episode
      ON ai_messages(episode_id, created_at);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      segment_id INTEGER REFERENCES transcript_segments(id) ON DELETE SET NULL,
      timestamp_sec REAL NOT NULL,
      quote_text TEXT NOT NULL,
      note_content TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asr_jobs (
      episode_id TEXT PRIMARY KEY REFERENCES episodes(id) ON DELETE CASCADE,
      engine TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      message TEXT DEFAULT '',
      completed_chunks INTEGER DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      checkpoint_json TEXT,
      error TEXT,
      updated_at INTEGER NOT NULL
    );
  `);

  const episodeCols = db
    .prepare("PRAGMA table_info(episodes)")
    .all() as Array<{ name: string }>;
  const colNames = new Set(episodeCols.map((c) => c.name));
  if (!colNames.has("audio_url")) {
    db.exec("ALTER TABLE episodes ADD COLUMN audio_url TEXT");
  }
  if (!colNames.has("video_url")) {
    db.exec("ALTER TABLE episodes ADD COLUMN video_url TEXT");
  }
  if (!colNames.has("stream_expires_at")) {
    db.exec("ALTER TABLE episodes ADD COLUMN stream_expires_at INTEGER");
  }
  const sourceCols = db
    .prepare("PRAGMA table_info(sources)")
    .all() as Array<{ name: string }>;
  const sourceColNames = new Set(sourceCols.map((c) => c.name));
  if (!sourceColNames.has("folder_id")) {
    db.exec("ALTER TABLE sources ADD COLUMN folder_id TEXT");
  }
  // Heal legacy rows where temporary ASR audio cache paths were mistakenly stored
  // as local_file_path (causing video episodes to serve audio-only MP3 in video mode).
  db.exec(`
    UPDATE episodes
    SET local_file_path = NULL
    WHERE download_status = 'none'
      AND (local_file_path LIKE '%/cache/audio/%' OR local_file_path LIKE '%\\cache\\audio\\%')
  `);
}

function seedIfEmpty(db: DatabaseSync): void {
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM episodes")
    .get() as { cnt: number };
  if (row.cnt > 0) return;

  const now = Date.now();
  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO sources
      (id, platform, title, source_url, gradient, short_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const sub of INITIAL_SUBSCRIPTIONS) {
    insertSource.run(
      sub.id,
      sub.platform,
      sub.name,
      `https://arbok.local/source/${sub.id}`,
      sub.gradient,
      sub.shortLabel,
      now
    );
  }

  const insertEpisode = db.prepare(`
    INSERT OR IGNORE INTO episodes (
      id, source_id, platform, channel, title, subtitle, gradient,
      cover_label, cover_kicker, page_url, date_label, duration_sec,
      play_position_sec, media_type, download_status, subtitle_status,
      is_bilingual, language, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSeg = db.prepare(`
    INSERT INTO transcript_segments
      (id, episode_id, seq_index, start_sec, end_sec, text_original, text_translated)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertGuide = db.prepare(`
    INSERT OR REPLACE INTO ai_guides
      (id, episode_id, model_name, template_id, tldr, timeline_json, takeaways_json, highlights_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMsg = db.prepare(`
    INSERT OR IGNORE INTO ai_messages
      (id, episode_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  INITIAL_EPISODES.forEach((ep, idx) => {
    insertEpisode.run(
      ep.id,
      ep.subId,
      ep.platform,
      ep.channel,
      ep.title,
      ep.subtitle ?? null,
      ep.gradient,
      ep.coverLabel,
      ep.coverKicker ?? null,
      ep.pageUrl,
      ep.date,
      ep.durationSec,
      ep.positionSec,
      ep.mediaType,
      ep.isOffline ? "completed" : "none",
      ep.hasOfficialSub ? "ready" : "none",
      ep.isBilingual ? 1 : 0,
      ep.language,
      now - idx * 1000
    );

    ep.transcript.forEach((seg, seqIdx) => {
      insertSeg.run(
        seg.id,
        ep.id,
        seqIdx,
        seg.start,
        seg.end,
        seg.orig,
        seg.zh ?? null
      );
    });

    if (ep.guide) {
      insertGuide.run(
        `guide-${ep.id}`,
        ep.id,
        "deepseek-chat",
        "deep",
        ep.guide.tldr,
        JSON.stringify(ep.guide.timeline),
        JSON.stringify(ep.guide.takeaways),
        JSON.stringify(ep.guide.highlights),
        now
      );
    }

    ep.chat.forEach((msg, msgIdx) => {
      insertMsg.run(msg.id, ep.id, msg.role, msg.content, now + msgIdx);
    });
  });

  const insertNote = db.prepare(`
    INSERT OR IGNORE INTO notes
      (id, episode_id, segment_id, timestamp_sec, quote_text, note_content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const note of INITIAL_NOTES) {
    insertNote.run(
      note.id,
      note.epId,
      note.segId,
      note.ts,
      note.quote,
      note.body,
      now,
      now
    );
  }
}

export function getDb(): DatabaseSync {
  const dbPath = getDatabasePath();
  if (cachedDb && cachedPath === dbPath) {
    return cachedDb;
  }

  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {
      // Ignore already closed handles.
    }
  }

  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  initSchema(db);
  seedIfEmpty(db);
  cachedDb = db;
  cachedPath = dbPath;
  return db;
}

export function closeDbForTests(): void {
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {
      // Ignore already closed handles.
    }
  }
  cachedDb = null;
  cachedPath = null;
}

export function listSubscriptions(): Subscription[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, platform, external_id, title, cover_url, source_url, gradient, short_label, playback_rate, folder_id FROM sources ORDER BY created_at ASC"
    )
    .all() as Array<{
    id: string;
    platform: Platform;
    external_id: string | null;
    title: string;
    cover_url: string | null;
    source_url: string;
    gradient: string | null;
    short_label: string | null;
    playback_rate: number | null;
    folder_id: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    externalId: r.external_id ?? undefined,
    name: r.title,
    coverUrl: r.cover_url ?? undefined,
    sourceUrl: r.source_url,
    gradient: r.gradient ?? "linear-gradient(135deg, #4338ca, #6366f1)",
    shortLabel: r.short_label ?? r.title.slice(0, 3),
    playbackRate:
      typeof r.playback_rate === "number" && r.playback_rate > 0
        ? r.playback_rate
        : 1,
    folderId: r.folder_id ?? null,
  }));
}

export function updateSubscriptionPlaybackRate(
  id: string,
  playbackRate: number
): void {
  const clamped = Math.max(0.5, Math.min(3, Number(playbackRate) || 1));
  getDb()
    .prepare("UPDATE sources SET playback_rate = ? WHERE id = ?")
    .run(clamped, id);
}

export function updateSubscriptionFolder(
  ids: string[],
  folderId: string | null
): void {
  if (ids.length === 0) return;
  const db = getDb();
  const stmt = db.prepare("UPDATE sources SET folder_id = ? WHERE id = ?");
  for (const id of ids) {
    stmt.run(folderId ?? null, id);
  }
}

export function renameSubscription(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  getDb()
    .prepare("UPDATE sources SET title = ?, short_label = ? WHERE id = ?")
    .run(trimmed, trimmed.slice(0, 3), id);
}

export function clearFolderFromSubscriptions(folderId: string): void {
  getDb()
    .prepare("UPDATE sources SET folder_id = NULL WHERE folder_id = ?")
    .run(folderId);
}

export function upsertSubscription(sub: Subscription): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sources (id, platform, external_id, title, cover_url, source_url, gradient, short_label, folder_id, last_synced_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      external_id = COALESCE(excluded.external_id, sources.external_id),
      title = excluded.title,
      cover_url = COALESCE(excluded.cover_url, sources.cover_url),
      source_url = excluded.source_url,
      gradient = excluded.gradient,
      short_label = excluded.short_label,
      folder_id = COALESCE(sources.folder_id, excluded.folder_id),
      last_synced_at = excluded.last_synced_at
  `).run(
    sub.id,
    sub.platform,
    sub.externalId ?? null,
    sub.name,
    sub.coverUrl ?? null,
    sub.sourceUrl ?? `https://arbok.local/source/${sub.id}`,
    sub.gradient,
    sub.shortLabel,
    sub.folderId ?? null,
    Date.now(),
    Date.now()
  );
}

export function deleteSubscription(id: string): void {
  getDb().prepare("DELETE FROM sources WHERE id = ?").run(id);
}

export function deleteSubscriptions(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const stmt = db.prepare("DELETE FROM sources WHERE id = ?");
  for (const id of ids) {
    stmt.run(id);
  }
}

function loadTranscriptForEpisode(
  db: DatabaseSync,
  episodeId: string
): TranscriptSegment[] {
  const rows = db
    .prepare(
      `SELECT id, start_sec, end_sec, text_original, text_translated
       FROM transcript_segments
       WHERE episode_id = ?
       ORDER BY seq_index ASC, id ASC`
    )
    .all(episodeId) as Array<{
    id: number;
    start_sec: number;
    end_sec: number;
    text_original: string;
    text_translated: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    start: r.start_sec,
    end: r.end_sec,
    orig: r.text_original,
    zh: r.text_translated ?? undefined,
  }));
}

function loadGuideForEpisode(db: DatabaseSync, episodeId: string): AiGuide | null {
  const row = db
    .prepare(
      `SELECT model_name, template_id, tldr, timeline_json, takeaways_json, highlights_json
       FROM ai_guides WHERE episode_id = ?`
    )
    .get(episodeId) as
    | {
        model_name: string;
        template_id: string | null;
        tldr: string;
        timeline_json: string;
        takeaways_json: string;
        highlights_json: string;
      }
    | undefined;

  if (!row) return null;
  return {
    modelName: row.model_name,
    templateId: (row.template_id as AiGuide["templateId"]) ?? "deep",
    tldr: row.tldr,
    timeline: JSON.parse(row.timeline_json || "[]"),
    takeaways: JSON.parse(row.takeaways_json || "[]"),
    highlights: JSON.parse(row.highlights_json || "[]"),
  };
}

function loadChatForEpisode(db: DatabaseSync, episodeId: string): ChatMessage[] {
  const rows = db
    .prepare(
      `SELECT id, role, content FROM ai_messages
       WHERE episode_id = ? ORDER BY created_at ASC`
    )
    .all(episodeId) as Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
  }>;

  return rows;
}

export function listEpisodes(): Episode[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM episodes ORDER BY created_at DESC")
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const id = String(r.id);
    const transcript = loadTranscriptForEpisode(db, id);
    const guide = loadGuideForEpisode(db, id);
    const chat = loadChatForEpisode(db, id);
    const hasTranslations = transcript.some((s) => Boolean(s.zh?.trim()));

    return {
      id,
      subId: (r.source_id as string | null) ?? null,
      externalId: (r.external_id as string | null) ?? undefined,
      platform: r.platform as Platform,
      channel: String(r.channel ?? ""),
      title: String(r.title ?? ""),
      subtitle: (r.subtitle as string | null) ?? undefined,
      description: (r.description as string | null) ?? undefined,
      coverUrl: (r.cover_url as string | null) ?? undefined,
      date: String(r.date_label ?? "刚刚"),
      durationSec: Number(r.duration_sec ?? 0),
      positionSec: Number(r.play_position_sec ?? 0),
      mediaType: (r.media_type as "audio" | "video") ?? "audio",
      language: (r.language as "en" | "zh") ?? "zh",
      hasOfficialSub: transcript.length > 0 || r.subtitle_status === "ready",
      isBilingual: hasTranslations || Number(r.is_bilingual) === 1,
      hasAiGuide: Boolean(guide),
      isOffline: r.download_status === "completed",
      gradient:
        (r.gradient as string | null) ??
        "linear-gradient(135deg, #4338ca, #6366f1)",
      coverLabel: String(r.cover_label ?? "ARBOK"),
      coverKicker: (r.cover_kicker as string | null) ?? undefined,
      pageUrl: String(r.page_url ?? ""),
      audioUrl: (r.audio_url as string | null) ?? undefined,
      videoUrl: (r.video_url as string | null) ?? undefined,
      streamExpiresAt:
        typeof r.stream_expires_at === "number" ? r.stream_expires_at : undefined,
      localFilePath: (r.local_file_path as string | null) ?? undefined,
      transcript,
      guide,
      chat,
    };
  });
}

export function getEpisodeById(episodeId: string): Episode | null {
  return listEpisodes().find((e) => e.id === episodeId) ?? null;
}

export function findEpisodeByExternalOrUrl(
  externalId: string | undefined,
  pageUrl: string
): Episode | null {
  const db = getDb();
  const row = (
    externalId
      ? db
          .prepare("SELECT id FROM episodes WHERE external_id = ? LIMIT 1")
          .get(externalId)
      : db.prepare("SELECT id FROM episodes WHERE page_url = ? LIMIT 1").get(pageUrl)
  ) as { id: string } | undefined;
  return row ? getEpisodeById(row.id) : null;
}

export function insertEpisode(ep: Episode): Episode {
  const db = getDb();
  const now = Date.now();
  const validSourceId =
    ep.subId &&
    db.prepare("SELECT 1 FROM sources WHERE id = ? LIMIT 1").get(ep.subId)
      ? ep.subId
      : null;
  db.prepare(`
    INSERT INTO episodes (
      id, source_id, external_id, platform, channel, title, subtitle, description, cover_url, gradient,
      cover_label, cover_kicker, page_url, date_label, duration_sec,
      play_position_sec, media_type, audio_url, video_url, stream_expires_at,
      local_file_path, download_status, subtitle_status, is_bilingual, language, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ep.id,
    validSourceId,
    ep.externalId ?? null,
    ep.platform,
    ep.channel,
    ep.title,
    ep.subtitle ?? null,
    ep.description ?? null,
    ep.coverUrl ?? null,
    ep.gradient,
    ep.coverLabel,
    ep.coverKicker ?? null,
    ep.pageUrl,
    ep.date,
    ep.durationSec,
    ep.positionSec,
    ep.mediaType,
    ep.audioUrl ?? null,
    ep.videoUrl ?? null,
    ep.streamExpiresAt ?? null,
    ep.localFilePath ?? null,
    ep.isOffline ? "completed" : "none",
    ep.hasOfficialSub ? "ready" : "none",
    ep.isBilingual ? 1 : 0,
    ep.language,
    now
  );

  if (ep.transcript.length > 0) {
    replaceEpisodeTranscript(ep.id, ep.transcript);
  }
  return getEpisodeById(ep.id) ?? ep;
}

export function upsertEpisodeByExternalId(ep: Episode): {
  episode: Episode;
  created: boolean;
} {
  const existing = findEpisodeByExternalOrUrl(ep.externalId, ep.pageUrl);
  if (existing) {
    updateEpisodeFields(existing.id, {
      audioUrl: ep.audioUrl ?? existing.audioUrl,
      videoUrl: ep.videoUrl ?? existing.videoUrl,
      streamExpiresAt: ep.streamExpiresAt ?? existing.streamExpiresAt,
      durationSec: ep.durationSec > 0 ? ep.durationSec : existing.durationSec,
      coverUrl: ep.coverUrl ?? existing.coverUrl,
    });
    if (existing.transcript.length === 0 && ep.transcript.length > 0) {
      replaceEpisodeTranscript(existing.id, ep.transcript);
    }
    return { episode: getEpisodeById(existing.id) ?? existing, created: false };
  }
  return { episode: insertEpisode(ep), created: true };
}

export function updateEpisodeFields(
  episodeId: string,
  patch: {
    positionSec?: number;
    durationSec?: number;
    isOffline?: boolean;
    localFilePath?: string | null;
    downloadStatus?: string;
    subtitleStatus?: string;
    audioUrl?: string;
    videoUrl?: string;
    streamExpiresAt?: number;
    coverUrl?: string;
    description?: string;
  }
): void {
  const db = getDb();
  if (typeof patch.positionSec === "number") {
    db.prepare(
      "UPDATE episodes SET play_position_sec = ? WHERE id = ?"
    ).run(patch.positionSec, episodeId);
  }
  if (typeof patch.durationSec === "number" && patch.durationSec > 0) {
    db.prepare("UPDATE episodes SET duration_sec = ? WHERE id = ?").run(
      patch.durationSec,
      episodeId
    );
  }
  if (typeof patch.downloadStatus === "string") {
    db.prepare("UPDATE episodes SET download_status = ? WHERE id = ?").run(
      patch.downloadStatus,
      episodeId
    );
  } else if (typeof patch.isOffline === "boolean") {
    db.prepare("UPDATE episodes SET download_status = ? WHERE id = ?").run(
      patch.isOffline ? "completed" : "none",
      episodeId
    );
  }
  if (patch.localFilePath !== undefined) {
    db.prepare("UPDATE episodes SET local_file_path = ? WHERE id = ?").run(
      patch.localFilePath,
      episodeId
    );
  }
  if (typeof patch.subtitleStatus === "string") {
    db.prepare("UPDATE episodes SET subtitle_status = ? WHERE id = ?").run(
      patch.subtitleStatus,
      episodeId
    );
  }
  if (typeof patch.audioUrl === "string") {
    db.prepare("UPDATE episodes SET audio_url = ? WHERE id = ?").run(
      patch.audioUrl,
      episodeId
    );
  }
  if (typeof patch.videoUrl === "string") {
    db.prepare("UPDATE episodes SET video_url = ? WHERE id = ?").run(
      patch.videoUrl,
      episodeId
    );
  }
  if (typeof patch.streamExpiresAt === "number") {
    db.prepare("UPDATE episodes SET stream_expires_at = ? WHERE id = ?").run(
      patch.streamExpiresAt,
      episodeId
    );
  }
  if (typeof patch.coverUrl === "string") {
    db.prepare("UPDATE episodes SET cover_url = ? WHERE id = ?").run(
      patch.coverUrl,
      episodeId
    );
  }
  if (typeof patch.description === "string") {
    db.prepare("UPDATE episodes SET description = ? WHERE id = ?").run(
      patch.description,
      episodeId
    );
  }
}

export function replaceEpisodeTranscript(
  episodeId: string,
  segments: Array<{ start: number; end: number; orig: string; zh?: string }>
): TranscriptSegment[] {
  const db = getDb();
  db.prepare("DELETE FROM transcript_segments WHERE episode_id = ?").run(
    episodeId
  );

  const insert = db.prepare(`
    INSERT INTO transcript_segments
      (episode_id, seq_index, start_sec, end_sec, text_original, text_translated)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  segments.forEach((seg, idx) => {
    insert.run(
      episodeId,
      idx,
      seg.start,
      seg.end,
      seg.orig,
      seg.zh ?? null
    );
  });

  const hasZh = segments.some((s) => Boolean(s.zh?.trim()));
  db.prepare(
    "UPDATE episodes SET subtitle_status = 'ready', is_bilingual = ? WHERE id = ?"
  ).run(hasZh ? 1 : 0, episodeId);

  return loadTranscriptForEpisode(db, episodeId);
}

export function saveSegmentTranslations(
  episodeId: string,
  translations: Array<{ id: number; zh: string }>
): void {
  const db = getDb();
  const update = db.prepare(
    "UPDATE transcript_segments SET text_translated = ? WHERE id = ? AND episode_id = ?"
  );
  for (const item of translations) {
    update.run(item.zh, item.id, episodeId);
  }
  if (translations.length > 0) {
    db.prepare("UPDATE episodes SET is_bilingual = 1 WHERE id = ?").run(
      episodeId
    );
  }
}

export function saveAiGuide(episodeId: string, guide: AiGuide): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO ai_guides
      (id, episode_id, model_name, template_id, tldr, timeline_json, takeaways_json, highlights_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(episode_id) DO UPDATE SET
      model_name = excluded.model_name,
      template_id = excluded.template_id,
      tldr = excluded.tldr,
      timeline_json = excluded.timeline_json,
      takeaways_json = excluded.takeaways_json,
      highlights_json = excluded.highlights_json,
      created_at = excluded.created_at
  `).run(
    `guide-${episodeId}`,
    episodeId,
    guide.modelName ?? "unknown",
    guide.templateId ?? "deep",
    guide.tldr,
    JSON.stringify(guide.timeline),
    JSON.stringify(guide.takeaways),
    JSON.stringify(guide.highlights),
    Date.now()
  );
}

export function appendChatMessage(
  episodeId: string,
  message: ChatMessage
): void {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO ai_messages (id, episode_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(message.id, episodeId, message.role, message.content, Date.now());
}

export function clearChatMessages(episodeId: string): void {
  getDb()
    .prepare("DELETE FROM ai_messages WHERE episode_id = ?")
    .run(episodeId);
}

export function listNotes(episodeId?: string): EpisodeNote[] {
  const db = getDb();
  const rows = (
    episodeId
      ? db
          .prepare(
            "SELECT * FROM notes WHERE episode_id = ? ORDER BY updated_at DESC"
          )
          .all(episodeId)
      : db.prepare("SELECT * FROM notes ORDER BY updated_at DESC").all()
  ) as Array<{
    id: string;
    episode_id: string;
    segment_id: number | null;
    timestamp_sec: number;
    quote_text: string;
    note_content: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    epId: r.episode_id,
    segId: r.segment_id ?? 0,
    ts: r.timestamp_sec,
    quote: r.quote_text,
    body: r.note_content ?? "",
  }));
}

export function upsertNote(note: {
  id?: string;
  epId: string;
  segId: number;
  ts: number;
  quote: string;
  body: string;
}): EpisodeNote {
  const db = getDb();
  const now = Date.now();
  const existing = db
    .prepare(
      "SELECT id FROM notes WHERE episode_id = ? AND segment_id = ? LIMIT 1"
    )
    .get(note.epId, note.segId) as { id: string } | undefined;

  const finalId = note.id ?? existing?.id ?? `note-${now}`;

  db.prepare(`
    INSERT INTO notes
      (id, episode_id, segment_id, timestamp_sec, quote_text, note_content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      note_content = excluded.note_content,
      updated_at = excluded.updated_at
  `).run(
    finalId,
    note.epId,
    note.segId,
    note.ts,
    note.quote,
    note.body,
    now,
    now
  );

  return {
    id: finalId,
    epId: note.epId,
    segId: note.segId,
    ts: note.ts,
    quote: note.quote,
    body: note.body,
  };
}

export function deleteNoteById(noteId: string): void {
  getDb().prepare("DELETE FROM notes WHERE id = ?").run(noteId);
}

const FORBIDDEN_SETTING_KEYS = new Set([
  "apiKey",
  "llmApiKey",
  "asrApiKey",
  "biliCookie",
  "secret",
  "password",
]);

export function getAppSettings(): AppSettings {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value_json FROM app_settings")
    .all() as Array<{ key: string; value_json: string }>;

  const merged: Record<string, unknown> = { ...DEFAULT_APP_SETTINGS };
  for (const row of rows) {
    try {
      merged[row.key] = JSON.parse(row.value_json);
    } catch {
      // Ignore malformed legacy entries.
    }
  }
  return merged as unknown as AppSettings;
}

export function saveAppSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `);

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || FORBIDDEN_SETTING_KEYS.has(key)) continue;
    stmt.run(key, JSON.stringify(value), now);
  }
  return getAppSettings();
}

export function getAsrJob(episodeId: string): (AsrJobState & { checkpoint?: unknown }) | null {
  const row = getDb()
    .prepare("SELECT * FROM asr_jobs WHERE episode_id = ?")
    .get(episodeId) as
    | {
        episode_id: string;
        engine: "cloud" | "local";
        provider: string;
        status: AsrJobState["status"];
        progress: number;
        message: string;
        completed_chunks: number;
        total_chunks: number;
        checkpoint_json: string | null;
        error: string | null;
        updated_at: number;
      }
    | undefined;

  if (!row) return null;
  return {
    episodeId: row.episode_id,
    engine: row.engine,
    provider: row.provider,
    status: row.status,
    progress: row.progress,
    message: row.message,
    completedChunks: row.completed_chunks,
    totalChunks: row.total_chunks,
    error: row.error ?? undefined,
    updatedAt: row.updated_at,
    checkpoint: row.checkpoint_json ? JSON.parse(row.checkpoint_json) : undefined,
  };
}

export function saveAsrJob(
  job: AsrJobState & { checkpoint?: unknown }
): void {
  getDb()
    .prepare(`
      INSERT INTO asr_jobs
        (episode_id, engine, provider, status, progress, message, completed_chunks, total_chunks, checkpoint_json, error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(episode_id) DO UPDATE SET
        engine = excluded.engine,
        provider = excluded.provider,
        status = excluded.status,
        progress = excluded.progress,
        message = excluded.message,
        completed_chunks = excluded.completed_chunks,
        total_chunks = excluded.total_chunks,
        checkpoint_json = excluded.checkpoint_json,
        error = excluded.error,
        updated_at = excluded.updated_at
    `)
    .run(
      job.episodeId,
      job.engine,
      job.provider,
      job.status,
      job.progress,
      job.message,
      job.completedChunks,
      job.totalChunks,
      job.checkpoint !== undefined ? JSON.stringify(job.checkpoint) : null,
      job.error ?? null,
      job.updatedAt
    );
}

export function getPlayQueue(): string[] {
  const row = getDb()
    .prepare("SELECT value_json FROM app_settings WHERE key = 'playQueue'")
    .get() as { value_json: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value_json);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function savePlayQueue(queue: string[]): string[] {
  const deduped = Array.from(
    new Set(queue.filter((id) => typeof id === "string" && id.trim().length > 0))
  );
  getDb()
    .prepare(`
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES ('playQueue', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `)
    .run(JSON.stringify(deduped), Date.now());
  return deduped;
}

export function searchGlobalTranscriptsAndNotes(
  rawQuery: string,
  limit = 24
): GlobalSearchHit[] {
  const q = rawQuery.trim();
  if (!q) return [];
  const pattern = `%${q}%`;
  const db = getDb();

  const noteRows = db
    .prepare(
      `SELECT n.id, n.episode_id, n.timestamp_sec, n.quote_text, n.note_content,
              e.title AS ep_title, e.channel, e.platform
       FROM notes n
       JOIN episodes e ON e.id = n.episode_id
       WHERE n.quote_text LIKE ? OR n.note_content LIKE ?
       ORDER BY n.updated_at DESC
       LIMIT ?`
    )
    .all(pattern, pattern, Math.ceil(limit / 2)) as Array<{
    id: string;
    episode_id: string;
    timestamp_sec: number;
    quote_text: string;
    note_content: string | null;
    ep_title: string;
    channel: string;
    platform: Platform;
  }>;

  const segRows = db
    .prepare(
      `SELECT s.id, s.episode_id, s.start_sec, s.text_original, s.text_translated,
              e.title AS ep_title, e.channel, e.platform
       FROM transcript_segments s
       JOIN episodes e ON e.id = s.episode_id
       WHERE s.text_original LIKE ? OR s.text_translated LIKE ?
       ORDER BY e.created_at DESC, s.seq_index ASC
       LIMIT ?`
    )
    .all(pattern, pattern, limit) as Array<{
    id: number;
    episode_id: string;
    start_sec: number;
    text_original: string;
    text_translated: string | null;
    ep_title: string;
    channel: string;
    platform: Platform;
  }>;

  const hits: GlobalSearchHit[] = [];
  for (const r of noteRows) {
    hits.push({
      kind: "note",
      id: `note-${r.id}`,
      episodeId: r.episode_id,
      episodeTitle: r.ep_title,
      channel: r.channel,
      platform: r.platform,
      startSec: r.timestamp_sec,
      snippet: r.note_content || r.quote_text,
      secondaryText: r.note_content ? r.quote_text : undefined,
    });
  }
  for (const r of segRows) {
    hits.push({
      kind: "transcript",
      id: `seg-${r.id}`,
      episodeId: r.episode_id,
      episodeTitle: r.ep_title,
      channel: r.channel,
      platform: r.platform,
      startSec: r.start_sec,
      snippet: r.text_translated?.trim() || r.text_original,
      secondaryText: r.text_translated?.trim() ? r.text_original : undefined,
    });
  }
  return hits.slice(0, limit);
}
