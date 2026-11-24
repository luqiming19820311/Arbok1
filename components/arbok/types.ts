export type Platform = "podcast" | "xiaoyuzhou" | "youtube" | "bilibili" | "local";

export type PlatformFilter = "all" | "podcast" | "youtube" | "bilibili" | "local";

export type SubtitleMode = "none" | "bilingual" | "zh" | "orig";

export type SubtitleFontFamily = "system" | "lxgw";

export type VideoSubtitleStyle = "translucent" | "outline" | "none";

export type TtsEngine = "cloud" | "local";

export type CloudTtsProviderId =
  | "doubao-tts"
  | "deepseek-tts"
  | "xiaomi-mimo"
  | "xiaomi-mimo-cn"
  | "qwen-tts"
  | "openai-tts"
  | "edge-tts";

export type TranslationPairId =
  | "auto-zh"
  | "en-zh"
  | "de-zh"
  | "ja-zh"
  | "fr-zh"
  | "ko-zh"
  | "es-zh"
  | "zh-en"
  | "off";

export type ThemeMode = "system" | "light" | "dark";

export interface UpdateCheckResult {
  status: "up-to-date" | "update-available" | "no-release" | "error";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  notes?: string;
  publishedAt?: string;
  repo: string;
  message: string;
}

export type UiLanguage = "system" | "zh-CN" | "zh-TW" | "en" | "ja";

export type AsrEngine = "cloud" | "local";

export type RightWorkbenchTab = "subtitles" | "guide" | "chat" | "notes";

export type LocalAiProviderId = "claude-code" | "codex" | "antigravity";

export interface LocalCliModelItem {
  id: string;
  displayName: string;
}

export interface LocalAiCliStatus {
  id: LocalAiProviderId;
  available: boolean;
  version: string;
  vendor: string;
  binaryPath?: string;
  models: LocalCliModelItem[];
}

export interface LocalAiCliConfig {
  modelMode: string;
  chatModels: string[];
  customModels: string[];
}

export type LlmProviderId =
  | LocalAiProviderId
  | "xiaomi-mimo"
  | "deepseek"
  | "siliconflow"
  | "tokendance"
  | "opencode-go"
  | "kimi"
  | "qwen"
  | "zhipu"
  | "openai"
  | "gemini"
  | "claude"
  | "openrouter"
  | "custom"
  | "ollama"
  | "lmstudio";

export type CloudAsrProviderId =
  | "doubao"
  | "deepseek-asr"
  | "siliconflow"
  | "groq"
  | "openai"
  | "zhipu-asr"
  | "stepfun-asr"
  | "local-asr-service";

export type GuideTemplateId = "deep" | "brief" | "technical" | "custom";

export type AsrJobStatus =
  | "idle"
  | "downloading"
  | "splitting"
  | "transcribing"
  | "completed"
  | "failed"
  | "cancelled";

export interface AsrJobState {
  episodeId: string;
  engine: AsrEngine;
  provider: string;
  status: AsrJobStatus;
  progress: number;
  message: string;
  completedChunks: number;
  totalChunks: number;
  error?: string;
  updatedAt: number;
}

export interface LocalAsrModel {
  id: string;
  name: string;
  engine: "whisper.cpp" | "qwen3-asr";
  sizeLabel: string;
  filename: string;
  downloadUrl: string;
  installed: boolean;
  localPath?: string;
}

export interface LocalModelDownloadState {
  modelId: string;
  status: "downloading" | "completed" | "failed";
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  updatedAt: number;
}

export interface EnvDependency {
  name: string;
  available: boolean;
  path: string;
  version: string;
  installHint?: string;
}

export interface LocalTtsModel {
  id: string;
  name: string;
  engine: "mimo-audio";
  repoId: string;
  sizeLabel: string;
  description: string;
  installed: boolean;
  localPath?: string;
}

export interface KeychainStatus {
  llmKeys: Record<string, { configured: boolean; masked: string }>;
  asrKeys: Record<string, { configured: boolean; masked: string }>;
  ttsKeys: Record<string, { configured: boolean; masked: string }>;
  biliCookieConfigured: boolean;
}

export interface AppSettings {
  theme: ThemeMode;
  autoPlayNext: boolean;
  cacheLimitMb: number;
  proxyMode: "system" | "custom" | "direct";
  proxyUrl: string;
  biliLoggedIn: boolean;
  llmProvider: LlmProviderId;
  llmModel: string;
  llmBaseUrl: string;
  llmGuideProvider: LlmProviderId | "default";
  llmTranslateProvider: LlmProviderId | "default";
  translationStyle: "fast" | "refined";
  localAiConfigs?: Partial<Record<LocalAiProviderId, LocalAiCliConfig>>;
  asrEngine: AsrEngine;
  cloudAsrProvider: CloudAsrProviderId;
  cloudAsrBaseUrl: string;
  cloudAsrModel: string;
  localAsrModelId: string;
  guideTemplate: GuideTemplateId;
  customGuidePrompt: string;
  translationPair: TranslationPairId;
  subtitleDisplayMode: SubtitleMode;
  subtitleZhFontSize: number;
  subtitleOrigFontSize: number;
  subtitleFontFamily: SubtitleFontFamily;
  videoSubtitleStyle: VideoSubtitleStyle;
  subtitleShowNextAudioLine: boolean;
  subtitleOverlayX: number;
  subtitleOverlayY: number;
  subscriptionFolders?: SubscriptionFolder[];
  uiLanguage?: UiLanguage;
  showYoutubeSubscribeButton?: boolean;
  showRecommendations?: boolean;
  keepOriginalShowNames?: boolean;
  autoDownloadUpdates?: boolean;
  otaRepo?: string;
  ttsEngine: TtsEngine;
  cloudTtsProvider: CloudTtsProviderId;
  cloudTtsModel: string;
  cloudTtsBaseUrl: string;
  cloudTtsVoice: string;
  localTtsBaseUrl: string;
  localTtsModelId: string;
  localTtsVoice: string;
  localTtsVoiceStyle: string;
  ttsSpeed: number;
}

export interface SubscriptionFolder {
  id: string;
  name: string;
}

export interface Subscription {
  id: string;
  name: string;
  platform: Platform;
  sourceUrl?: string;
  externalId?: string;
  coverUrl?: string;
  gradient: string;
  shortLabel: string;
  playbackRate?: number;
  folderId?: string | null;
}

export interface RecommendedShow {
  id: string;
  name: string;
  reason: string;
  platform: Platform;
  sourceUrl?: string;
  gradient: string;
  shortLabel: string;
  subscribed: boolean;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  orig: string;
  zh?: string;
}

export interface TimelineChapter {
  start: number;
  title: string;
  summary: string;
}

export interface HighlightClip {
  start: number;
  end: number;
  reason: string;
}

export interface AiGuide {
  modelName?: string;
  templateId?: GuideTemplateId;
  tldr: string;
  timeline: TimelineChapter[];
  takeaways: string[];
  highlights: HighlightClip[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface Episode {
  id: string;
  subId: string | null;
  externalId?: string;
  platform: Platform;
  channel: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverUrl?: string;
  date: string;
  durationSec: number;
  positionSec: number;
  mediaType: "audio" | "video";
  language: "en" | "zh";
  hasOfficialSub: boolean;
  isBilingual: boolean;
  hasAiGuide: boolean;
  isOffline: boolean;
  gradient: string;
  coverLabel: string;
  coverKicker?: string;
  pageUrl: string;
  audioUrl?: string;
  videoUrl?: string;
  streamExpiresAt?: number;
  localFilePath?: string;
  transcript: TranscriptSegment[];
  guide: AiGuide | null;
  chat: ChatMessage[];
}

export interface EpisodeNote {
  id: string;
  epId: string;
  segId: number;
  ts: number;
  quote: string;
  body: string;
}

export type DownloadJobStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface OfflineDownloadJob {
  episodeId: string;
  title: string;
  platform: Platform;
  status: DownloadJobStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  filePath?: string;
  error?: string;
  updatedAt: number;
}

export interface StorageUsage {
  tempCacheBytes: number;
  tempCacheMb: number;
  offlineBytes: number;
  offlineMb: number;
  offlineCount: number;
  localMediaBytes: number;
  localMediaMb: number;
  limitMb: number;
}

export interface GlobalSearchHit {
  kind: "transcript" | "note";
  id: string;
  episodeId: string;
  episodeTitle: string;
  channel: string;
  platform: Platform;
  startSec: number;
  snippet: string;
  secondaryText?: string;
}

export interface PodcastDirectoryItem {
  id: string;
  name: string;
  author: string;
  desc: string;
  feedUrl?: string;
  coverUrl?: string;
  subscribed: boolean;
}
