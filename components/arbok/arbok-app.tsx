"use client";

import { Button } from "@ui-sdk/react/button";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/react/scroll-area";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { Separator } from "@ui-sdk/react/separator";
import {
  Toast,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
} from "@ui-sdk/react/toast";
import {
  BookmarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  FolderIcon,
  InboxIcon,
  ListFilterIcon,
  MoonIcon,
  PanelLeftIcon,
  PlayCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SunIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_APP_SETTINGS,
  LLM_PROVIDER_PRESETS,
  LOCAL_ASR_MODEL_CATALOG,
  LOCAL_TTS_MODEL_CATALOG,
  LOCAL_AI_CLI_METADATA,
  getCloudTtsPreset,
  getDefaultLocalAiCliConfig,
  getLlmPreset,
  isLocalAiProviderId,
} from "@/lib/arbok/providers";
import { getUiCopy, resolveUiLocale } from "@/lib/arbok/i18n";
import { canResumePausedTtsAudio, evaluateTtsSync } from "@/lib/arbok/tts-sync";
import { AddSourceDialog } from "./add-source-dialog";
import { initArbokAgentBridge } from "./agent-bridge";
import { ArbokLogo } from "./arbok-icons";
import { ExportMarkdownDialog } from "./export-markdown-dialog";
import { FavoritesView } from "./favorites-view";
import { HomeFeed } from "./home-feed";
import { ImmersivePlayer } from "./immersive-player";
import { ManageSubscriptionsDialog } from "./manage-subscriptions-dialog";
import { MiniPlayer } from "./mini-player";
import { OfflineQueueView } from "./offline-queue-view";
import { ShortcutsDialog } from "./shortcuts-dialog";
import {
  INITIAL_EPISODES,
  INITIAL_NOTES,
  INITIAL_PODCAST_DIRECTORY,
  INITIAL_RECOMMENDED_SHOWS,
  INITIAL_SUBSCRIPTIONS,
  buildEpisodeMarkdown,
  detectPlatformFromUrl,
  formatTime,
  getPlatformMeta,
} from "./mock-data";
import { SettingsDialog } from "./settings-dialog";
import {
  extractYouTubeVideoId,
  type YouTubeHdPlayerHandle,
} from "./youtube-hd-player";
import type {
  AiGuide,
  AppSettings,
  AsrJobState,
  ChatMessage,
  EnvDependency,
  Episode,
  EpisodeNote,
  GlobalSearchHit,
  KeychainStatus,
  LlmProviderId,
  LocalAiCliStatus,
  LocalAsrModel,
  LocalModelDownloadState,
  LocalTtsModel,
  OfflineDownloadJob,
  PlatformFilter,
  PodcastDirectoryItem,
  RecommendedShow,
  RightWorkbenchTab,
  StorageUsage,
  Subscription,
  SubscriptionFolder,
  SubtitleMode,
  TranscriptSegment,
  TranslationPairId,
} from "./types";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const INITIAL_KEYCHAIN_STATUS: KeychainStatus = {
  llmKeys: {},
  asrKeys: {},
  ttsKeys: {},
  biliCookieConfigured: false,
};

const INITIAL_ENV_DEPS: EnvDependency[] = [
  { name: "yt-dlp", available: true, path: "检测中…", version: "待刷新" },
  { name: "ffmpeg", available: true, path: "检测中…", version: "待刷新" },
  {
    name: "whisper-cli (本地离线 ASR)",
    available: true,
    path: "检测中…",
    version: "待刷新",
  },
];

const INITIAL_LOCAL_MODELS: LocalAsrModel[] = LOCAL_ASR_MODEL_CATALOG.map(
  (m) => ({ ...m, installed: false })
);

const INITIAL_LOCAL_AI_CLIS: LocalAiCliStatus[] = (
  ["claude-code", "codex", "antigravity"] as const
).map((id) => ({
  id,
  available: true,
  version: LOCAL_AI_CLI_METADATA[id].defaultVersionLabel,
  vendor: LOCAL_AI_CLI_METADATA[id].vendor,
  models: [...LOCAL_AI_CLI_METADATA[id].defaultModels],
}));

const INITIAL_LOCAL_TTS_MODELS: LocalTtsModel[] = LOCAL_TTS_MODEL_CATALOG.map(
  (m) => ({ ...m, installed: false })
);

function isBrowserBackendEnabled(): boolean {
  return typeof window !== "undefined" && process.env.NODE_ENV !== "test";
}

function isDemoPlaceholder(ep: Episode): boolean {
  if (ep.audioUrl || ep.videoUrl || ep.localFilePath) return false;
  return (
    /arbok/i.test(ep.pageUrl) ||
    ep.pageUrl === "https://lexfridman.com/podcast/462"
  );
}

function hasForeignSubtitleText(segments: TranscriptSegment[]): boolean {
  const sample = segments
    .slice(0, 15)
    .map((s) => s.orig)
    .join(" ");
  if (!sample.trim()) return false;
  const zhCount = (sample.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const foreignCount = (
    sample.match(/[A-Za-zÀ-ÿ\u3040-\u30ff\uac00-\ud7af]/g) ?? []
  ).length;
  return foreignCount >= 16 && zhCount < foreignCount * 0.25;
}

export function ArbokApp() {
  const [toaster] = useState(() => createToaster());

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [keyStatus, setKeyStatus] = useState<KeychainStatus>(
    INITIAL_KEYCHAIN_STATUS
  );
  const [envDeps, setEnvDeps] = useState<EnvDependency[]>(INITIAL_ENV_DEPS);
  const [localAiClis, setLocalAiClis] = useState<LocalAiCliStatus[]>(
    INITIAL_LOCAL_AI_CLIS
  );
  const [localModels, setLocalModels] =
    useState<LocalAsrModel[]>(INITIAL_LOCAL_MODELS);
  const [localTtsModels, setLocalTtsModels] = useState<LocalTtsModel[]>(
    INITIAL_LOCAL_TTS_MODELS
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState<string>("inbox");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [listSearch, setListSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "player">("list");

  const [subscriptions, setSubscriptions] = useState<Subscription[]>(
    INITIAL_SUBSCRIPTIONS
  );
  const [recommendedShows, setRecommendedShows] = useState<RecommendedShow[]>(
    INITIAL_RECOMMENDED_SHOWS
  );
  const [subscribingRecId, setSubscribingRecId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>(INITIAL_EPISODES);
  const [notes, setNotes] = useState<EpisodeNote[]>(INITIAL_NOTES);
  const [directory, setDirectory] = useState<PodcastDirectoryItem[]>(
    INITIAL_PODCAST_DIRECTORY
  );

  const [currentEpId, setCurrentEpId] = useState<string>(INITIAL_EPISODES[0].id);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fetchingSubtitlesEpId, setFetchingSubtitlesEpId] = useState<string | null>(
    null
  );
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.9);
  const [streamVersion, setStreamVersion] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioOnly, setAudioOnly] = useState(false);
  const [videoQuality, setVideoQuality] = useState("1080P");
  const [actualQuality, setActualQuality] = useState<string | null>(null);
  const [maxAvailableQuality, setMaxAvailableQuality] = useState<string | null>(
    null
  );
  const [ytEmbedFallbackEpId, setYtEmbedFallbackEpId] = useState<string | null>(
    null
  );
  const [rightTab, setRightTab] = useState<RightWorkbenchTab>("subtitles");
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("bilingual");
  const [autoScroll, setAutoScroll] = useState(true);
  const [ttsDubbingEnabled, setTtsDubbingEnabled] = useState(false);
  const [ttsDubbingStatus, setTtsDubbingStatus] = useState<
    "idle" | "speaking" | "catching_up"
  >("idle");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [manageSubsOpen, setManageSubsOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [windowDragActive, setWindowDragActive] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [pipMode, setPipMode] = useState<"none" | "desktop" | "document" | "floating">("none");
  const [docPipContainer, setDocPipContainer] = useState<HTMLElement | null>(null);
  const docPipWindowRef = useRef<Window | null>(null);

  const [cacheUsedMb, setCacheUsedMb] = useState(412);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [downloadJobs, setDownloadJobs] = useState<OfflineDownloadJob[]>([]);
  const [asrModelDownloads, setAsrModelDownloads] = useState<
    Record<string, LocalModelDownloadState>
  >({});
  const [playQueue, setPlayQueue] = useState<string[]>([]);
  const [remoteSearchResult, setRemoteSearchResult] = useState<{
    query: string;
    hits: GlobalSearchHit[];
  } | null>(null);
  const [llmApiKeyDraft, setLlmApiKeyDraft] = useState("");
  const [asrApiKeyDraft, setAsrApiKeyDraft] = useState("");
  const [ttsApiKeyDraft, setTtsApiKeyDraft] = useState("");
  const [biliCookieDraft, setBiliCookieDraft] = useState("");
  const [llmTestResult, setLlmTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [biliQr, setBiliQr] = useState<{
    qrcodeKey: string;
    qrSvg: string;
    status: "waiting" | "scanned" | "expired" | "confirmed";
    message: string;
  } | null>(null);

  const [asrJobs, setAsrJobs] = useState<Record<string, AsrJobState>>({});
  const [translationProgress, setTranslationProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [generatingGuideEpId, setGeneratingGuideEpId] = useState<string | null>(
    null
  );
  const [streamingChatText, setStreamingChatText] = useState<string | null>(null);
  const [chatModelChoice, setChatModelChoice] = useState<string>("default");

  const listSearchRef = useRef<HTMLInputElement | null>(null);
  const subSearchRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<YouTubeHdPlayerHandle | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const pendingSeekDeadlineRef = useRef<number>(0);
  const lastReportedPosRef = useRef<number>(0);
  const translationAbortRef = useRef<AbortController | null>(null);
  const translationInFlightRef = useRef(false);
  const autoTranslatedKeyRef = useRef<Set<string>>(new Set());
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsObjectUrlRef = useRef<string | null>(null);
  const ttsCacheRef = useRef<Map<string, Blob>>(new Map());
  const ttsInflightRef = useRef<Map<string, Promise<Blob>>>(new Map());
  const ttsCurrentIdxRef = useRef<number>(-1);
  const ttsBusyRef = useRef<boolean>(false);
  const pausedByTtsRef = useRef<boolean>(false);
  const ttsSessionRef = useRef<number>(0);
  const ttsRequestSeqRef = useRef<number>(0);
  const latestVideoSegIdxRef = useRef<number>(-1);
  const latestEpisodeRef = useRef<Episode>(INITIAL_EPISODES[0]);
  const latestSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const latestVolumeRef = useRef<number>(0.9);

  const systemPrefersDark = useSyncExternalStore(
    (callback) => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        return () => {};
      }
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener?.("change", callback);
      return () => mq.removeEventListener?.("change", callback);
    },
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false
  );

  const resolvedTheme: "light" | "dark" =
    settings.theme === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : settings.theme;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.lang = resolveUiLocale(settings.uiLanguage);
  }, [settings.uiLanguage]);

  const uiCopy = getUiCopy(settings.uiLanguage);

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;
    initArbokAgentBridge();

    let cancelled = false;
    void fetch("/api/bootstrap")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        if (Array.isArray(data.subscriptions) && data.subscriptions.length > 0) {
          setSubscriptions(data.subscriptions);
        }
        if (Array.isArray(data.episodes) && data.episodes.length > 0) {
          setEpisodes(data.episodes);
          const firstReal = data.episodes.find(
            (e: Episode) => !isDemoPlaceholder(e)
          );
          setCurrentEpId((prev) => {
            const existing = data.episodes.find((e: Episode) => e.id === prev);
            if (existing && !isDemoPlaceholder(existing)) return prev;
            return firstReal?.id ?? data.episodes[0].id;
          });
        }
        if (Array.isArray(data.notes)) setNotes(data.notes);
        if (data.settings) {
          const merged = { ...DEFAULT_APP_SETTINGS, ...data.settings };
          // Migrate legacy removed xiaomi-mimo-cn and old Qwen compatible-mode TTS URLs.
          if ((merged.cloudTtsProvider as string) === "xiaomi-mimo-cn") {
            merged.cloudTtsProvider = "xiaomi-mimo";
            merged.cloudTtsBaseUrl = "https://api.xiaomimimo.com/v1";
          }
          if (
            merged.cloudTtsProvider === "qwen-tts" &&
            merged.cloudTtsBaseUrl?.includes("dashscope.aliyuncs.com/compatible-mode")
          ) {
            merged.cloudTtsBaseUrl =
              "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
          }
          setSettings(merged);
          if (merged.subtitleDisplayMode) {
            setSubtitleMode(merged.subtitleDisplayMode);
          }
        }
        if (data.keyStatus) setKeyStatus(data.keyStatus);
        if (Array.isArray(data.envDeps)) setEnvDeps(data.envDeps);
        if (Array.isArray(data.localAiClis)) setLocalAiClis(data.localAiClis);
        if (Array.isArray(data.localModels)) setLocalModels(data.localModels);
        if (data.asrModelDownloads && typeof data.asrModelDownloads === "object") {
          setAsrModelDownloads(
            data.asrModelDownloads as Record<string, LocalModelDownloadState>
          );
        }
        if (Array.isArray(data.localTtsModels)) {
          setLocalTtsModels(data.localTtsModels);
        }
        if (data.storage) {
          setStorageUsage(data.storage as StorageUsage);
          setCacheUsedMb((data.storage as StorageUsage).tempCacheMb);
        }
        if (Array.isArray(data.downloadJobs)) {
          setDownloadJobs(data.downloadJobs as OfflineDownloadJob[]);
        }
        if (Array.isArray(data.playQueue)) {
          setPlayQueue(data.playQueue as string[]);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      toaster.dismiss();
    };
  }, [toaster]);

  const currentEpisode = useMemo(
    () => episodes.find((ep) => ep.id === currentEpId) ?? episodes[0],
    [episodes, currentEpId]
  );

  const currentEpisodeNotes = useMemo(
    () => notes.filter((n) => n.epId === currentEpisode.id),
    [notes, currentEpisode.id]
  );

  const currentVideoSegIdx = useMemo(() => {
    const list = currentEpisode.transcript;
    if (list.length === 0) return -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (currentEpisode.positionSec >= list[i].start) return i;
    }
    return 0;
  }, [currentEpisode.transcript, currentEpisode.positionSec]);

  useEffect(() => {
    latestVideoSegIdxRef.current = currentVideoSegIdx;
    latestEpisodeRef.current = currentEpisode;
    latestSettingsRef.current = settings;
    latestVolumeRef.current = volume;
    if (ttsAudioRef.current) {
      ttsAudioRef.current.volume = volume;
    }
  }, [currentVideoSegIdx, currentEpisode, settings, volume]);

  const effectiveMediaVolume = ttsDubbingEnabled
    ? Math.min(volume, 0.12)
    : volume;

  const currentIsDemoPlaceholder = isDemoPlaceholder(currentEpisode);

  const rawYouTubeVideoId =
    currentEpisode.platform === "youtube" && !currentIsDemoPlaceholder
      ? extractYouTubeVideoId(currentEpisode.externalId, currentEpisode.pageUrl)
      : null;

  const useYouTubeHd =
    hydrated &&
    isBrowserBackendEnabled() &&
    viewMode === "player" &&
    currentEpisode.mediaType === "video" &&
    !audioOnly &&
    !(currentEpisode.isOffline && currentEpisode.localFilePath) &&
    Boolean(rawYouTubeVideoId) &&
    ytEmbedFallbackEpId !== currentEpisode.id;

  const youtubeVideoId = useYouTubeHd ? rawYouTubeVideoId : null;

  const useVideoElement =
    hydrated &&
    isBrowserBackendEnabled() &&
    viewMode === "player" &&
    currentEpisode.mediaType === "video" &&
    !audioOnly &&
    !currentIsDemoPlaceholder &&
    !useYouTubeHd;

  const videoStreamUrl = useVideoElement
    ? `/api/episodes/${encodeURIComponent(currentEpisode.id)}/stream?mode=video&quality=${encodeURIComponent(videoQuality)}&v=${streamVersion}`
    : null;

  const audioStreamUrl =
    hydrated &&
    isBrowserBackendEnabled() &&
    !useYouTubeHd &&
    !useVideoElement &&
    !currentIsDemoPlaceholder
      ? `/api/episodes/${encodeURIComponent(currentEpisode.id)}/stream?mode=audio&v=${streamVersion}`
      : undefined;

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;

    if (useYouTubeHd) {
      if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
      if (videoRef.current && !videoRef.current.paused) videoRef.current.pause();
      ytPlayerRef.current?.setPlaybackRate(playbackRate);
      ytPlayerRef.current?.setVolume(effectiveMediaVolume);
      if (isPlaying) {
        ytPlayerRef.current?.play();
      } else {
        ytPlayerRef.current?.pause();
      }
      return;
    }

    const activeEl = useVideoElement ? videoRef.current : audioRef.current;
    const inactiveEl = useVideoElement ? audioRef.current : videoRef.current;

    if (inactiveEl && !inactiveEl.paused) {
      inactiveEl.pause();
    }
    if (!activeEl) return;

    activeEl.playbackRate = playbackRate;
    activeEl.volume = effectiveMediaVolume;

    if (isPlaying && !currentIsDemoPlaceholder) {
      const p = activeEl.play();
      if (p && typeof p.catch === "function") {
        p.catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setIsBuffering(false);
          setIsPlaying(false);
        });
      }
    } else if (!activeEl.paused) {
      activeEl.pause();
    }
  }, [
    isPlaying,
    playbackRate,
    effectiveMediaVolume,
    useYouTubeHd,
    useVideoElement,
    currentEpisode.id,
    currentIsDemoPlaceholder,
    streamVersion,
  ]);

  useEffect(() => {
    if (
      !isBrowserBackendEnabled() ||
      !settingsDialogOpen ||
      settingsTab !== "bili" ||
      !biliQr ||
      (biliQr.status !== "waiting" && biliQr.status !== "scanned")
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetch(
        `/api/auth/bilibili/poll?qrcodeKey=${encodeURIComponent(biliQr.qrcodeKey)}`
      )
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              status?: "waiting" | "scanned" | "expired" | "confirmed";
              message?: string;
              keyStatus?: KeychainStatus;
            } | null
          ) => {
            if (!data?.status) return;
            if (data.status === "confirmed") {
              setSettings((prev) => ({ ...prev, biliLoggedIn: true }));
              if (data.keyStatus) setKeyStatus(data.keyStatus);
              setBiliQr(null);
              toaster.success(data.message ?? "B站扫码登录成功");
              const curEp = latestEpisodeRef.current;
              if (
                curEp &&
                curEp.platform === "bilibili" &&
                curEp.transcript.length === 0 &&
                !isDemoPlaceholder(curEp)
              ) {
                void handleFetchOfficialSubtitles(curEp.id, true);
              }
            } else {
              setBiliQr((prev) =>
                prev
                  ? {
                      ...prev,
                      status: data.status!,
                      message: data.message ?? prev.message,
                    }
                  : null
              );
            }
          }
        )
        .catch(() => {});
    }, 2000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biliQr, settingsDialogOpen, settingsTab, toaster]);

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;
    const saveTimer = window.setTimeout(() => {
      void fetch(`/api/episodes/${encodeURIComponent(currentEpisode.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSec: currentEpisode.positionSec }),
      }).catch(() => {});
    }, 1000);
    return () => window.clearTimeout(saveTimer);
  }, [currentEpisode.id, currentEpisode.positionSec]);

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;
    const persistCurrentPositionNow = () => {
      const ep = latestEpisodeRef.current;
      if (!ep) return;
      const activeEl = videoRef.current ?? audioRef.current;
      const liveTime =
        pendingSeekRef.current !== null
          ? pendingSeekRef.current
          : activeEl && activeEl.readyState >= 1 && activeEl.currentTime > 0
            ? activeEl.currentTime
            : Math.max(ep.positionSec, lastReportedPosRef.current > 0 ? lastReportedPosRef.current : 0);
      if (liveTime <= 0) return;
      void fetch(`/api/episodes/${encodeURIComponent(ep.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ positionSec: liveTime }),
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        persistCurrentPositionNow();
      }
    };
    window.addEventListener("beforeunload", persistCurrentPositionNow);
    window.addEventListener("pagehide", persistCurrentPositionNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", persistCurrentPositionNow);
      window.removeEventListener("pagehide", persistCurrentPositionNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;
    const activeJob = asrJobs[currentEpisode.id];
    if (
      !activeJob ||
      (activeJob.status !== "downloading" &&
        activeJob.status !== "splitting" &&
        activeJob.status !== "transcribing")
    ) {
      return;
    }

    const poll = window.setInterval(() => {
      void fetch(`/api/episodes/${encodeURIComponent(currentEpisode.id)}/asr`)
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (data: { job: AsrJobState | null; transcript: TranscriptSegment[] } | null) => {
            if (!data?.job) return;
            setAsrJobs((prev) => ({
              ...prev,
              [currentEpisode.id]: data.job!,
            }));
            if (data.transcript.length > 0) {
              setEpisodes((prev) =>
                prev.map((ep) => {
                  if (ep.id !== currentEpisode.id) return ep;
                  const changed =
                    ep.transcript.length !== data.transcript.length ||
                    ep.transcript[0]?.orig !== data.transcript[0]?.orig ||
                    ep.transcript[ep.transcript.length - 1]?.orig !==
                      data.transcript[data.transcript.length - 1]?.orig ||
                    data.job!.status === "completed";
                  if (!changed) return ep;
                  return {
                    ...ep,
                    hasOfficialSub: true,
                    isBilingual: data.transcript.some((s) =>
                      Boolean(s.zh?.trim())
                    ),
                    transcript: data.transcript,
                  };
                })
              );
            }
            if (data.job.status === "completed" && data.transcript.length > 0) {
              toaster.success(data.job.message);
            } else if (data.job.status === "failed") {
              toaster.error(data.job.error ?? "ASR 转写失败");
            }
          }
        )
        .catch(() => {});
    }, 1200);

    return () => window.clearInterval(poll);
  }, [asrJobs, currentEpisode.id, toaster]);

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;
    const activeIds = Object.values(asrModelDownloads)
      .filter((d) => d.status === "downloading")
      .map((d) => d.modelId);
    if (activeIds.length === 0) return;

    const timer = window.setInterval(() => {
      void fetch("/api/asr/models")
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              models?: LocalAsrModel[];
              downloads?: Record<string, LocalModelDownloadState>;
            } | null
          ) => {
            if (!data) return;
            if (Array.isArray(data.models)) {
              setLocalModels(data.models);
            }
            if (data.downloads) {
              setAsrModelDownloads(data.downloads);
              for (const id of activeIds) {
                const state = data.downloads[id];
                if (state?.status === "completed") {
                  persistSettingsPatch({ localAsrModelId: id });
                  toaster.success("本地离线 ASR 模型下载完成");
                } else if (state?.status === "failed") {
                  toaster.error(state.error ?? "模型下载失败");
                }
              }
            }
          }
        )
        .catch(() => {});
    }, 450);

    return () => window.clearInterval(timer);
  }, [asrModelDownloads, toaster]);

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;
    const hasActive = downloadJobs.some(
      (j) => j.status === "queued" || j.status === "downloading"
    );
    if (!hasActive) return;

    const timer = window.setInterval(() => {
      void fetch("/api/downloads")
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (
            data: {
              jobs?: OfflineDownloadJob[];
              storage?: StorageUsage;
            } | null
          ) => {
            if (!data) return;
            const nextJobs = data.jobs ?? [];
            const prevActive = new Set(
              downloadJobs
                .filter((j) => j.status === "queued" || j.status === "downloading")
                .map((j) => j.episodeId)
            );
            const newlyFinished = nextJobs.filter(
              (j) =>
                prevActive.has(j.episodeId) &&
                (j.status === "completed" || j.status === "failed")
            );
            setDownloadJobs(nextJobs);
            if (data.storage) {
              setStorageUsage(data.storage);
              setCacheUsedMb(data.storage.tempCacheMb);
            }
            if (newlyFinished.length > 0) {
              for (const done of newlyFinished) {
                if (done.status === "completed") {
                  toaster.success(`离线下载完成：${done.title}`);
                } else if (done.status === "failed") {
                  toaster.error(done.error ?? `离线下载失败：${done.title}`);
                }
              }
              void fetch("/api/episodes")
                .then((r) => (r.ok ? r.json() : null))
                .then((epData: { episodes?: Episode[] } | null) => {
                  if (Array.isArray(epData?.episodes)) {
                    setEpisodes(epData.episodes);
                  }
                })
                .catch(() => {});
            }
          }
        )
        .catch(() => {});
    }, 1000);

    return () => window.clearInterval(timer);
  }, [downloadJobs, toaster]);

  useEffect(() => {
    if (!isBrowserBackendEnabled()) return;
    const q = listSearch.trim();
    if (q.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { hits?: GlobalSearchHit[] } | null) => {
          if (data?.hits) {
            setRemoteSearchResult({ query: q, hits: data.hits });
          }
        })
        .catch(() => {});
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [listSearch]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    try {
      if (typeof MediaMetadata !== "undefined") {
        const meta = getPlatformMeta(currentEpisode.platform);
        ms.metadata = new MediaMetadata({
          title: currentEpisode.title,
          artist: currentEpisode.channel,
          album: `Arbok · ${meta.label}`,
          artwork: currentEpisode.coverUrl
            ? [{ src: currentEpisode.coverUrl, sizes: "512x512" }]
            : [],
        });
      }
      ms.playbackState = isPlaying ? "playing" : "paused";
      if (
        typeof ms.setPositionState === "function" &&
        currentEpisode.durationSec > 0
      ) {
        ms.setPositionState({
          duration: currentEpisode.durationSec,
          playbackRate,
          position: Math.max(
            0,
            Math.min(currentEpisode.durationSec, currentEpisode.positionSec)
          ),
        });
      }
    } catch {
      // Ignore browser MediaSession quirks.
    }
  }, [currentEpisode, isPlaying, playbackRate]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    const bind = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null
    ) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Unsupported action on current browser.
      }
    };

    bind("play", () => setIsPlaying(true));
    bind("pause", () => setIsPlaying(false));
    bind("seekbackward", (details) =>
      handleSkip(-(details.seekOffset ?? 15))
    );
    bind("seekforward", (details) => handleSkip(details.seekOffset ?? 15));
    bind("seekto", (details) => {
      if (typeof details.seekTime === "number") {
        handleSeek(details.seekTime, isPlaying);
      }
    });
    bind("nexttrack", () => handlePlayNextTrack());
    bind("previoustrack", () => handlePlayPreviousTrack());

    return () => {
      bind("play", null);
      bind("pause", null);
      bind("seekbackward", null);
      bind("seekforward", null);
      bind("seekto", null);
      bind("nexttrack", null);
      bind("previoustrack", null);
    };
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inInteractive = Boolean(
        target?.closest(
          'input, textarea, select, button, a, [contenteditable="true"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="slider"], [role="combobox"], [role="listbox"], [role="menuitem"], [role="dialog"], [role="alertdialog"]'
        )
      );

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (
          addDialogOpen ||
          settingsDialogOpen ||
          exportDialogOpen ||
          shortcutsDialogOpen
        ) {
          return;
        }
        event.preventDefault();
        if (viewMode === "player" && subSearchRef.current) {
          subSearchRef.current.focus();
        } else if (listSearchRef.current) {
          listSearchRef.current.focus();
        }
        return;
      }

      if (
        inInteractive ||
        addDialogOpen ||
        settingsDialogOpen ||
        exportDialogOpen ||
        shortcutsDialogOpen
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((p) => !p);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleSkip(event.shiftKey ? -30 : -10);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleSkip(event.shiftKey ? 30 : 10);
      } else if (event.key === "[") {
        handleCycleSpeed(-1);
      } else if (event.key === "]") {
        handleCycleSpeed(1);
      } else if (event.key.toLowerCase() === "c" && viewMode === "player") {
        const nextMode: SubtitleMode =
          subtitleMode === "bilingual"
            ? "zh"
            : subtitleMode === "zh"
              ? "orig"
              : subtitleMode === "orig"
                ? "none"
                : "bilingual";
        setSubtitleMode(nextMode);
        persistSettingsPatch({ subtitleDisplayMode: nextMode });
      } else if (
        event.key.toLowerCase() === "a" &&
        viewMode === "player" &&
        currentEpisode.mediaType === "video"
      ) {
        setAudioOnly((prev) => !prev);
      } else if (
        event.key.toLowerCase() === "p" &&
        viewMode === "player" &&
        currentEpisode.mediaType === "video"
      ) {
        event.preventDefault();
        void handleTogglePip();
      } else if (event.key === "Escape" && pipActive) {
        event.preventDefault();
        void handleTogglePip(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function persistSettingsPatch(
    patch: Partial<AppSettings>,
    secrets?: Record<string, string | undefined>
  ) {
    setSettings((prev) => ({ ...prev, ...patch }));
    if (!isBrowserBackendEnabled()) return;
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: patch, secrets }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.keyStatus) setKeyStatus(data.keyStatus);
        if (data?.storage) {
          setStorageUsage(data.storage as StorageUsage);
          setCacheUsedMb((data.storage as StorageUsage).tempCacheMb);
        }
      })
      .catch(() => {});
  }

  function getActiveMediaElement(): HTMLMediaElement | null {
    return useVideoElement ? videoRef.current : audioRef.current;
  }

  function getLivePlaybackPosition(): number {
    if (pendingSeekRef.current !== null && pendingSeekRef.current > 0) {
      return pendingSeekRef.current;
    }
    if (!useYouTubeHd) {
      const el = getActiveMediaElement();
      if (el && el.readyState >= 1 && Number.isFinite(el.currentTime) && el.currentTime > 0) {
        return el.currentTime;
      }
    }
    return Math.max(0, currentEpisode.positionSec);
  }

  function flushEpisodePosition(epId: string, posSec: number) {
    if (!isBrowserBackendEnabled() || !Number.isFinite(posSec) || posSec < 0) return;
    void fetch(`/api/episodes/${encodeURIComponent(epId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ positionSec: posSec }),
    }).catch(() => {});
  }

  function armPendingSeek(posSec: number) {
    if (posSec > 0.5) {
      pendingSeekRef.current = posSec;
      pendingSeekDeadlineRef.current = Date.now() + 5000;
      lastReportedPosRef.current = posSec;
    } else {
      pendingSeekRef.current = null;
      pendingSeekDeadlineRef.current = 0;
      lastReportedPosRef.current = Math.max(0, posSec);
    }
  }

  function applyPendingSeek(el: HTMLMediaElement | null) {
    if (!el || pendingSeekRef.current === null) return;
    const desiredPos = pendingSeekRef.current;
    if (desiredPos <= 0.5) {
      pendingSeekRef.current = null;
      pendingSeekDeadlineRef.current = 0;
      return;
    }
    const maxDur =
      Number.isFinite(el.duration) && el.duration > 1
        ? el.duration
        : latestEpisodeRef.current.durationSec;
    const target = maxDur > 2 ? Math.min(desiredPos, maxDur - 1) : desiredPos;
    if (Math.abs(el.currentTime - target) <= 2.5) {
      pendingSeekRef.current = null;
      pendingSeekDeadlineRef.current = 0;
      return;
    }
    if (el.readyState >= 1) {
      try {
        el.currentTime = target;
        lastReportedPosRef.current = target;
      } catch {
        // Retry on canplay if the browser rejects seek before range metadata resolves.
      }
    }
  }

  function handleMediaLoadedMetadata(el: HTMLMediaElement | null) {
    if (!el) return;
    el.playbackRate = playbackRate;
    el.volume = effectiveMediaVolume;
    if ("videoHeight" in el) {
      const h = (el as HTMLVideoElement).videoHeight;
      if (h > 0) {
        const label =
          h >= 2000
            ? "4K"
            : h >= 1300
              ? "2K"
              : h >= 1000
                ? "1080P"
                : h >= 680
                  ? "720P"
                  : `${h}P`;
        setActualQuality(label);
        setMaxAvailableQuality(null);
      }
    }
    if (
      Number.isFinite(el.duration) &&
      el.duration > 1 &&
      !isDemoPlaceholder(currentEpisode)
    ) {
      const realDuration = Math.round(el.duration);
      if (Math.abs(realDuration - currentEpisode.durationSec) > 3) {
        setEpisodes((prev) =>
          prev.map((ep) =>
            ep.id === currentEpisode.id
              ? { ...ep, durationSec: realDuration }
              : ep
          )
        );
      }
    }

    const desiredPos = pendingSeekRef.current ?? currentEpisode.positionSec;
    if (desiredPos > 0.5 && pendingSeekRef.current === null) {
      armPendingSeek(desiredPos);
    }
    applyPendingSeek(el);

    if (isPlaying) {
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
    }
  }

  function handleMediaCanPlay(el: HTMLMediaElement | null) {
    setIsBuffering(false);
    applyPendingSeek(el);
  }

  function handleMediaTimeUpdate(el: HTMLMediaElement | null) {
    if (!el) return;
    const t = el.currentTime;
    if (pendingSeekRef.current !== null) {
      const target = pendingSeekRef.current;
      if (Math.abs(t - target) <= 2.5) {
        pendingSeekRef.current = null;
        pendingSeekDeadlineRef.current = 0;
      } else if (Date.now() < pendingSeekDeadlineRef.current) {
        if (el.readyState >= 1) {
          applyPendingSeek(el);
        }
        return;
      } else {
        pendingSeekRef.current = null;
        pendingSeekDeadlineRef.current = 0;
      }
    }
    // Guard against transient 0-second ticks emitted right as a media element swaps src.
    if (t < 1 && lastReportedPosRef.current > 5 && el.readyState < 2) {
      return;
    }
    if (Math.abs(t - lastReportedPosRef.current) < 0.25) return;
    lastReportedPosRef.current = t;
    setEpisodes((prev) =>
      prev.map((ep) => (ep.id === currentEpId ? { ...ep, positionSec: t } : ep))
    );
  }

  function persistPlayQueue(nextQueue: string[]) {
    const deduped = Array.from(new Set(nextQueue));
    setPlayQueue(deduped);
    if (!isBrowserBackendEnabled()) return;
    void fetch("/api/queue", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playQueue: deduped }),
    }).catch(() => {});
  }

  function handleAddToQueue(epId: string) {
    if (playQueue.includes(epId)) {
      toaster.info("该单集已在待播队列中");
      return;
    }
    const target = episodes.find((e) => e.id === epId);
    persistPlayQueue([...playQueue, epId]);
    toaster.success(`已加入待播队列：${target?.title ?? "单集"}`);
  }

  function handleRemoveQueueItem(epId: string) {
    persistPlayQueue(playQueue.filter((id) => id !== epId));
  }

  function handleMoveQueueItem(epId: string, dir: -1 | 1) {
    const idx = playQueue.indexOf(epId);
    const targetIdx = idx + dir;
    if (idx === -1 || targetIdx < 0 || targetIdx >= playQueue.length) return;
    const next = [...playQueue];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    persistPlayQueue(next);
  }

  function handleClearQueue() {
    persistPlayQueue([]);
    toaster.info("已清空待播队列");
  }

  function handlePlayNextTrack() {
    const nextQueuedId = playQueue.find((id) =>
      episodes.some((e) => e.id === id)
    );
    if (nextQueuedId) {
      persistPlayQueue(playQueue.filter((id) => id !== nextQueuedId));
      openEpisode(nextQueuedId, 0);
      return;
    }
    if (episodes.length > 1) {
      const idx = episodes.findIndex((e) => e.id === currentEpId);
      const nextEp = episodes[(idx + 1) % episodes.length];
      if (nextEp) {
        openEpisode(nextEp.id, 0);
      }
    }
  }

  function handlePlayPreviousTrack() {
    if (currentEpisode.positionSec > 5) {
      handleSeek(0, isPlaying);
      return;
    }
    if (episodes.length > 1) {
      const idx = episodes.findIndex((e) => e.id === currentEpId);
      const prevEp = episodes[(idx - 1 + episodes.length) % episodes.length];
      if (prevEp) {
        openEpisode(prevEp.id, 0);
      }
    }
  }

  function handleMediaEnded() {
    setIsBuffering(false);
    const nextQueuedId = playQueue.find((id) =>
      episodes.some((e) => e.id === id)
    );
    if (nextQueuedId) {
      persistPlayQueue(playQueue.filter((id) => id !== nextQueuedId));
      openEpisode(nextQueuedId, 0);
      return;
    }
    if (settings.autoPlayNext && episodes.length > 1) {
      const idx = episodes.findIndex((e) => e.id === currentEpId);
      const nextEp = episodes[(idx + 1) % episodes.length];
      if (nextEp) {
        openEpisode(nextEp.id, 0);
        return;
      }
    }
    setIsPlaying(false);
  }

  function handleMediaError() {
    setIsBuffering(false);
    setIsPlaying(false);
    setMediaError("媒体流加载失败，请检查网络连接、代理设置或 B站登录态后重试。");
  }

  function handleRetryPlayback() {
    setMediaError(null);
    pendingSeekRef.current = currentEpisode.positionSec;
    setStreamVersion((v) => v + 1);
    setIsPlaying(true);
  }

  function stopActiveTtsAudioElement() {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.onended = null;
      ttsAudioRef.current.onerror = null;
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    if (ttsObjectUrlRef.current) {
      URL.revokeObjectURL(ttsObjectUrlRef.current);
      ttsObjectUrlRef.current = null;
    }
  }

  function stopTtsDubbing(options?: { keepEnabled?: boolean }) {
    ttsSessionRef.current += 1;
    ttsRequestSeqRef.current += 1;
    stopActiveTtsAudioElement();
    ttsCurrentIdxRef.current = -1;
    ttsBusyRef.current = false;
    pausedByTtsRef.current = false;
    setTtsDubbingStatus("idle");
    if (!options?.keepEnabled) {
      setTtsDubbingEnabled(false);
    }
  }

  function fetchTtsAudioBlob(epId: string, segId: number, text: string): Promise<Blob> {
    const s = latestSettingsRef.current;
    const cacheKey = `${epId}::${segId}::${s.ttsEngine}::${s.cloudTtsProvider}::${s.cloudTtsModel}::${s.cloudTtsVoice}::${s.localTtsModelId}::${s.localTtsVoice}::${s.ttsSpeed ?? 1}::${s.localTtsVoiceStyle ?? ""}`;
    const cached = ttsCacheRef.current.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const inflight = ttsInflightRef.current.get(cacheKey);
    if (inflight) return inflight;

    const promise = fetch("/api/tts/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        engine: s.ttsEngine,
        provider: s.cloudTtsProvider,
        model: s.ttsEngine === "local" ? s.localTtsModelId : s.cloudTtsModel,
        baseUrl:
          s.ttsEngine === "local" ? s.localTtsBaseUrl : s.cloudTtsBaseUrl,
        voice:
          s.ttsEngine === "local" ? s.localTtsVoice || "Tingting" : s.cloudTtsVoice,
        speed: s.ttsSpeed ?? 1,
        stylePrompt: s.localTtsVoiceStyle,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `TTS 合成失败 (${res.status})`);
        }
        const blob = await res.blob();
        ttsCacheRef.current.set(cacheKey, blob);
        return blob;
      })
      .finally(() => {
        ttsInflightRef.current.delete(cacheKey);
      });

    ttsInflightRef.current.set(cacheKey, promise);
    return promise;
  }

  function getSpeakableChineseText(ep: Episode, seg: TranscriptSegment): string {
    if (seg.zh?.trim()) return seg.zh.trim();
    if (ep.language === "zh" || /[\u4e00-\u9fff]/.test(seg.orig)) {
      return seg.orig.trim();
    }
    return "";
  }

  async function speakTtsIndex(startIdx: number, sessionId: number) {
    if (sessionId !== ttsSessionRef.current) return;
    const ep = latestEpisodeRef.current;
    const list = ep.transcript;
    if (startIdx < 0 || startIdx >= list.length) {
      ttsBusyRef.current = false;
      if (pausedByTtsRef.current) {
        pausedByTtsRef.current = false;
        setTtsDubbingStatus("speaking");
        setIsPlaying(true);
      }
      return;
    }

    let idx = startIdx;
    let text = getSpeakableChineseText(ep, list[idx]);
    while (!text && idx + 1 < list.length && idx < latestVideoSegIdxRef.current) {
      idx += 1;
      text = getSpeakableChineseText(ep, list[idx]);
    }
    if (!text) {
      ttsCurrentIdxRef.current = idx;
      ttsBusyRef.current = false;
      if (pausedByTtsRef.current && idx >= latestVideoSegIdxRef.current) {
        pausedByTtsRef.current = false;
        setTtsDubbingStatus("speaking");
        setIsPlaying(true);
      }
      return;
    }

    // Stop any prior utterance and stamp a monotonic request id so overlapping cloud responses never play together.
    stopActiveTtsAudioElement();
    const myRequestSeq = ++ttsRequestSeqRef.current;
    ttsCurrentIdxRef.current = idx;
    ttsBusyRef.current = true;
    if (!pausedByTtsRef.current) {
      setTtsDubbingStatus("speaking");
    }

    /* Prefetch next sentence in background so back-to-back Chinese speech has zero gap. */
    const nextSeg = list[idx + 1];
    if (nextSeg) {
      const nextText = getSpeakableChineseText(ep, nextSeg);
      if (nextText) {
        void fetchTtsAudioBlob(ep.id, nextSeg.id, nextText).catch(() => {});
      }
    }

    try {
      const blob = await fetchTtsAudioBlob(ep.id, list[idx].id, text);
      if (
        sessionId !== ttsSessionRef.current ||
        myRequestSeq !== ttsRequestSeqRef.current
      ) {
        return;
      }

      stopActiveTtsAudioElement();
      const url = URL.createObjectURL(blob);
      ttsObjectUrlRef.current = url;

      const audio = new Audio(url);
      audio.volume = latestVolumeRef.current;
      ttsAudioRef.current = audio;

      audio.onended = () => {
        audio.onended = null;
        audio.onerror = null;
        if (ttsAudioRef.current === audio) {
          ttsAudioRef.current = null;
        }
        if (
          sessionId !== ttsSessionRef.current ||
          myRequestSeq !== ttsRequestSeqRef.current
        ) {
          return;
        }
        ttsBusyRef.current = false;
        const nextIdx = idx + 1;
        const decision = evaluateTtsSync({
          videoSegIndex: latestVideoSegIdxRef.current,
          ttsSegIndex: nextIdx,
          pausedByTts: pausedByTtsRef.current,
        });

        if (decision.action === "resume_video") {
          pausedByTtsRef.current = false;
          setTtsDubbingStatus("speaking");
          setIsPlaying(true);
          if (nextIdx <= latestVideoSegIdxRef.current) {
            void speakTtsIndex(nextIdx, sessionId);
          }
        } else if (nextIdx <= latestVideoSegIdxRef.current) {
          void speakTtsIndex(nextIdx, sessionId);
        }
      };

      audio.onerror = () => {
        audio.onended = null;
        audio.onerror = null;
        if (ttsAudioRef.current === audio) {
          ttsAudioRef.current = null;
        }
        if (sessionId !== ttsSessionRef.current) return;
        ttsBusyRef.current = false;
      };

      await audio.play();
    } catch (err) {
      if (
        sessionId !== ttsSessionRef.current ||
        myRequestSeq !== ttsRequestSeqRef.current
      ) {
        return;
      }
      stopTtsDubbing();
      toaster.error(
        err instanceof Error ? err.message : "中文 TTS 播报失败，请检查语音播报配置"
      );
    }
  }

  function hasConfiguredCloudTtsKey(provider: AppSettings["cloudTtsProvider"]): boolean {
    const preset = getCloudTtsPreset(provider);
    if (preset.requiresKey === false) return true;
    if (keyStatus.ttsKeys?.[provider]?.configured) return true;
    if (provider === "doubao-tts") return Boolean(keyStatus.asrKeys?.doubao?.configured);
    if (provider === "qwen-tts") return Boolean(keyStatus.llmKeys?.qwen?.configured);
    if (provider === "siliconflow-tts") {
      return Boolean(keyStatus.llmKeys?.siliconflow?.configured);
    }
    if (provider === "openai-tts") return Boolean(keyStatus.llmKeys?.openai?.configured);
    if (provider === "deepseek-tts") {
      return Boolean(
        keyStatus.llmKeys?.siliconflow?.configured ||
          keyStatus.llmKeys?.deepseek?.configured
      );
    }
    return false;
  }

  function handleToggleTtsDubbing(enabled: boolean) {
    if (!enabled) {
      stopTtsDubbing();
      toaster.info("已关闭中文语音播报");
      return;
    }

    const hasChinese = currentEpisode.transcript.some(
      (s) => Boolean(s.zh?.trim()) || /[\u4e00-\u9fff]/.test(s.orig)
    );
    if (!hasChinese) {
      toaster.warning("请先等待或点击「翻译双语字幕」生成中文字幕后再开启播报");
      return;
    }

    if (
      isBrowserBackendEnabled() &&
      settings.ttsEngine === "cloud" &&
      !hasConfiguredCloudTtsKey(settings.cloudTtsProvider)
    ) {
      toaster.warning(
        "请先在「偏好设置 → 语音播报 (TTS)」配置云端 API Key，或切换为本地系统增强语音"
      );
      setSettingsTab("tts");
      setSettingsDialogOpen(true);
      return;
    }

    ttsSessionRef.current += 1;
    ttsRequestSeqRef.current += 1;
    stopActiveTtsAudioElement();
    ttsCurrentIdxRef.current = -1;
    ttsBusyRef.current = false;
    pausedByTtsRef.current = false;
    setTtsDubbingEnabled(true);
    setTtsDubbingStatus("speaking");
    toaster.success("已开启中文语音播报（英文超前 2 句时自动暂停视频等待追齐）");
  }

  useEffect(() => {
    if (
      !ttsDubbingEnabled ||
      !isBrowserBackendEnabled() ||
      currentIsDemoPlaceholder ||
      currentVideoSegIdx < 0
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (!isPlaying && !pausedByTtsRef.current) {
        if (ttsAudioRef.current && !ttsAudioRef.current.paused) {
          ttsAudioRef.current.pause();
        }
        return;
      }

      if (isPlaying) {
        if (canResumePausedTtsAudio(ttsAudioRef.current) && ttsBusyRef.current) {
          void ttsAudioRef.current?.play().catch(() => {});
          return;
        }

        if (ttsCurrentIdxRef.current < 0 && !ttsBusyRef.current) {
          void speakTtsIndex(currentVideoSegIdx, ttsSessionRef.current);
          return;
        }

        const decision = evaluateTtsSync({
          videoSegIndex: currentVideoSegIdx,
          ttsSegIndex: ttsCurrentIdxRef.current,
          pausedByTts: pausedByTtsRef.current,
        });

        if (decision.action === "pause_video") {
          pausedByTtsRef.current = true;
          setTtsDubbingStatus("catching_up");
          setIsPlaying(false);
        } else if (
          !ttsBusyRef.current &&
          currentVideoSegIdx > ttsCurrentIdxRef.current
        ) {
          void speakTtsIndex(
            ttsCurrentIdxRef.current + 1,
            ttsSessionRef.current
          );
        }
      }
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ttsDubbingEnabled,
    isPlaying,
    currentVideoSegIdx,
    currentEpisode.id,
    currentIsDemoPlaceholder,
  ]);

  function handleSeek(sec: number, autoPlay = true) {
    const clamped = Math.max(0, Math.min(currentEpisode.durationSec, sec));
    armPendingSeek(clamped);
    if (ttsDubbingEnabled) {
      stopTtsDubbing({ keepEnabled: true });
    }
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.id === currentEpId ? { ...ep, positionSec: clamped } : ep
      )
    );
    flushEpisodePosition(currentEpisode.id, clamped);
    if (useYouTubeHd) {
      ytPlayerRef.current?.seekTo(clamped);
      pendingSeekRef.current = null;
      pendingSeekDeadlineRef.current = 0;
      if (autoPlay) {
        setIsPlaying(true);
        ytPlayerRef.current?.play();
      }
      return;
    }
    const activeEl = getActiveMediaElement();
    if (activeEl && activeEl.readyState >= 1) {
      activeEl.currentTime = clamped;
      pendingSeekRef.current = null;
      pendingSeekDeadlineRef.current = 0;
    }
    if (autoPlay) setIsPlaying(true);
  }

  function handleSkip(delta: number) {
    handleSeek(currentEpisode.positionSec + delta, isPlaying);
  }

  function applyPlaybackRate(nextRate: number, notify = false) {
    const clamped = Math.max(0.5, Math.min(3, nextRate));
    setPlaybackRate(clamped);
    if (currentEpisode.subId) {
      const targetSubId = currentEpisode.subId;
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === targetSubId ? { ...s, playbackRate: clamped } : s
        )
      );
      if (isBrowserBackendEnabled()) {
        void fetch("/api/subscriptions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: targetSubId, playbackRate: clamped }),
        }).catch(() => {});
      }
    }
    if (notify) {
      toaster.info(
        currentEpisode.subId
          ? `播放倍速已调整为 ${clamped}x（已为「${currentEpisode.channel}」记住）`
          : `播放倍速已调整为 ${clamped}x`
      );
    }
  }

  function handleCycleSpeed(dir = 1) {
    const idx = SPEEDS.indexOf(playbackRate);
    const baseIdx = idx === -1 ? SPEEDS.indexOf(1) : idx;
    const next = SPEEDS[(baseIdx + dir + SPEEDS.length) % SPEEDS.length] ?? 1;
    applyPlaybackRate(next, true);
  }

  function handleAudioOnlyChange(nextAudioOnly: boolean) {
    const livePos = getLivePlaybackPosition();
    armPendingSeek(livePos);
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.id === currentEpId ? { ...ep, positionSec: livePos } : ep
      )
    );
    flushEpisodePosition(currentEpisode.id, livePos);
    if (nextAudioOnly && pipActive) {
      void handleTogglePip(false);
    }
    setAudioOnly(nextAudioOnly);
  }

  async function handleTogglePip(force?: boolean) {
    const next = typeof force === "boolean" ? force : !pipActive;

    if (!next) {
      const desktopApi = (
        window as unknown as {
          arbokDesktop?: { setPipMode?: (enabled: boolean) => Promise<boolean> };
        }
      ).arbokDesktop;
      if (desktopApi?.setPipMode) {
        await desktopApi.setPipMode(false).catch(() => {});
      }
      if (docPipWindowRef.current && !docPipWindowRef.current.closed) {
        docPipWindowRef.current.close();
      }
      docPipWindowRef.current = null;
      setDocPipContainer(null);
      setPipActive(false);
      setPipMode("none");
      return;
    }

    if (currentEpisode.mediaType !== "video") {
      toaster.info("当前单集为纯音频播客，仅视频单集支持画中画播放");
      return;
    }

    if (audioOnly) {
      pendingSeekRef.current = currentEpisode.positionSec;
      setAudioOnly(false);
    }

    const desktopApi = (
      window as unknown as {
        arbokDesktop?: {
          isDesktop?: boolean;
          setPipMode?: (enabled: boolean) => Promise<boolean>;
        };
      }
    ).arbokDesktop;

    if (desktopApi?.setPipMode) {
      try {
        await desktopApi.setPipMode(true);
        setPipMode("desktop");
        setPipActive(true);
        return;
      } catch {
        // Fallback to in-app floating PiP if desktop IPC fails.
      }
    }

    const docPipApi = (
      window as unknown as {
        documentPictureInPicture?: {
          requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
        };
      }
    ).documentPictureInPicture;

    if (docPipApi && typeof docPipApi.requestWindow === "function") {
      try {
        const pipWin = await docPipApi.requestWindow({
          width: 520,
          height: 293,
        });
        pipWin.document.documentElement.setAttribute("data-theme", resolvedTheme);
        pipWin.document.body.style.margin = "0";
        pipWin.document.body.style.background = "#18181b";
        pipWin.document.body.style.overflow = "hidden";

        for (const sheet of Array.from(document.styleSheets)) {
          try {
            const cssText = Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join("\n");
            const styleEl = pipWin.document.createElement("style");
            styleEl.textContent = cssText;
            pipWin.document.head.appendChild(styleEl);
          } catch {
            if (sheet.href) {
              const link = pipWin.document.createElement("link");
              link.rel = "stylesheet";
              link.href = sheet.href;
              pipWin.document.head.appendChild(link);
            }
          }
        }

        const mount = pipWin.document.createElement("div");
        mount.style.width = "100vw";
        mount.style.height = "100vh";
        pipWin.document.body.appendChild(mount);

        docPipWindowRef.current = pipWin;
        pipWin.addEventListener(
          "pagehide",
          () => {
            if (docPipWindowRef.current === pipWin) {
              docPipWindowRef.current = null;
              setDocPipContainer(null);
              setPipActive(false);
              setPipMode("none");
            }
          },
          { once: true }
        );

        setDocPipContainer(mount);
        setPipMode("document");
        setPipActive(true);
        return;
      } catch {
        // Fallback to in-app floating PiP when Document PiP is unavailable or blocked.
      }
    }

    setPipMode("floating");
    setPipActive(true);
  }

  function handleToggleStarred(epId: string) {
    const target = episodes.find((e) => e.id === epId);
    if (!target) return;
    const nextStarred = !Boolean(target.isStarred);
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.id === epId ? { ...ep, isStarred: nextStarred } : ep
      )
    );
    if (isBrowserBackendEnabled()) {
      void fetch(`/api/episodes/${encodeURIComponent(epId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStarred: nextStarred }),
      }).catch(() => {});
    }
    if (nextStarred) {
      toaster.success(`已收藏「${target.title}」`);
    } else {
      toaster.info(`已取消收藏「${target.title}」`);
    }
  }

  function handlePlayAllFavorites(epIds: string[]) {
    if (epIds.length === 0) return;
    const [firstId, ...restIds] = epIds;
    persistPlayQueue(restIds);
    openEpisode(firstId);
    setIsPlaying(true);
    toaster.success(`开始播放收藏列表（共 ${epIds.length} 集）`);
  }

  function handleVideoQualityChange(nextQuality: string) {
    const livePos = getLivePlaybackPosition();
    armPendingSeek(livePos);
    setVideoQuality(nextQuality);
    if (useYouTubeHd) {
      ytPlayerRef.current?.setQuality(nextQuality);
    }
    toaster.info(`已请求切换清晰度至 ${nextQuality}（若片源不足将自动锁定最高画质）`);
  }

  function handleTranslationPairChange(nextPair: TranslationPairId) {
    persistSettingsPatch({ translationPair: nextPair });
    if (nextPair === "off") {
      if (translationAbortRef.current) {
        translationAbortRef.current.abort();
        translationAbortRef.current = null;
      }
      translationInFlightRef.current = false;
      setTranslationProgress(null);
      toaster.info("已关闭字幕翻译");
      return;
    }
    if (viewMode === "player" && currentEpisode.transcript.length > 0) {
      void handleTranslateSubtitles(currentEpisode.id, true, {
        translationPair: nextPair,
      });
    }
  }

  function handleBackToList() {
    const livePos = getLivePlaybackPosition();
    armPendingSeek(livePos);
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.id === currentEpId ? { ...ep, positionSec: livePos } : ep
      )
    );
    flushEpisodePosition(currentEpisode.id, livePos);
    if (pipActive) {
      void handleTogglePip(false);
    }
    setViewMode("list");
  }

  async function handleFetchOfficialSubtitles(epId: string, force = false) {
    if (!isBrowserBackendEnabled()) return;
    setFetchingSubtitlesEpId(epId);
    try {
      const res = await fetch(
        `/api/episodes/${encodeURIComponent(epId)}/subtitles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        }
      );
      const data = (await res.json()) as {
        transcript?: TranscriptSegment[];
        description?: string;
        notice?: string;
        needLogin?: boolean;
        error?: string;
      };
      if (res.ok && ((data.transcript && data.transcript.length > 0) || data.description)) {
        setEpisodes((prev) =>
          prev.map((ep) =>
            ep.id === epId
              ? {
                  ...ep,
                  hasOfficialSub:
                    ep.hasOfficialSub || Boolean(data.transcript?.length),
                  transcript:
                    data.transcript && data.transcript.length > 0
                      ? data.transcript
                      : ep.transcript,
                  description: data.description ?? ep.description,
                }
              : ep
          )
        );
        if (data.transcript && data.transcript.length > 0 && force) {
          toaster.success(`已拉取完整官方字幕（共 ${data.transcript.length} 句）`);
        } else if (force && (!data.transcript || data.transcript.length === 0)) {
          if (data.needLogin) {
            toaster.warning(
              data.notice ??
                "该 B站视频官方 AI 字幕需要登录后解锁，请先在「偏好设置 → B站账号」扫码登录"
            );
          } else {
            toaster.info(
              data.notice ??
                "该单集暂无可用的平台官方字幕，可使用 ASR 语音转写"
            );
          }
        }
      } else if (force) {
        if (data.needLogin) {
          toaster.warning(
            data.notice ??
              "该 B站视频官方 AI 字幕需要登录后解锁，请先在「偏好设置 → B站账号」扫码登录"
          );
        } else {
          toaster.info(
            data.notice ??
              data.error ??
              "该单集暂无可用的平台官方字幕，可使用 ASR 语音转写"
          );
        }
      }
    } catch {
      if (force) toaster.error("拉取官方字幕失败，请检查网络或代理设置");
    } finally {
      setFetchingSubtitlesEpId((cur) => (cur === epId ? null : cur));
    }
  }

  function openEpisode(epId: string, startSec?: number) {
    const switching = currentEpId !== epId;
    const target = episodes.find((e) => e.id === epId);
    const prevLivePos = getLivePlaybackPosition();
    if (switching) {
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === currentEpId ? { ...ep, positionSec: prevLivePos } : ep
        )
      );
      flushEpisodePosition(currentEpId, prevLivePos);
    }
    setMediaError(null);
    if (switching) {
      stopTtsDubbing();
      if (pipActive && target && target.mediaType !== "video") {
        void handleTogglePip(false);
      }
      setActualQuality(null);
      setMaxAvailableQuality(null);
      setYtEmbedFallbackEpId(null);
      const subForTarget = target?.subId
        ? subscriptions.find((s) => s.id === target.subId)
        : undefined;
      setPlaybackRate(
        typeof subForTarget?.playbackRate === "number"
          ? subForTarget.playbackRate
          : 1
      );
    }
    setCurrentEpId(epId);
    setViewMode("player");
    setAudioOnly(false);
    if (switching) {
      setRightTab("subtitles");
      setStreamingChatText(null);
      setTranslationProgress(null);
    }
    const rememberedPos = switching ? (target?.positionSec ?? 0) : prevLivePos;
    const isNearEnd =
      target && target.durationSec > 10 && rememberedPos >= target.durationSec - 3;
    const desiredPos =
      typeof startSec === "number"
        ? startSec
        : isNearEnd
          ? 0
          : rememberedPos;
    armPendingSeek(desiredPos);

    if (typeof startSec === "number" || (!switching && prevLivePos > 0)) {
      const nextPos = Math.max(
        0,
        Math.min(target?.durationSec ?? desiredPos, desiredPos)
      );
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === epId ? { ...ep, positionSec: nextPos } : ep
        )
      );
    }
    if (typeof startSec === "number") {
      setIsPlaying(true);
    }

    if (
      isBrowserBackendEnabled() &&
      target &&
      (target.transcript.length === 0 || !target.description) &&
      !isDemoPlaceholder(target) &&
      (target.platform === "youtube" || target.platform === "bilibili")
    ) {
      void handleFetchOfficialSubtitles(epId, false);
    }
  }

  async function handleAddUrl(
    url: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isBrowserBackendEnabled()) {
      const detected = detectPlatformFromUrl(url) ?? "podcast";
      const meta = getPlatformMeta(detected);
      const isVideo = detected === "youtube" || detected === "bilibili";
      const newId = `ep-import-${Date.now()}`;
      const newEpisode: Episode = {
        id: newId,
        subId: null,
        platform: detected,
        channel: "单链接导入",
        title: `${meta.label}单集（${url.slice(0, 42)}）`,
        date: "刚刚",
        durationSec: 120,
        positionSec: 0,
        mediaType: isVideo ? "video" : "audio",
        language: detected === "youtube" ? "en" : "zh",
        hasOfficialSub: true,
        isBilingual: false,
        hasAiGuide: false,
        isOffline: false,
        gradient:
          detected === "bilibili"
            ? "linear-gradient(135deg, #be185d, #db2777)"
            : detected === "youtube"
              ? "linear-gradient(135deg, #9f1239, #e11d48)"
              : "linear-gradient(135deg, #4338ca, #6366f1)",
        coverKicker: meta.label,
        coverLabel: "NEW",
        pageUrl: url,
        transcript: [
          {
            id: Date.now(),
            start: 0,
            end: 30,
            orig:
              detected === "youtube"
                ? "Welcome to this imported video. Click Translate to generate cached bilingual subtitles."
                : "已成功解析媒体链接并载入 Arbok 纯净播放器，点击右侧 AI 导读可立即提炼大纲。",
          },
        ],
        guide: null,
        chat: [],
      };
      setEpisodes((prev) => [newEpisode, ...prev]);
      toaster.success(`已解析并导入 ${meta.label} 内容`);
      openEpisode(newId);
      return { ok: true };
    }

    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as {
        error?: string;
        kind?: "subscription" | "episode";
        subscription?: Subscription;
        episode?: Episode;
        addedCount?: number;
        subscriptions?: Subscription[];
        episodes?: Episode[];
      };

      if (!res.ok || !data.episode) {
        const message = data.error ?? "链接解析失败，请确认地址有效且网络可达";
        toaster.error(message);
        return { ok: false, error: message };
      }

      if (Array.isArray(data.subscriptions)) {
        setSubscriptions(data.subscriptions);
      }
      if (Array.isArray(data.episodes)) {
        setEpisodes(data.episodes);
      }

      if (data.kind === "subscription" && data.subscription) {
        toaster.success(
          `已订阅「${data.subscription.name}」，导入 ${data.addedCount ?? 1} 期可播放单集`
        );
      } else {
        toaster.success(`已解析并导入「${data.episode.title}」`);
      }

      setCurrentEpId(data.episode.id);
      setViewMode("player");
      setAudioOnly(false);
      setRightTab("subtitles");
      setMediaError(null);
      pendingSeekRef.current = 0;
      lastReportedPosRef.current = 0;
      setIsPlaying(true);
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "网络请求失败，请重试";
      toaster.error(message);
      return { ok: false, error: message };
    }
  }

  async function handleToggleDirectorySubscribe(item: PodcastDirectoryItem) {
    const nextSub = !item.subscribed;
    setDirectory((prev) =>
      prev.map((d) =>
        d.id === item.id ||
        (item.feedUrl && d.feedUrl === item.feedUrl) ||
        d.name === item.name
          ? { ...d, subscribed: nextSub }
          : d
      )
    );

    if (nextSub) {
      if (isBrowserBackendEnabled() && item.feedUrl) {
        try {
          const res = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: item.feedUrl }),
          });
          const data = (await res.json()) as {
            error?: string;
            addedCount?: number;
            subscriptions?: Subscription[];
            episodes?: Episode[];
          };
          if (!res.ok) {
            throw new Error(data.error ?? "订阅 RSS 拉取失败");
          }
          if (Array.isArray(data.subscriptions)) {
            setSubscriptions(data.subscriptions);
          }
          if (Array.isArray(data.episodes)) {
            setEpisodes(data.episodes);
          }
          toaster.success(
            `已订阅播客「${item.name}」，导入 ${data.addedCount ?? 0} 期单集`
          );
          return;
        } catch (err) {
          setDirectory((prev) =>
            prev.map((d) =>
              d.id === item.id ? { ...d, subscribed: false } : d
            )
          );
          toaster.error(
            err instanceof Error ? err.message : `订阅「${item.name}」失败`
          );
          return;
        }
      }

      const sub: Subscription = {
        id: `sub-${item.id}`,
        name: item.name,
        platform: "podcast",
        sourceUrl: item.feedUrl,
        coverUrl: item.coverUrl,
        gradient: "linear-gradient(135deg, #4338ca, #6366f1)",
        shortLabel: item.name.slice(0, 3),
      };
      setSubscriptions((prev) =>
        prev.some((s) => s.name === item.name) ? prev : [...prev, sub]
      );
      toaster.success(`已订阅播客「${item.name}」`);
    } else {
      const existingSub = subscriptions.find(
        (s) =>
          (item.feedUrl && s.sourceUrl === item.feedUrl) ||
          s.name.toLowerCase() === item.name.toLowerCase()
      );
      setSubscriptions((prev) =>
        prev.filter((s) => s.name.toLowerCase() !== item.name.toLowerCase())
      );
      if (isBrowserBackendEnabled() && existingSub) {
        void fetch("/api/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: existingSub.id }),
        }).catch(() => {});
      }
      toaster.info(`已退订播客「${item.name}」`);
    }
  }

  function findMatchingSubscriptionForRecommended(
    show: RecommendedShow,
    subs: Subscription[]
  ): Subscription | undefined {
    const backendLive = isBrowserBackendEnabled();
    const normShowUrl = show.sourceUrl?.trim().replace(/\/+$/, "").toLowerCase();
    const normShowName = show.name.trim().toLowerCase();
    const primaryToken = normShowName.split(/[\s(（:：]/)[0] ?? normShowName;

    return subs.find((s) => {
      if (backendLive && s.sourceUrl?.includes("arbok.local/source/sub-rec-")) {
        return false;
      }
      const normSubUrl = s.sourceUrl?.trim().replace(/\/+$/, "").toLowerCase();
      if (normShowUrl && normSubUrl && normSubUrl === normShowUrl) {
        return true;
      }
      if (!backendLive && s.id === `sub-${show.id}`) {
        return true;
      }
      const normSubName = s.name.trim().toLowerCase();
      if (normSubName === normShowName) return true;
      if (
        primaryToken.length >= 4 &&
        (normSubName.startsWith(primaryToken) || normSubName.includes(primaryToken))
      ) {
        return true;
      }
      return false;
    });
  }

  const syncedRecommendedShows = useMemo(
    () =>
      recommendedShows.map((show) => ({
        ...show,
        subscribed: Boolean(
          findMatchingSubscriptionForRecommended(show, subscriptions)
        ),
      })),
    [recommendedShows, subscriptions]
  );

  async function handleToggleRecommendSubscribe(recId: string) {
    const target = syncedRecommendedShows.find((r) => r.id === recId);
    if (!target) return;
    const nextSub = !target.subscribed;
    const subId = `sub-${recId}`;

    if (nextSub) {
      if (isBrowserBackendEnabled()) {
        if (!target.sourceUrl) {
          toaster.error(`「${target.name}」暂未配置可用订阅源地址`);
          return;
        }
        setSubscribingRecId(recId);
        toaster.info(`正在拉取「${target.name}」真实订阅源与单集…`);
        try {
          const staleDummy = subscriptions.find(
            (s) =>
              s.id === subId ||
              (s.sourceUrl?.includes("arbok.local/source/sub-rec-") &&
                s.name.toLowerCase() === target.name.toLowerCase())
          );
          if (staleDummy) {
            await fetch("/api/subscriptions", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: staleDummy.id }),
            }).catch(() => {});
          }

          const res = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: target.sourceUrl }),
          });
          const data = (await res.json()) as {
            error?: string;
            addedCount?: number;
            totalParsed?: number;
            subscriptions?: Subscription[];
            episodes?: Episode[];
          };
          if (!res.ok) throw new Error(data.error ?? "订阅拉取失败");
          if (Array.isArray(data.subscriptions)) {
            setSubscriptions(data.subscriptions);
          }
          if (Array.isArray(data.episodes)) {
            setEpisodes(data.episodes);
          }
          setRecommendedShows((prev) =>
            prev.map((r) => (r.id === recId ? { ...r, subscribed: true } : r))
          );
          toaster.success(
            `已订阅「${target.name}」，导入 ${data.totalParsed ?? data.addedCount ?? 0} 期单集`
          );
        } catch (err) {
          toaster.error(
            err instanceof Error ? err.message : `订阅「${target.name}」失败`
          );
        } finally {
          setSubscribingRecId(null);
        }
        return;
      }

      setRecommendedShows((prev) =>
        prev.map((r) => (r.id === recId ? { ...r, subscribed: true } : r))
      );
      const sub: Subscription = {
        id: subId,
        name: target.name,
        platform: target.platform,
        sourceUrl: target.sourceUrl,
        gradient: target.gradient,
        shortLabel: target.shortLabel,
      };
      setSubscriptions((prev) =>
        prev.some((s) => s.name === target.name) ? prev : [...prev, sub]
      );
      toaster.success(`已订阅「${target.name}」`);
    } else {
      const existingSub = findMatchingSubscriptionForRecommended(
        target,
        subscriptions
      );
      const targetIdToDelete = existingSub?.id ?? subId;
      setRecommendedShows((prev) =>
        prev.map((r) => (r.id === recId ? { ...r, subscribed: false } : r))
      );
      setSubscriptions((prev) =>
        prev.filter((s) => s.id !== targetIdToDelete && s.id !== subId)
      );
      if (activeNav === targetIdToDelete || activeNav === subId) {
        setActiveNav("inbox");
      }
      if (isBrowserBackendEnabled()) {
        const res = await fetch("/api/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: targetIdToDelete }),
        }).catch(() => null);
        if (res?.ok) {
          const data = (await res.json()) as { subscriptions?: Subscription[] };
          if (Array.isArray(data.subscriptions)) {
            setSubscriptions(data.subscriptions);
          }
        }
      }
      toaster.info(`已取消订阅「${target.name}」`);
    }
  }

  async function handleImportLocalFile(
    file: File,
    customTitle?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const lower = file.name.toLowerCase();
    const supported = [".mp3", ".m4a", ".wav", ".mp4", ".mov"].some((ext) =>
      lower.endsWith(ext)
    );
    if (!supported) {
      const msg = "暂不支持该文件格式，请拖入 .mp3 / .m4a / .wav / .mp4 / .mov 文件";
      toaster.error(msg);
      return { ok: false, error: msg };
    }

    if (!isBrowserBackendEnabled()) {
      const isVideo = lower.endsWith(".mp4") || lower.endsWith(".mov");
      const ext = file.name.split(".").pop()?.toUpperCase() ?? "LOCAL";
      const displayTitle =
        customTitle?.trim() || file.name.replace(/\.[^.]+$/, "");
      const newEp: Episode = {
        id: `ep-local-${Date.now()}`,
        subId: null,
        platform: "local",
        channel: "本地文件",
        title: displayTitle,
        subtitle: `${ext} · 本地离线可用`,
        date: "刚刚导入",
        durationSec: 180,
        positionSec: 0,
        mediaType: isVideo ? "video" : "audio",
        language: /[\u4e00-\u9fff]/.test(displayTitle) ? "zh" : "en",
        hasOfficialSub: false,
        isBilingual: false,
        hasAiGuide: false,
        isOffline: true,
        gradient: isVideo
          ? "linear-gradient(135deg, #0f766e, #0e7490)"
          : "linear-gradient(135deg, #115e59, #059669)",
        coverKicker: isVideo ? "LOCAL VIDEO" : "LOCAL AUDIO",
        coverLabel: ext,
        pageUrl: `local://${encodeURIComponent(file.name)}`,
        localFilePath: `/local/${file.name}`,
        transcript: [],
        guide: null,
        chat: [],
      };
      setEpisodes((prev) => [newEp, ...prev]);
      openEpisode(newEp.id, 0);
      toaster.success(`已导入本地文件：${displayTitle}`);
      return { ok: true };
    }

    try {
      const form = new FormData();
      form.append("file", file);
      if (customTitle?.trim()) {
        form.append("title", customTitle.trim());
      }
      const res = await fetch("/api/ingest/local", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        episode?: Episode;
        episodes?: Episode[];
        storage?: StorageUsage;
        error?: string;
      };
      if (!res.ok || !data.episode) {
        const msg = data.error ?? "导入本地文件失败";
        toaster.error(msg);
        return { ok: false, error: msg };
      }
      if (Array.isArray(data.episodes)) {
        setEpisodes(data.episodes);
      } else {
        setEpisodes((prev) => [data.episode!, ...prev]);
      }
      if (data.storage) {
        setStorageUsage(data.storage);
        setCacheUsedMb(data.storage.tempCacheMb);
      }
      openEpisode(data.episode.id, 0);
      toaster.success(`已导入本地文件「${data.episode.title}」，可直接播放或转写字幕`);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "导入本地文件失败";
      toaster.error(msg);
      return { ok: false, error: msg };
    }
  }

  async function handleToggleOffline(epId: string) {
    const target = episodes.find((e) => e.id === epId);
    if (!target) return;
    if (target.platform === "local") {
      toaster.info("本地导入文件默认始终离线可用");
      return;
    }

    if (!isBrowserBackendEnabled()) {
      const nextOffline = !target.isOffline;
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === epId ? { ...ep, isOffline: nextOffline } : ep
        )
      );
      toaster.info(nextOffline ? "已加入本地离线下载队列" : "已移除本地离线缓存");
      return;
    }

    if (target.isOffline) {
      await handleRemoveOffline(epId);
      return;
    }

    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: epId, action: "start" }),
      });
      const data = (await res.json()) as {
        jobs?: OfflineDownloadJob[];
        episodes?: Episode[];
        storage?: StorageUsage;
        error?: string;
      };
      if (!res.ok) {
        toaster.error(data.error ?? "启动离线下载失败");
        return;
      }
      if (Array.isArray(data.jobs)) setDownloadJobs(data.jobs);
      if (Array.isArray(data.episodes)) setEpisodes(data.episodes);
      if (data.storage) {
        setStorageUsage(data.storage);
        setCacheUsedMb(data.storage.tempCacheMb);
      }
      toaster.success(`已加入离线下载队列：${target.title}`);
    } catch {
      toaster.error("无法启动离线下载任务");
    }
  }

  async function handleDownloadAction(
    epId: string,
    action: "pause" | "resume" | "cancel"
  ) {
    if (!isBrowserBackendEnabled()) return;
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: epId, action }),
      });
      const data = (await res.json()) as {
        jobs?: OfflineDownloadJob[];
        episodes?: Episode[];
        storage?: StorageUsage;
        error?: string;
      };
      if (!res.ok) {
        toaster.error(data.error ?? "操作下载队列失败");
        return;
      }
      if (Array.isArray(data.jobs)) setDownloadJobs(data.jobs);
      if (Array.isArray(data.episodes)) setEpisodes(data.episodes);
      if (data.storage) {
        setStorageUsage(data.storage);
        setCacheUsedMb(data.storage.tempCacheMb);
      }
      if (action === "pause") toaster.info("已暂停离线下载（支持断点续传）");
      if (action === "resume") toaster.info("已恢复离线下载");
      if (action === "cancel") toaster.info("已取消离线下载任务");
    } catch {
      toaster.error("操作下载队列失败");
    }
  }

  async function handleRemoveOffline(epId: string) {
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.id === epId
          ? { ...ep, isOffline: false, localFilePath: undefined }
          : ep
      )
    );
    if (isBrowserBackendEnabled()) {
      const res = await fetch(`/api/downloads/${encodeURIComponent(epId)}`, {
        method: "DELETE",
      }).catch(() => null);
      if (res && res.ok) {
        const data = (await res.json()) as {
          jobs?: OfflineDownloadJob[];
          episodes?: Episode[];
          storage?: StorageUsage;
        };
        if (Array.isArray(data.jobs)) setDownloadJobs(data.jobs);
        if (Array.isArray(data.episodes)) setEpisodes(data.episodes);
        if (data.storage) {
          setStorageUsage(data.storage);
          setCacheUsedMb(data.storage.tempCacheMb);
        }
      }
    }
    toaster.info("已移除本地离线文件");
  }

  async function handleClearCache() {
    if (!isBrowserBackendEnabled()) {
      setCacheUsedMb(0);
      toaster.success("已清空临时流媒体缓存");
      return;
    }
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    }).catch(() => null);
    if (res && res.ok) {
      const data = (await res.json()) as { storage?: StorageUsage };
      if (data.storage) {
        setStorageUsage(data.storage);
        setCacheUsedMb(data.storage.tempCacheMb);
      } else {
        setCacheUsedMb(0);
      }
      toaster.success("已清空临时流媒体缓存（离线下载与本地文件均已保留）");
    } else {
      toaster.error("清理缓存失败");
    }
  }

  async function handleEnforceCacheLru() {
    if (!isBrowserBackendEnabled()) {
      toaster.info("当前临时缓存未超过上限");
      return;
    }
    const res = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "enforce-lru",
        limitMb: settings.cacheLimitMb,
      }),
    }).catch(() => null);
    if (res && res.ok) {
      const data = (await res.json()) as {
        evictedCount?: number;
        freedBytes?: number;
        storage?: StorageUsage;
      };
      if (data.storage) {
        setStorageUsage(data.storage);
        setCacheUsedMb(data.storage.tempCacheMb);
      }
      if ((data.evictedCount ?? 0) > 0) {
        toaster.success(
          `LRU 治理完成：已清理 ${data.evictedCount} 个过期缓存文件，释放 ${((data.freedBytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`
        );
      } else {
        toaster.info("临时缓存处于上限范围内，无需清理");
      }
    }
  }

  async function handleRefreshFeeds() {
    if (!isBrowserBackendEnabled()) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      toaster.success(`已刷新 ${subscriptions.length} 个订阅源，全部为最新状态`);
      return;
    }

    try {
      const res = await fetch("/api/subscriptions/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        refreshedSources?: number;
        newEpisodes?: number;
        errors?: string[];
        subscriptions?: Subscription[];
        episodes?: Episode[];
        error?: string;
      };
      if (!res.ok) {
        toaster.error(data.error ?? "刷新订阅源失败");
        return;
      }
      if (Array.isArray(data.subscriptions)) setSubscriptions(data.subscriptions);
      if (Array.isArray(data.episodes)) setEpisodes(data.episodes);
      if ((data.refreshedSources ?? 0) === 0) {
        toaster.info("当前尚无已绑定的外部 RSS / 频道订阅源，请先添加订阅");
      } else if (data.errors && data.errors.length > 0) {
        toaster.warning(
          `已刷新 ${data.refreshedSources} 个订阅源（新增 ${data.newEpisodes ?? 0} 期），${data.errors.length} 个源失败`
        );
      } else {
        toaster.success(
          `已刷新 ${data.refreshedSources} 个订阅源，新增 ${data.newEpisodes ?? 0} 期单集`
        );
      }
    } catch (err) {
      toaster.error(err instanceof Error ? err.message : "刷新订阅源失败");
    }
  }

  async function handleStartBiliQr() {
    if (!isBrowserBackendEnabled()) {
      persistSettingsPatch({ biliLoggedIn: true });
      toaster.success("模拟 B站扫码成功");
      return;
    }
    try {
      const res = await fetch("/api/auth/bilibili/qr");
      const data = (await res.json()) as {
        qrcodeKey?: string;
        qrSvg?: string;
        error?: string;
      };
      if (!res.ok || !data.qrcodeKey || !data.qrSvg) {
        toaster.error(data.error ?? "获取 B站登录二维码失败");
        return;
      }
      setBiliQr({
        qrcodeKey: data.qrcodeKey,
        qrSvg: data.qrSvg,
        status: "waiting",
        message: "请使用手机哔哩哔哩 App 扫描二维码…",
      });
    } catch (err) {
      toaster.error(err instanceof Error ? err.message : "获取二维码失败");
    }
  }

  function handleLogoutBili() {
    setBiliQr(null);
    persistSettingsPatch({ biliLoggedIn: false }, { biliCookie: "" });
    toaster.info("已退出 B站账号登录态并清除钥匙串凭证");
  }

  async function handleSaveLlmConfig(overrides?: {
    provider?: LlmProviderId;
    model?: string;
    baseUrl?: string;
    localAiConfigs?: AppSettings["localAiConfigs"];
  }) {
    const targetProvider = overrides?.provider ?? settings.llmProvider;
    const nextPatch: Partial<AppSettings> = {
      llmProvider: settings.llmProvider,
      llmModel: settings.llmModel,
      llmBaseUrl: settings.llmBaseUrl,
      llmGuideProvider: settings.llmGuideProvider,
      llmTranslateProvider: settings.llmTranslateProvider,
      translationStyle: settings.translationStyle,
      localAiConfigs: overrides?.localAiConfigs ?? settings.localAiConfigs,
    };
    if (overrides?.provider && overrides.provider === settings.llmProvider) {
      if (overrides.model !== undefined) nextPatch.llmModel = overrides.model;
      if (overrides.baseUrl !== undefined) nextPatch.llmBaseUrl = overrides.baseUrl;
    }

    if (isBrowserBackendEnabled()) {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: nextPatch,
          secrets: llmApiKeyDraft.trim()
            ? {
                llmProvider: targetProvider,
                llmApiKey: llmApiKeyDraft.trim(),
              }
            : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.keyStatus) setKeyStatus(data.keyStatus);
      }
    }
    setLlmApiKeyDraft("");
    toaster.success(
      llmApiKeyDraft.trim()
        ? "AI 翻译配置已保存（密钥已加密写入系统钥匙串）"
        : "AI 翻译配置已保存"
    );
  }

  function handleDeleteLlmKey(provider: AppSettings["llmProvider"]) {
    persistSettingsPatch({}, { llmProvider: provider, llmApiKey: "" });
    setKeyStatus((prev) => ({
      ...prev,
      llmKeys: {
        ...prev.llmKeys,
        [provider]: { configured: false, masked: "" },
      },
    }));
    toaster.info("已从系统钥匙串移除该服务商 API Key");
  }

  async function handleTestLlm(overrides?: {
    provider?: LlmProviderId;
    model?: string;
    baseUrl?: string;
  }) {
    if (!isBrowserBackendEnabled()) {
      setLlmTestResult({ ok: true, message: "连接测试通过（测试环境模拟 12ms）" });
      return;
    }
    const targetProvider = overrides?.provider ?? settings.llmProvider;
    const targetModel = overrides?.model ?? settings.llmModel;
    const targetBaseUrl = overrides?.baseUrl ?? settings.llmBaseUrl;
    const res = await fetch("/api/settings/test-llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: targetProvider,
        model: targetModel,
        baseUrl: targetBaseUrl,
        apiKey: llmApiKeyDraft.trim() || undefined,
      }),
    });
    const data = (await res.json()) as { ok: boolean; message: string };
    setLlmTestResult(data);
    if (data.ok) {
      toaster.success(data.message);
    } else {
      toaster.error(data.message);
    }
  }

  async function handleSaveAsrConfig() {
    if (isBrowserBackendEnabled()) {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            asrEngine: settings.asrEngine,
            cloudAsrProvider: settings.cloudAsrProvider,
            cloudAsrBaseUrl: settings.cloudAsrBaseUrl,
            cloudAsrModel: settings.cloudAsrModel,
            localAsrModelId: settings.localAsrModelId,
          },
          secrets: asrApiKeyDraft.trim()
            ? {
                asrProvider: settings.cloudAsrProvider,
                asrApiKey: asrApiKeyDraft.trim(),
              }
            : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.keyStatus) setKeyStatus(data.keyStatus);
      }
    }
    setAsrApiKeyDraft("");
    toaster.success("ASR 引擎配置已保存");
  }

  async function handleDownloadLocalModel(modelId: string) {
    if (!isBrowserBackendEnabled()) return;
    setAsrModelDownloads((prev) => ({
      ...prev,
      [modelId]: {
        modelId,
        status: "downloading",
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        updatedAt: Date.now(),
      },
    }));
    toaster.info("开始后台下载本地离线 ASR 模型…");
    const res = await fetch("/api/asr/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId, async: true }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      models?: LocalAsrModel[];
      downloads?: Record<string, LocalModelDownloadState>;
    };
    if (res.ok) {
      if (Array.isArray(data.models)) setLocalModels(data.models);
      if (data.downloads) setAsrModelDownloads(data.downloads);
    } else {
      setAsrModelDownloads((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      toaster.error(data.error ?? "模型下载失败");
    }
  }

  async function handleRefreshLocalModels() {
    if (!isBrowserBackendEnabled()) {
      toaster.info("已重新扫描本机模型目录");
      return;
    }
    const res = await fetch("/api/asr/models").catch(() => null);
    if (res && res.ok) {
      const data = (await res.json()) as {
        models?: LocalAsrModel[];
        downloads?: Record<string, LocalModelDownloadState>;
      };
      if (Array.isArray(data.models)) setLocalModels(data.models);
      if (data.downloads) setAsrModelDownloads(data.downloads);
      const installedCount = (data.models ?? []).filter((m) => m.installed).length;
      toaster.success(`已完成本机模型扫描，共检测到 ${installedCount} 个已下载模型`);
    }
  }

  async function handleDeleteLocalModel(modelId: string) {
    if (!isBrowserBackendEnabled()) return;
    const res = await fetch("/api/asr/models", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    const data = await res.json();
    if (res.ok && data.models) {
      setLocalModels(data.models);
      toaster.info("已删除本机模型文件");
    }
  }

  async function handleSaveTtsConfig() {
    if (isBrowserBackendEnabled()) {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ttsEngine: settings.ttsEngine,
            cloudTtsProvider: settings.cloudTtsProvider,
            cloudTtsModel: settings.cloudTtsModel,
            cloudTtsBaseUrl: settings.cloudTtsBaseUrl,
            cloudTtsVoice: settings.cloudTtsVoice,
            localTtsBaseUrl: settings.localTtsBaseUrl,
            localTtsModelId: settings.localTtsModelId,
            localTtsVoice: settings.localTtsVoice,
            localTtsVoiceStyle: settings.localTtsVoiceStyle,
            ttsSpeed: settings.ttsSpeed,
          },
          secrets: ttsApiKeyDraft.trim()
            ? {
                ttsProvider: settings.cloudTtsProvider,
                ttsApiKey: ttsApiKeyDraft.trim(),
              }
            : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.keyStatus) setKeyStatus(data.keyStatus);
      }
    }
    setTtsApiKeyDraft("");
    toaster.success("语音播报（TTS）配置已保存");
  }

  async function handleTestTts() {
    const activeLabel =
      settings.ttsEngine === "local"
        ? settings.localTtsModelId === "system-enhanced"
          ? "系统增强语音"
          : (localTtsModels.find((m) => m.id === settings.localTtsModelId)?.name ??
            settings.localTtsModelId)
        : getCloudTtsPreset(settings.cloudTtsProvider).pillLabel;
    if (!isBrowserBackendEnabled()) {
      toaster.success(`${activeLabel} 试听成功（测试环境模拟）`);
      return;
    }
    try {
      const res = await fetch("/api/tts/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "你好，这是 Arbok 语音播报试听效果，欢迎使用全平台音视频知识播放器。",
          engine: settings.ttsEngine,
          provider: settings.cloudTtsProvider,
          model:
            settings.ttsEngine === "local"
              ? settings.localTtsModelId || "system-enhanced"
              : settings.cloudTtsModel,
          baseUrl:
            settings.ttsEngine === "local"
              ? settings.localTtsBaseUrl
              : settings.cloudTtsBaseUrl,
          voice:
            settings.ttsEngine === "local"
              ? settings.localTtsVoice || "Tingting"
              : settings.cloudTtsVoice,
          speed: settings.ttsSpeed ?? 1,
          stylePrompt: settings.localTtsVoiceStyle,
          apiKey: ttsApiKeyDraft.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toaster.error(data.error ?? "语音播报合成失败");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const previewAudio = new Audio(url);
      previewAudio.onended = () => URL.revokeObjectURL(url);
      await previewAudio.play();
      toaster.success(`正在播放 ${activeLabel} 试听语音`);
    } catch (err) {
      toaster.error(err instanceof Error ? err.message : "试听播报失败");
    }
  }

  async function handleDownloadLocalTtsModel(modelId: string) {
    if (!isBrowserBackendEnabled()) return;
    const targetName =
      localTtsModels.find((m) => m.id === modelId)?.name ?? modelId;
    toaster.info(`开始后台拉取本地语音模型「${targetName}」…`);
    const res = await fetch("/api/tts/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    const data = await res.json();
    if (res.ok && data.models) {
      setLocalTtsModels(data.models);
      persistSettingsPatch({ localTtsModelId: modelId });
      toaster.success(`本地语音模型「${targetName}」下载完成`);
    } else {
      toaster.error(data.error ?? "本地 TTS 模型下载失败");
    }
  }

  async function handleDeleteLocalTtsModel(modelId: string) {
    if (!isBrowserBackendEnabled()) return;
    const res = await fetch("/api/tts/models", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId }),
    });
    const data = await res.json();
    if (res.ok && data.models) {
      setLocalTtsModels(data.models);
      toaster.info("已删除本地语音模型");
    }
  }

  function handleCreateFolder(name: string): SubscriptionFolder | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = settings.subscriptionFolders ?? [];
    const dup = existing.find((f) => f.name === trimmed);
    if (dup) {
      toaster.info(`分类「${trimmed}」已存在`);
      return dup;
    }
    const created: SubscriptionFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
    };
    persistSettingsPatch({ subscriptionFolders: [...existing, created] });
    toaster.success(`已新建分类文件夹「${trimmed}」`);
    return created;
  }

  function handleRenameFolder(folderId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = (settings.subscriptionFolders ?? []).map((f) =>
      f.id === folderId ? { ...f, name: trimmed } : f
    );
    persistSettingsPatch({ subscriptionFolders: next });
    toaster.success(`分类已重命名为「${trimmed}」`);
  }

  function handleDeleteFolder(folderId: string) {
    const nextFolders = (settings.subscriptionFolders ?? []).filter(
      (f) => f.id !== folderId
    );
    persistSettingsPatch({ subscriptionFolders: nextFolders });
    setSubscriptions((prev) =>
      prev.map((s) => (s.folderId === folderId ? { ...s, folderId: null } : s))
    );
    if (isBrowserBackendEnabled()) {
      void fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearFolderId: folderId }),
      }).catch(() => {});
    }
    toaster.info("已删除分类文件夹（频道已移回未分类）");
  }

  async function handleMoveSubscriptionsToFolder(
    subIds: string[],
    folderId: string | null
  ) {
    if (subIds.length === 0) return;
    const idSet = new Set(subIds);
    setSubscriptions((prev) =>
      prev.map((s) => (idSet.has(s.id) ? { ...s, folderId } : s))
    );
    if (isBrowserBackendEnabled()) {
      const res = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: subIds, folderId }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscriptions?: Subscription[] };
        if (Array.isArray(data.subscriptions)) {
          setSubscriptions(data.subscriptions);
        }
      }
    }
    const targetName =
      folderId &&
      (settings.subscriptionFolders ?? []).find((f) => f.id === folderId)?.name;
    toaster.success(
      `已将 ${subIds.length} 个频道移至「${targetName || "未分类"}」`
    );
  }

  async function handleRenameSubscription(subId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === subId
          ? { ...s, name: trimmed, shortLabel: trimmed.slice(0, 3) }
          : s
      )
    );
    if (isBrowserBackendEnabled()) {
      const res = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: subId, name: trimmed }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscriptions?: Subscription[] };
        if (Array.isArray(data.subscriptions)) {
          setSubscriptions(data.subscriptions);
        }
      }
    }
    toaster.success(`频道已重命名为「${trimmed}」`);
  }

  async function handleUnsubscribeMany(subIds: string[]) {
    if (subIds.length === 0) return;
    const idSet = new Set(subIds);
    setSubscriptions((prev) => prev.filter((s) => !idSet.has(s.id)));
    if (idSet.has(activeNav)) {
      setActiveNav("inbox");
    }
    if (isBrowserBackendEnabled()) {
      const res = await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: subIds }),
      });
      if (res.ok) {
        const data = (await res.json()) as { subscriptions?: Subscription[] };
        if (Array.isArray(data.subscriptions)) {
          setSubscriptions(data.subscriptions);
        }
      }
    }
    toaster.info(`已取消订阅 ${subIds.length} 个频道`);
  }

  async function handleRefreshEnv() {
    if (!isBrowserBackendEnabled()) return;
    const res = await fetch("/api/env");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.envDeps)) setEnvDeps(data.envDeps);
      if (Array.isArray(data.localAiClis)) setLocalAiClis(data.localAiClis);
      if (Array.isArray(data.localModels)) setLocalModels(data.localModels);
      toaster.success("已刷新本机环境检测结果");
    }
  }

  async function handleRunAsr(
    epId: string,
    localAudioPath?: string,
    options?: { force?: boolean }
  ) {
    const force = Boolean(options?.force);
    if (!isBrowserBackendEnabled()) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === epId
            ? {
                ...ep,
                hasOfficialSub: true,
                isBilingual: false,
                transcript: [
                  {
                    id: 501,
                    start: 0,
                    end: 26,
                    orig: "大家好，今天我们精读这篇关于长上下文大模型 KV Cache 压缩的核心论文。",
                  },
                  {
                    id: 502,
                    start: 26,
                    end: 64,
                    orig: "在推理阶段，序列长度拉到 128K 之后，显存瓶颈几乎全部来自 KV Cache 而非模型权重本身。",
                  },
                ],
              }
            : ep
        )
      );
      toaster.success(
        force
          ? "已重新生成带时间戳字幕"
          : "ASR 语音转写完成，已生成带时间戳字幕"
      );
      return;
    }

    const res = await fetch(`/api/episodes/${encodeURIComponent(epId)}/asr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: settings.asrEngine,
        localAudioPath,
        force,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toaster.error(data.error ?? "启动 ASR 转写失败");
      return;
    }
    if (data.job) {
      setAsrJobs((prev) => ({ ...prev, [epId]: data.job }));
      toaster.info(
        force ? "已启动重新生成字幕任务（从头转写）" : "已启动后台 ASR 转写任务"
      );
    }
  }

  async function handleCancelAsr(epId: string) {
    if (isBrowserBackendEnabled()) {
      await fetch(`/api/episodes/${encodeURIComponent(epId)}/asr`, {
        method: "DELETE",
      });
    }
    setAsrJobs((prev) => {
      const existing = prev[epId];
      if (!existing) return prev;
      return {
        ...prev,
        [epId]: { ...existing, status: "cancelled", message: "已取消转写" },
      };
    });
    toaster.info("已取消后台 ASR 转写任务");
  }

  async function handleTranslateSubtitles(
    epId: string,
    force = false,
    opts?: {
      translationPair?: TranslationPairId;
      silentMissingKey?: boolean;
      isAuto?: boolean;
    }
  ) {
    const target = episodes.find((e) => e.id === epId);
    if (!target || target.transcript.length === 0) return;
    const effectivePair = opts?.translationPair ?? settings.translationPair ?? "auto-zh";
    if (effectivePair === "off") {
      if (!opts?.isAuto) {
        toaster.info("字幕翻译已关闭，请在下拉框选择目标语言后再翻译");
      }
      return;
    }

    if (!isBrowserBackendEnabled()) {
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === epId
            ? {
                ...ep,
                isBilingual: true,
                transcript: ep.transcript.map((s) => ({
                  ...s,
                  zh: s.zh || `[译文] ${s.orig}`,
                })),
              }
            : ep
        )
      );
      setSubtitleMode("bilingual");
      toaster.success("双语字幕翻译完成");
      return;
    }

    if (translationAbortRef.current) {
      translationAbortRef.current.abort();
    }
    const controller = new AbortController();
    translationAbortRef.current = controller;
    translationInFlightRef.current = true;

    const alreadyTranslated = force
      ? 0
      : target.transcript.filter((s) => Boolean(s.zh?.trim())).length;
    setTranslationProgress({
      completed: alreadyTranslated,
      total: target.transcript.length,
    });

    try {
      const res = await fetch(
        `/api/episodes/${encodeURIComponent(epId)}/translate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ force, translationPair: effectivePair }),
        }
      );
      if (!res.body) throw new Error("未收到翻译流响应");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processSseLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if (!payload) return;
        let ev: {
          type: string;
          segments?: Array<{ id: number; zh: string }>;
          completed?: number;
          total?: number;
          fromCache?: boolean;
          code?: string;
          message?: string;
          translatedNow?: number;
          missingCount?: number;
        };
        try {
          ev = JSON.parse(payload);
        } catch {
          return;
        }
        if (ev.type === "batch" && ev.segments) {
          const map = new Map(ev.segments.map((s) => [s.id, s.zh]));
          setEpisodes((prev) =>
            prev.map((ep) =>
              ep.id === epId
                ? {
                    ...ep,
                    isBilingual: true,
                    transcript: ep.transcript.map((seg) =>
                      map.has(seg.id) ? { ...seg, zh: map.get(seg.id) } : seg
                    ),
                  }
                : ep
            )
          );
          setTranslationProgress({
            completed: ev.completed ?? alreadyTranslated,
            total: ev.total ?? target.transcript.length,
          });
        } else if (ev.type === "done") {
          if (Array.isArray(ev.segments) && ev.segments.length > 0) {
            const fullSegs = ev.segments as unknown as TranscriptSegment[];
            setEpisodes((prev) =>
              prev.map((ep) =>
                ep.id === epId
                  ? { ...ep, isBilingual: true, transcript: fullSegs }
                  : ep
              )
            );
          }
          setSubtitleMode("bilingual");
          if ((ev.missingCount ?? 0) > 0) {
            toaster.warning(
              `已完成部分翻译，仍有 ${ev.missingCount} 句未译（可再次点击「翻译双语字幕」自动补齐）`
            );
          } else if (!opts?.isAuto || (ev.translatedNow ?? 0) > 0) {
            toaster.success(
              ev.translatedNow === 0
                ? "已直接命中本地 SQLite 双语缓存（零 Token 消耗）"
                : `双语字幕翻译完成（共补齐 ${ev.translatedNow} 句并缓存）`
            );
          }
        } else if (ev.type === "error") {
          if (ev.code === "MISSING_API_KEY" && opts?.silentMissingKey) {
            return;
          }
          toaster.error(ev.message ?? "翻译失败");
          if (ev.code === "MISSING_API_KEY") {
            setSettingsTab("llm");
            setSettingsDialogOpen(true);
          }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          processSseLine(rawLine);
        }
      }
      if (buffer.trim()) {
        for (const rawLine of buffer.split(/\r?\n/)) {
          processSseLine(rawLine);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      toaster.error(err instanceof Error ? err.message : "翻译请求失败");
    } finally {
      if (translationAbortRef.current === controller) {
        translationAbortRef.current = null;
        translationInFlightRef.current = false;
        setTranslationProgress(null);
      }
    }
  }

  /* Auto-detect English/foreign subtitles in bilingual mode and automatically translate missing lines. */
  useEffect(() => {
    if (
      !hydrated ||
      !isBrowserBackendEnabled() ||
      viewMode !== "player" ||
      currentIsDemoPlaceholder ||
      (subtitleMode !== "bilingual" && subtitleMode !== "zh") ||
      currentEpisode.transcript.length === 0 ||
      translationInFlightRef.current
    ) {
      return;
    }

    const hasUntranslated = currentEpisode.transcript.some((s) => !s.zh?.trim());
    if (!hasUntranslated) return;

    const llmPreset = getLlmPreset(settings.llmProvider);
    const llmReady =
      !llmPreset.requiresKey ||
      Boolean(keyStatus.llmKeys[settings.llmProvider]?.configured);
    if (!llmReady) return;

    const pair = settings.translationPair ?? "auto-zh";
    if (pair === "off") return;
    const needsTranslation =
      pair === "zh-en" || hasForeignSubtitleText(currentEpisode.transcript);
    if (!needsTranslation) return;

    const autoKey = `${currentEpisode.id}::${pair}`;
    if (autoTranslatedKeyRef.current.has(autoKey)) return;

    const timer = window.setTimeout(() => {
      if (translationInFlightRef.current) return;
      autoTranslatedKeyRef.current.add(autoKey);
      void handleTranslateSubtitles(currentEpisode.id, false, {
        translationPair: pair,
        silentMissingKey: true,
        isAuto: true,
      });
    }, 150);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    viewMode,
    subtitleMode,
    currentEpisode.id,
    currentEpisode.transcript.length,
    currentIsDemoPlaceholder,
    settings.llmProvider,
    settings.translationPair,
    keyStatus.llmKeys,
  ]);

  async function handleGenerateGuide(epId: string) {
    const target = episodes.find((e) => e.id === epId);
    if (!target || target.transcript.length === 0) {
      toaster.warning("请先在字幕页获取或转写字幕");
      return;
    }

    if (!isBrowserBackendEnabled()) {
      const guide: AiGuide = {
        modelName: settings.llmModel,
        templateId: settings.guideTemplate,
        tldr: `本集围绕《${target.title}》展开，提炼了核心架构拆解与实操建议。`,
        timeline: target.transcript.slice(0, 3).map((seg) => ({
          start: seg.start,
          title: `${seg.orig.slice(0, 20)}…`,
          summary: seg.zh || seg.orig,
        })),
        takeaways: [
          "明确最小可行性闭环（MVP）与验收标准，避免过度设计。",
          "本地优先存储与精准时间戳引用能极大提升长内容复盘效率。",
        ],
        highlights: [
          {
            start: target.transcript[1]?.start ?? 0,
            end: target.transcript[1]?.end ?? 30,
            reason: "核心方法论与关键数据浓缩片段",
          },
        ],
      };
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === epId ? { ...ep, hasAiGuide: true, guide } : ep
        )
      );
      toaster.success("AI 导读已生成并缓存");
      return;
    }

    setGeneratingGuideEpId(epId);
    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(epId)}/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: settings.guideTemplate,
          customPrompt: settings.customGuidePrompt,
          force: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        guide?: AiGuide;
        code?: string;
        error?: string;
      };
      if (!res.ok || !data.guide) {
        toaster.error(data.error ?? "AI 导读生成失败");
        if (data.code === "MISSING_API_KEY") {
          setSettingsTab("llm");
          setSettingsDialogOpen(true);
        }
        return;
      }
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === epId
            ? { ...ep, hasAiGuide: true, guide: data.guide ?? null }
            : ep
        )
      );
      toaster.success("AI 导读已生成并写入本地 SQLite 缓存");
    } catch (err) {
      toaster.error(err instanceof Error ? err.message : "AI 导读请求超时或失败");
    } finally {
      setGeneratingGuideEpId((cur) => (cur === epId ? null : cur));
    }
  }

  async function handleSendChat(epId: string, prompt: string) {
    const target = episodes.find((e) => e.id === epId);
    if (!target) return;

    if (!isBrowserBackendEnabled()) {
      const seg1 = target.transcript[1] ?? target.transcript[0];
      const ts1 = `[${formatTime(seg1?.start ?? 0)}]`;
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: prompt,
      };
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now() + 1}`,
        role: "assistant",
        content: `结合本期文稿为你整理：在 ${ts1} 处主讲人阐述了核心观点。点击时间戳可直接跳回原音频验证。`,
      };
      setEpisodes((prev) =>
        prev.map((ep) =>
          ep.id === epId
            ? { ...ep, chat: [...ep.chat, userMsg, assistantMsg] }
            : ep
        )
      );
      return;
    }

    const optimisticUser: ChatMessage = {
      id: `u-temp-${Date.now()}`,
      role: "user",
      content: prompt,
    };
    setEpisodes((prev) =>
      prev.map((ep) =>
        ep.id === epId ? { ...ep, chat: [...ep.chat, optimisticUser] } : ep
      )
    );
    setStreamingChatText("");

    const selectedChoice = chatModelChoice;
    let overrideProvider: LlmProviderId | undefined;
    let overrideModel: string | undefined;
    if (selectedChoice && selectedChoice !== "default") {
      const sep = selectedChoice.indexOf("::");
      if (sep > 0) {
        overrideProvider = selectedChoice.slice(0, sep) as LlmProviderId;
        overrideModel = selectedChoice.slice(sep + 2) || undefined;
      } else {
        overrideProvider = selectedChoice as LlmProviderId;
      }
    }

    try {
      const res = await fetch(`/api/episodes/${encodeURIComponent(epId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: prompt,
          provider: overrideProvider,
          model: overrideModel,
        }),
      });
      if (!res.body) throw new Error("未收到 AI 流式响应");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5).trim()) as {
            type: string;
            delta?: string;
            assistantMessage?: ChatMessage;
            code?: string;
            message?: string;
          };
          if (ev.type === "delta" && ev.delta) {
            accumulated += ev.delta;
            setStreamingChatText(accumulated);
          } else if (ev.type === "done" && ev.assistantMessage) {
            const finalAssistant = ev.assistantMessage;
            setEpisodes((prev) =>
              prev.map((ep) =>
                ep.id === epId
                  ? { ...ep, chat: [...ep.chat, finalAssistant] }
                  : ep
              )
            );
          } else if (ev.type === "error") {
            toaster.error(ev.message ?? "AI 问答失败");
            if (ev.code === "MISSING_API_KEY") {
              setSettingsTab("llm");
              setSettingsDialogOpen(true);
            }
          }
        }
      }
    } catch (err) {
      toaster.error(err instanceof Error ? err.message : "AI 问答失败");
    } finally {
      setStreamingChatText(null);
    }
  }

  async function handleClearChat(epId: string) {
    setEpisodes((prev) =>
      prev.map((ep) => (ep.id === epId ? { ...ep, chat: [] } : ep))
    );
    if (isBrowserBackendEnabled()) {
      await fetch(`/api/episodes/${encodeURIComponent(epId)}/chat`, {
        method: "DELETE",
      }).catch(() => {});
    }
    toaster.info("已清空本单集问答记录");
  }

  function handleSaveNote(epId: string, segId: number, body: string) {
    const ep = episodes.find((e) => e.id === epId);
    const seg = ep?.transcript.find((s) => s.id === segId);
    if (!ep || !seg) return;
    setNotes((prev) => {
      const existing = prev.find((n) => n.epId === epId && n.segId === segId);
      if (existing) {
        return prev.map((n) => (n.id === existing.id ? { ...n, body } : n));
      }
      return [
        {
          id: `note-${Date.now()}`,
          epId,
          segId,
          ts: seg.start,
          quote: seg.zh || seg.orig,
          body,
        },
        ...prev,
      ];
    });
    if (isBrowserBackendEnabled()) {
      void fetch(`/api/episodes/${encodeURIComponent(epId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segId,
          ts: seg.start,
          quote: seg.zh || seg.orig,
          body,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (Array.isArray(data?.notes)) setNotes(data.notes);
        })
        .catch(() => {});
    }
    toaster.success("笔记已保存至本地 SQLite 库");
  }

  function handleDeleteNote(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (isBrowserBackendEnabled()) {
      void fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    toaster.info("已删除该条笔记");
  }

  const filteredEpisodes = useMemo(() => {
    let list = episodes;
    if (activeNav === "continue") {
      list = list.filter((e) => e.positionSec > 0 && e.positionSec < e.durationSec);
    } else if (activeNav === "offline") {
      list = list.filter((e) => e.isOffline);
    } else if (activeNav === "favorites") {
      list = list.filter((e) => Boolean(e.isStarred));
    } else if (activeNav !== "inbox" && activeNav !== "notes") {
      list = list.filter((e) => e.subId === activeNav);
    }

    if (activeNav !== "favorites") {
      if (platformFilter === "podcast") {
        list = list.filter(
          (e) => e.platform === "podcast" || e.platform === "xiaoyuzhou"
        );
      } else if (platformFilter !== "all") {
        list = list.filter((e) => e.platform === platformFilter);
      }
    }

    const q = listSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.channel.toLowerCase().includes(q)
      );
    }
    return list;
  }, [episodes, activeNav, platformFilter, listSearch]);

  const starredCount = useMemo(
    () => episodes.filter((e) => Boolean(e.isStarred)).length,
    [episodes]
  );

  const currentNavTitle = useMemo(() => {
    const map: Record<string, string> = {
      inbox: "首页",
      favorites: "首页",
      continue: "收听记录",
      notes: "收藏与笔记",
      offline: "离线下载",
    };
    const sub = subscriptions.find((s) => s.id === activeNav);
    return sub ? sub.name : (map[activeNav] ?? "首页");
  }, [activeNav, subscriptions]);

  const exportMarkdownText = useMemo(
    () => buildEpisodeMarkdown(currentEpisode, currentEpisodeNotes),
    [currentEpisode, currentEpisodeNotes]
  );

  const continueCount = episodes.filter(
    (e) => e.positionSec > 0 && e.positionSec < e.durationSec
  ).length;
  const globalSearchHits = useMemo<GlobalSearchHit[]>(() => {
    const trimmed = listSearch.trim();
    const q = trimmed.toLowerCase();
    if (q.length < 2) return [];
    if (
      remoteSearchResult &&
      remoteSearchResult.query === trimmed &&
      remoteSearchResult.hits.length > 0
    ) {
      return remoteSearchResult.hits;
    }
    const hits: GlobalSearchHit[] = [];
    for (const note of notes) {
      if (
        note.body.toLowerCase().includes(q) ||
        note.quote.toLowerCase().includes(q)
      ) {
        const ep = episodes.find((e) => e.id === note.epId);
        if (ep) {
          hits.push({
            kind: "note",
            id: `note-${note.id}`,
            episodeId: ep.id,
            episodeTitle: ep.title,
            channel: ep.channel,
            platform: ep.platform,
            startSec: note.ts,
            snippet: note.body || note.quote,
            secondaryText: note.body ? note.quote : undefined,
          });
        }
      }
    }
    for (const ep of episodes) {
      for (const seg of ep.transcript) {
        if (
          seg.orig.toLowerCase().includes(q) ||
          (seg.zh?.toLowerCase().includes(q) ?? false)
        ) {
          hits.push({
            kind: "transcript",
            id: `seg-${ep.id}-${seg.id}`,
            episodeId: ep.id,
            episodeTitle: ep.title,
            channel: ep.channel,
            platform: ep.platform,
            startSec: seg.start,
            snippet: seg.zh?.trim() || seg.orig,
            secondaryText: seg.zh?.trim() ? seg.orig : undefined,
          });
          if (hits.length >= 16) return hits;
        }
      }
    }
    return hits;
  }, [listSearch, remoteSearchResult, notes, episodes]);

  const chatModelOptions = useMemo(() => {
    const defaultGuideProvider =
      settings.llmGuideProvider && settings.llmGuideProvider !== "default"
        ? settings.llmGuideProvider
        : settings.llmProvider;
    const defaultPreset = getLlmPreset(defaultGuideProvider);
    const defaultModelName =
      defaultGuideProvider === settings.llmProvider
        ? settings.llmModel || defaultPreset.defaultModel
        : defaultPreset.defaultModel;

    const opts: Array<{ value: string; label: string }> = [
      {
        value: "default",
        label: `跟随默认（${defaultPreset.shortName} · ${defaultModelName}）`,
      },
    ];
    const seen = new Set<string>(["default"]);

    for (const cliId of ["claude-code", "codex", "antigravity"] as const) {
      const status = localAiClis.find((c) => c.id === cliId);
      const preset = getLlmPreset(cliId);
      const cliCfg =
        settings.localAiConfigs?.[cliId] ?? getDefaultLocalAiCliConfig(cliId);
      const checkedModels =
        cliCfg.chatModels.length > 0 ? cliCfg.chatModels : [preset.defaultModel];
      const badge = status?.available ? "" : "（未安装）";
      for (const modelId of checkedModels) {
        const val = `${cliId}::${modelId}`;
        if (seen.has(val)) continue;
        seen.add(val);
        opts.push({
          value: val,
          label: `${preset.shortName} · ${modelId}${badge}`,
        });
      }
    }

    for (const preset of LLM_PROVIDER_PRESETS) {
      if (isLocalAiProviderId(preset.id) || preset.category === "legacy") continue;
      const modelName =
        preset.id === settings.llmProvider && settings.llmModel
          ? settings.llmModel
          : preset.defaultModel;
      const val = `${preset.id}::${modelName}`;
      if (seen.has(val)) continue;
      seen.add(val);
      const configured =
        !preset.requiresKey || Boolean(keyStatus.llmKeys?.[preset.id]?.configured);
      opts.push({
        value: val,
        label: `${preset.shortName} · ${modelName}${configured ? " ✓" : ""}`,
      });
    }

    return opts;
  }, [settings, localAiClis, keyStatus.llmKeys]);

  const currentDownloadJob = useMemo(
    () => downloadJobs.find((j) => j.episodeId === currentEpisode.id) ?? null,
    [downloadJobs, currentEpisode.id]
  );

  const offlineCount = episodes.filter((e) => e.isOffline).length;
  const activeDownloadCount = downloadJobs.filter(
    (j) => j.status === "queued" || j.status === "downloading"
  ).length;
  const isInboxHome =
    activeNav === "inbox" &&
    platformFilter === "all" &&
    listSearch.trim() === "";

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--arbok-canvas)] text-[var(--ui-foreground)]"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setWindowDragActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setWindowDragActive(false);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          setWindowDragActive(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) {
            void handleImportLocalFile(dropped);
          }
        }
      }}
    >
      {windowDragActive && (
        <div
          aria-label="拖放本地音视频文件导入"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs"
        >
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed border-[var(--arbok-accent)] bg-[var(--arbok-canvas)] px-10 py-8 text-center shadow-2xl">
            <UploadIcon
              className="size-8 text-[var(--arbok-accent-text)]"
              aria-hidden="true"
            />
            <div className="text-base font-semibold text-[var(--ui-foreground)]">
              松开鼠标导入本地音视频文件
            </div>
            <div className="text-xs text-[var(--ui-muted-foreground)]">
              支持 .mp3 / .m4a / .wav / .mp4 / .mov，导入后立即起播并支持 ASR 转写与 AI 导读
            </div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!sidebarCollapsed && !(pipActive && pipMode === "desktop") && (
          <aside
            aria-label="主导航栏"
            className="flex w-[232px] shrink-0 flex-col border-r border-[var(--ui-border)] bg-[var(--arbok-sidebar)] backdrop-blur-xl"
          >
            <div className="flex h-12 shrink-0 items-center justify-between px-3.5">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#febc2e]" />
                  <span className="size-2.5 rounded-full bg-[#28c840]" />
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                  <ArbokLogo />
                  <span>Arbok</span>
                </div>
              </div>
              <Button
                aria-label="折叠侧边栏"
                className="size-7 border-transparent bg-transparent"
                onClick={() => setSidebarCollapsed(true)}
              >
                <PanelLeftIcon className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="px-3 pb-3">
              <AddSourceDialog
                open={addDialogOpen}
                onOpenChange={setAddDialogOpen}
                directory={directory}
                onAddUrl={handleAddUrl}
                onToggleDirectorySubscribe={handleToggleDirectorySubscribe}
                onImportLocalFile={handleImportLocalFile}
              />
            </div>

            <ScrollArea className="arbok-scroll min-h-0 flex-1">
              <ScrollAreaViewport role="region" aria-label="导航与订阅列表">
                <ScrollAreaContent className="flex flex-col gap-0.5 px-2 pb-4">
                  {[
                    {
                      id: "inbox",
                      label: uiCopy.navHome,
                      count: episodes.length,
                      icon: InboxIcon,
                    },
                    {
                      id: "continue",
                      label: uiCopy.navHistory,
                      count: continueCount,
                      icon: PlayCircleIcon,
                    },
                    {
                      id: "notes",
                      label: uiCopy.navNotes,
                      count: notes.length,
                      icon: BookmarkIcon,
                    },
                    {
                      id: "offline",
                      label: uiCopy.navOffline,
                      count: offlineCount + activeDownloadCount,
                      icon: DownloadIcon,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    const active = viewMode === "list" && activeNav === item.id;
                    return (
                      <Button
                        key={item.id}
                        data-active={active ? "true" : "false"}
                        className="arbok-nav-button justify-between"
                        onClick={() => {
                          setActiveNav(item.id);
                          setViewMode("list");
                        }}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Icon className="size-4" aria-hidden="true" />
                          <span>{item.label}</span>
                        </span>
                        {item.count > 0 && (
                          <span className="tabular-nums rounded-full bg-[var(--ui-muted)] px-1.5 py-0.5 text-[11px] text-[var(--ui-muted-foreground)]">
                            {item.count}
                          </span>
                        )}
                      </Button>
                    );
                  })}

                  <Separator className="my-2.5" />

                  <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold tracking-wide text-[var(--ui-muted-foreground)]">
                    <span>{uiCopy.navSubscriptions}</span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        aria-label="管理订阅"
                        title="管理订阅与分类文件夹"
                        className="size-6 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                        onClick={() => setManageSubsOpen(true)}
                      >
                        <ListFilterIcon className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label="快速添加订阅"
                        className="size-6 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                        onClick={() => setAddDialogOpen(true)}
                      >
                        <PlusIcon className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {(() => {
                    const folders = settings.subscriptionFolders ?? [];
                    const validFolderIds = new Set(folders.map((f) => f.id));

                    const renderSubItem = (sub: Subscription) => {
                      const meta = getPlatformMeta(sub.platform);
                      const count = episodes.filter(
                        (e) => e.subId === sub.id
                      ).length;
                      const active = viewMode === "list" && activeNav === sub.id;
                      const subCover =
                        sub.coverUrl ??
                        episodes.find((e) => e.subId === sub.id && e.coverUrl)
                          ?.coverUrl;
                      const platformSubLabel =
                        sub.platform === "youtube"
                          ? "YouTube 频道"
                          : sub.platform === "bilibili"
                            ? "B站 UP 主"
                            : sub.platform === "xiaoyuzhou"
                              ? "小宇宙播客"
                              : "Apple 播客";
                      return (
                        <Button
                          key={sub.id}
                          aria-label={`订阅：${sub.name}`}
                          data-active={active ? "true" : "false"}
                          className="arbok-sub-row flex items-center justify-between gap-2.5"
                          onClick={() => {
                            setActiveNav(sub.id);
                            setViewMode("list");
                          }}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2.5">
                            <span
                              className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[10px] font-bold text-white shadow-xs"
                              style={{ background: sub.gradient }}
                              aria-hidden="true"
                            >
                              {subCover ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={subCover}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                sub.shortLabel
                              )}
                              <span
                                className="absolute right-0.5 bottom-0.5 size-2 rounded-full ring-1 ring-black/40"
                                style={{ background: meta.dot }}
                              />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-[13px] font-medium leading-tight text-[var(--ui-foreground)]">
                                {sub.name}
                              </span>
                              <span className="mt-0.5 truncate text-[11px] leading-tight text-[var(--ui-muted-foreground)]">
                                {platformSubLabel}
                              </span>
                            </span>
                          </span>
                          <span className="tabular-nums shrink-0 text-xs text-[var(--ui-muted-foreground)]">
                            {count > 99 ? "99+" : count}
                          </span>
                        </Button>
                      );
                    };

                    if (folders.length === 0) {
                      return subscriptions.map(renderSubItem);
                    }

                    const uncategorizedSubs = subscriptions.filter(
                      (s) => !s.folderId || !validFolderIds.has(s.folderId)
                    );

                    return (
                      <div className="flex flex-col gap-1">
                        {folders.map((folder) => {
                          const folderSubs = subscriptions.filter(
                            (s) => s.folderId === folder.id
                          );
                          const isCollapsed = Boolean(collapsedFolders[folder.id]);
                          return (
                            <div key={folder.id} className="flex flex-col">
                              <Button
                                aria-label={`${isCollapsed ? "展开" : "收起"}分类 ${folder.name}`}
                                className="arbok-nav-button h-7 justify-between px-1.5 text-xs font-medium"
                                onClick={() =>
                                  setCollapsedFolders((prev) => ({
                                    ...prev,
                                    [folder.id]: !prev[folder.id],
                                  }))
                                }
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {isCollapsed ? (
                                    <ChevronRightIcon
                                      className="size-3 shrink-0 opacity-70"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <ChevronDownIcon
                                      className="size-3 shrink-0 opacity-70"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <FolderIcon
                                    className="size-3.5 shrink-0 text-[var(--arbok-settings-icon-active)]"
                                    aria-hidden="true"
                                  />
                                  <span className="truncate text-[12px] font-semibold text-[var(--ui-foreground)]">
                                    {folder.name}
                                  </span>
                                </span>
                                <span className="tabular-nums text-[11px] text-[var(--ui-muted-foreground)]">
                                  {folderSubs.length}
                                </span>
                              </Button>
                              {!isCollapsed && (
                                <div className="ml-2 flex flex-col border-l border-[var(--ui-border)] pl-1.5">
                                  {folderSubs.length > 0 ? (
                                    folderSubs.map(renderSubItem)
                                  ) : (
                                    <div className="px-2 py-1.5 text-[11px] text-[var(--ui-muted-foreground)]">
                                      暂无频道
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {uncategorizedSubs.length > 0 && (
                          <div className="mt-1 flex flex-col">
                            <div className="px-2 py-1 text-[11px] font-medium text-[var(--ui-muted-foreground)]">
                              未分类 ({uncategorizedSubs.length})
                            </div>
                            {uncategorizedSubs.map(renderSubItem)}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </ScrollAreaContent>
              </ScrollAreaViewport>
              <ScrollAreaScrollbar orientation="vertical">
                <ScrollAreaThumb />
              </ScrollAreaScrollbar>
            </ScrollArea>

            <div className="flex items-center gap-1.5 border-t border-[var(--ui-border)] p-2">
              <SettingsDialog
                open={settingsDialogOpen}
                onOpenChange={setSettingsDialogOpen}
                activeTab={settingsTab}
                onActiveTabChange={setSettingsTab}
                settings={settings}
                keyStatus={keyStatus}
                envDeps={envDeps}
                localAiClis={localAiClis}
                localModels={localModels}
                asrModelDownloads={asrModelDownloads}
                localTtsModels={localTtsModels}
                cacheUsedMb={cacheUsedMb}
                storageUsage={storageUsage}
                llmApiKeyDraft={llmApiKeyDraft}
                asrApiKeyDraft={asrApiKeyDraft}
                ttsApiKeyDraft={ttsApiKeyDraft}
                biliCookieDraft={biliCookieDraft}
                llmTestResult={llmTestResult}
                biliQr={biliQr}
                onUpdateSettings={(patch) => persistSettingsPatch(patch)}
                onSubtitleModeChange={(mode) => {
                  setSubtitleMode(mode);
                  persistSettingsPatch({ subtitleDisplayMode: mode });
                }}
                onLlmApiKeyDraftChange={setLlmApiKeyDraft}
                onAsrApiKeyDraftChange={setAsrApiKeyDraft}
                onTtsApiKeyDraftChange={setTtsApiKeyDraft}
                onBiliCookieDraftChange={setBiliCookieDraft}
                onSaveLlmConfig={handleSaveLlmConfig}
                onDeleteLlmKey={handleDeleteLlmKey}
                onTestLlm={handleTestLlm}
                onSaveAsrConfig={handleSaveAsrConfig}
                onRefreshLocalModels={handleRefreshLocalModels}
                onDownloadLocalModel={handleDownloadLocalModel}
                onDeleteLocalModel={handleDeleteLocalModel}
                onSaveTtsConfig={handleSaveTtsConfig}
                onTestTts={handleTestTts}
                onDownloadLocalTtsModel={handleDownloadLocalTtsModel}
                onDeleteLocalTtsModel={handleDeleteLocalTtsModel}
                onClearCache={handleClearCache}
                onEnforceCacheLru={handleEnforceCacheLru}
                onTestProxy={async () => {
                  if (!isBrowserBackendEnabled()) {
                    toaster.success("代理连通测试通过");
                    return;
                  }
                  const res = await fetch("/api/settings/test-proxy", {
                    method: "POST",
                  });
                  const data = (await res.json()) as {
                    ok?: boolean;
                    message?: string;
                  };
                  if (data.ok) {
                    toaster.success(data.message ?? "代理连通测试通过");
                  } else {
                    toaster.error(data.message ?? "YouTube 连通失败");
                  }
                }}
                onStartBiliQr={handleStartBiliQr}
                onLogoutBili={handleLogoutBili}
                onSaveBiliCookie={async () => {
                  const trimmed = biliCookieDraft.trim();
                  persistSettingsPatch(
                    { biliLoggedIn: Boolean(trimmed) },
                    { biliCookie: trimmed }
                  );
                  setBiliCookieDraft("");
                  toaster.success("B站 SESSDATA 已加密写入系统钥匙串");
                  if (
                    trimmed &&
                    currentEpisode.platform === "bilibili" &&
                    currentEpisode.transcript.length === 0 &&
                    !currentIsDemoPlaceholder
                  ) {
                    window.setTimeout(() => {
                      void handleFetchOfficialSubtitles(currentEpisode.id, true);
                    }, 300);
                  }
                }}
                onRefreshEnv={handleRefreshEnv}
              />

              <ManageSubscriptionsDialog
                open={manageSubsOpen}
                onOpenChange={setManageSubsOpen}
                subscriptions={subscriptions}
                episodes={episodes}
                folders={settings.subscriptionFolders ?? []}
                keepOriginalShowNames={settings.keepOriginalShowNames ?? false}
                onKeepOriginalShowNamesChange={(checked) =>
                  persistSettingsPatch({ keepOriginalShowNames: checked })
                }
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveSubscriptionsToFolder={handleMoveSubscriptionsToFolder}
                onRenameSubscription={handleRenameSubscription}
                onUnsubscribeMany={handleUnsubscribeMany}
              />

              <ShortcutsDialog
                open={shortcutsDialogOpen}
                onOpenChange={setShortcutsDialogOpen}
              />

              <Button
                aria-label={
                  resolvedTheme === "light" ? "切换到深色模式" : "切换到浅色模式"
                }
                className="size-8 shrink-0 border-transparent bg-transparent"
                onClick={() =>
                  persistSettingsPatch({
                    theme: resolvedTheme === "light" ? "dark" : "light",
                  })
                }
              >
                {resolvedTheme === "light" ? (
                  <MoonIcon className="size-4" aria-hidden="true" />
                ) : (
                  <SunIcon className="size-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-[var(--arbok-canvas)]">
          {viewMode === "player" ? (
            <ImmersivePlayer
              episode={currentEpisode}
              allEpisodes={episodes}
              playQueue={playQueue}
              downloadJob={currentDownloadJob}
              notes={currentEpisodeNotes}
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              isDemoPlaceholder={currentIsDemoPlaceholder}
              fetchingSubtitles={fetchingSubtitlesEpId === currentEpisode.id}
              mediaError={mediaError}
              volume={volume}
              videoStreamUrl={videoStreamUrl}
              youtubeVideoId={youtubeVideoId}
              videoRef={videoRef}
              ytPlayerRef={ytPlayerRef}
              playbackRate={playbackRate}
              audioOnly={audioOnly}
              videoQuality={videoQuality}
              actualQuality={actualQuality}
              maxAvailableQuality={maxAvailableQuality}
              rightTab={rightTab}
              subtitleMode={subtitleMode}
              subtitleZhFontSize={settings.subtitleZhFontSize ?? 100}
              subtitleOrigFontSize={settings.subtitleOrigFontSize ?? 100}
              subtitleFontFamily={settings.subtitleFontFamily ?? "system"}
              videoSubtitleStyle={settings.videoSubtitleStyle ?? "translucent"}
              subtitleShowNextAudioLine={
                settings.subtitleShowNextAudioLine ?? false
              }
              subtitleOverlayX={settings.subtitleOverlayX ?? 50}
              subtitleOverlayY={settings.subtitleOverlayY ?? 84}
              onSubtitleOverlayPosChange={(x, y) =>
                persistSettingsPatch({
                  subtitleOverlayX: x,
                  subtitleOverlayY: y,
                })
              }
              showYoutubeSubscribeButton={Boolean(
                settings.showYoutubeSubscribeButton
              )}
              youtubeChannelUrl={
                subscriptions.find((s) => s.id === currentEpisode.subId)
                  ?.sourceUrl
              }
              uiLanguage={settings.uiLanguage}
              ttsDubbingEnabled={ttsDubbingEnabled}
              ttsDubbingStatus={ttsDubbingStatus}
              translationPair={settings.translationPair ?? "auto-zh"}
              autoScroll={autoScroll}
              asrEngine={settings.asrEngine}
              asrJob={asrJobs[currentEpisode.id] ?? null}
              translationProgress={translationProgress}
              guideTemplate={settings.guideTemplate}
              customGuidePrompt={settings.customGuidePrompt}
              generatingGuide={generatingGuideEpId === currentEpisode.id}
              streamingChatText={streamingChatText}
              chatModelOptions={chatModelOptions}
              selectedChatModel={chatModelChoice}
              onSelectChatModel={setChatModelChoice}
              biliLoggedIn={settings.biliLoggedIn || keyStatus.biliCookieConfigured}
              sidebarCollapsed={sidebarCollapsed}
              subSearchInputRef={subSearchRef}
              onToggleSidebar={() => setSidebarCollapsed(false)}
              onBack={handleBackToList}
              onTogglePlay={() => {
                setMediaError(null);
                setIsPlaying((p) => {
                  if (p) setIsBuffering(false);
                  return !p;
                });
              }}
              onRetryPlayback={handleRetryPlayback}
              onOpenAddSource={() => setAddDialogOpen(true)}
              onFetchOfficialSubtitles={handleFetchOfficialSubtitles}
              onVolumeChange={setVolume}
              onVideoTimeUpdate={() => handleMediaTimeUpdate(videoRef.current)}
              onVideoLoadedMetadata={() =>
                handleMediaLoadedMetadata(videoRef.current)
              }
              onVideoWaiting={() => setIsBuffering(true)}
              onVideoCanPlay={() => handleMediaCanPlay(videoRef.current)}
              onVideoEnded={handleMediaEnded}
              onVideoError={handleMediaError}
              onYouTubeTimeUpdate={(sec) => {
                if (Math.abs(sec - lastReportedPosRef.current) < 0.25) return;
                lastReportedPosRef.current = sec;
                setEpisodes((prev) =>
                  prev.map((ep) =>
                    ep.id === currentEpId ? { ...ep, positionSec: sec } : ep
                  )
                );
              }}
              onYouTubeDurationReady={(dur) => {
                setEpisodes((prev) =>
                  prev.map((ep) =>
                    ep.id === currentEpId && Math.abs(ep.durationSec - dur) > 3
                      ? { ...ep, durationSec: dur }
                      : ep
                  )
                );
              }}
              onYouTubePlayingChange={(playing) => setIsPlaying(playing)}
              onYouTubeBufferingChange={(buffering) => setIsBuffering(buffering)}
              onYouTubeActualQualityChange={(q, maxQ) => {
                setActualQuality(q);
                setMaxAvailableQuality(maxQ ?? null);
              }}
              onYouTubeEnded={handleMediaEnded}
              onYouTubeEmbedUnavailable={() => {
                setYtEmbedFallbackEpId(currentEpisode.id);
                toaster.info("该视频禁止嵌入播放，已自动切换至本地流代理");
              }}
              onSkip={handleSkip}
              onSeek={handleSeek}
              onPlaybackRateChange={(rate) => applyPlaybackRate(rate)}
              onAudioOnlyChange={handleAudioOnlyChange}
              onVideoQualityChange={handleVideoQualityChange}
              onTtsDubbingChange={handleToggleTtsDubbing}
              onToggleStarred={handleToggleStarred}
              onToggleOffline={handleToggleOffline}
              pipActive={pipActive}
              pipMode={pipMode}
              docPipContainer={docPipContainer}
              onTogglePip={handleTogglePip}
              onPauseDownload={(id) => void handleDownloadAction(id, "pause")}
              onResumeDownload={(id) => void handleDownloadAction(id, "resume")}
              onCancelDownload={(id) => void handleDownloadAction(id, "cancel")}
              onPlayEpisode={(id) => {
                openEpisode(id);
                setIsPlaying(true);
              }}
              onMoveQueueItem={handleMoveQueueItem}
              onRemoveQueueItem={handleRemoveQueueItem}
              onClearQueue={handleClearQueue}
              onAddToQueue={handleAddToQueue}
              onRightTabChange={setRightTab}
              onSubtitleModeChange={(mode) => {
                setSubtitleMode(mode);
                persistSettingsPatch({ subtitleDisplayMode: mode });
              }}
              onTranslationPairChange={handleTranslationPairChange}
              onAutoScrollChange={setAutoScroll}
              onTranslateSubtitles={handleTranslateSubtitles}
              onGuideTemplateChange={(guideTemplate) =>
                persistSettingsPatch({ guideTemplate })
              }
              onCustomGuidePromptChange={(customGuidePrompt) =>
                persistSettingsPatch({ customGuidePrompt })
              }
              onSaveNote={handleSaveNote}
              onDeleteNote={handleDeleteNote}
              onCopySegment={(txt) => {
                navigator.clipboard?.writeText(txt).catch(() => {});
                toaster.success("已复制带时间戳字幕");
              }}
              onCopySourceUrl={(url) => {
                navigator.clipboard?.writeText(url).catch(() => {});
                toaster.success("已复制原始页面链接");
              }}
              onRunAsr={handleRunAsr}
              onCancelAsr={handleCancelAsr}
              onGenerateGuide={handleGenerateGuide}
              onSendChat={handleSendChat}
              onClearChat={handleClearChat}
              onOpenBiliSettings={() => {
                setSettingsTab("bili");
                setSettingsDialogOpen(true);
              }}
              onOpenAsrSettings={() => {
                setSettingsTab("asr");
                setSettingsDialogOpen(true);
              }}
              onOpenExport={() => setExportDialogOpen(true)}
            />
          ) : (
            <>
              <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-[var(--ui-border)] bg-[var(--arbok-surface)]/80 px-6 backdrop-blur-md">
                <div className="flex min-w-0 items-center gap-3">
                  {sidebarCollapsed && (
                    <Button
                      aria-label="展开侧边栏"
                      className="size-8 border-transparent bg-transparent"
                      onClick={() => setSidebarCollapsed(false)}
                    >
                      <PanelLeftIcon className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                  <h1 className="truncate text-[15px] font-semibold tracking-tight">
                    {currentNavTitle}
                  </h1>
                  {(activeNav === "inbox" || activeNav === "favorites") && (
                    <SegmentedControl
                      aria-label="按平台筛选"
                      value={activeNav === "favorites" ? "favorites" : platformFilter}
                      onValueChange={(next) => {
                        if (next === "favorites") {
                          setActiveNav("favorites");
                          setViewMode("list");
                        } else if (
                          next === "all" ||
                          next === "podcast" ||
                          next === "youtube" ||
                          next === "bilibili" ||
                          next === "local"
                        ) {
                          setActiveNav("inbox");
                          setPlatformFilter(next);
                        }
                      }}
                    >
                      <SegmentedControlIndicator />
                      <SegmentedControlItem value="all">全部</SegmentedControlItem>
                      <SegmentedControlItem value="podcast">播客</SegmentedControlItem>
                      <SegmentedControlItem value="youtube">YouTube</SegmentedControlItem>
                      <SegmentedControlItem value="bilibili">B站</SegmentedControlItem>
                      <SegmentedControlItem value="local">本地</SegmentedControlItem>
                      <SegmentedControlItem value="favorites">
                        <span className="inline-flex items-center gap-1">
                          <span>收藏</span>
                          {starredCount > 0 && (
                            <span className="tabular-nums text-[11px] opacity-75">
                              {starredCount}
                            </span>
                          )}
                        </span>
                      </SegmentedControlItem>
                    </SegmentedControl>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activeNav !== "notes" && (
                    <InputGroup className="w-56">
                      <SearchIcon
                        className="ml-2.5 size-3.5 text-[var(--ui-muted-foreground)]"
                        aria-hidden="true"
                      />
                      <Input
                        ref={listSearchRef}
                        type="search"
                        aria-label="搜索单集或频道"
                        value={listSearch}
                        placeholder="搜索单集或频道..."
                        onValueChange={setListSearch}
                      />
                      <InputClear aria-label="清空列表搜索">
                        <XIcon className="size-3.5" aria-hidden="true" />
                      </InputClear>
                    </InputGroup>
                  )}
                  <Button
                    pendingAnnouncement="正在刷新订阅源"
                    onClick={handleRefreshFeeds}
                  >
                    <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                    <span>刷新订阅</span>
                  </Button>
                </div>
              </header>

              <ScrollArea className="arbok-scroll min-h-0 flex-1">
                <ScrollAreaViewport role="region" aria-label="主内容画布">
                  <ScrollAreaContent>
                    {activeNav === "favorites" ? (
                      <FavoritesView
                        episodes={filteredEpisodes}
                        currentEpisodeId={currentEpisode.id}
                        isPlaying={isPlaying}
                        onPlayEpisode={(id) => {
                          openEpisode(id);
                          setIsPlaying(true);
                        }}
                        onPlayAll={handlePlayAllFavorites}
                        onUnstar={handleToggleStarred}
                      />
                    ) : activeNav === "offline" ? (
                      <OfflineQueueView
                        downloadJobs={downloadJobs}
                        offlineEpisodes={filteredEpisodes}
                        storageUsage={storageUsage}
                        onOpenEpisode={(id) => openEpisode(id)}
                        onPauseDownload={(id) =>
                          void handleDownloadAction(id, "pause")
                        }
                        onResumeDownload={(id) =>
                          void handleDownloadAction(id, "resume")
                        }
                        onCancelDownload={(id) =>
                          void handleDownloadAction(id, "cancel")
                        }
                        onRemoveOffline={(id) => void handleRemoveOffline(id)}
                        onOpenStorageSettings={() => {
                          setSettingsTab("general");
                          setSettingsDialogOpen(true);
                        }}
                      />
                    ) : activeNav === "notes" ? (
                      <div className="flex w-full flex-col gap-3 px-7 py-6 pb-12">
                        {notes.length === 0 ? (
                          <div className="mx-auto my-12 max-w-sm rounded-2xl border border-dashed border-[var(--ui-input)] bg-[var(--arbok-surface)] p-6 text-center">
                            <h2 className="text-sm font-semibold">还没有笔记</h2>
                            <p className="mt-1.5 text-xs text-[var(--ui-muted-foreground)]">
                              在任意单集的字幕行点击「记笔记」，批注会自动汇总在这里。
                            </p>
                          </div>
                        ) : (
                          notes.map((note) => {
                            const ep = episodes.find((e) => e.id === note.epId);
                            return (
                              <Button
                                key={note.id}
                                className="arbok-card-button w-full flex-col items-stretch gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4 hover:border-[var(--arbok-accent-border)]"
                                onClick={() => openEpisode(note.epId, note.ts)}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-[13px] font-semibold text-[var(--ui-foreground)]">
                                    打开笔记：{ep?.title ?? "未知单集"}
                                  </span>
                                  <span
                                    className="tabular-nums shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold"
                                    style={{
                                      color: "var(--arbok-accent-text)",
                                      background: "var(--arbok-accent-soft)",
                                    }}
                                  >
                                    {formatTime(note.ts)}
                                  </span>
                                </div>
                                <div className="border-l-2 border-[var(--ui-input)] pl-2.5 text-xs text-[var(--ui-muted-foreground)]">
                                  {note.quote}
                                </div>
                                <div className="text-[13px] text-[var(--ui-foreground)]">
                                  {note.body}
                                </div>
                              </Button>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <>
                        {globalSearchHits.length > 0 && (
                          <section
                            aria-label="全局字幕与笔记检索命中"
                            className="w-full px-7 pt-5"
                          >
                            <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                              <div className="mb-2.5 flex items-center justify-between">
                                <h2 className="text-xs font-semibold text-[var(--ui-foreground)]">
                                  跨全库字幕与笔记命中（{globalSearchHits.length} 条）
                                </h2>
                                <span className="text-[11px] text-[var(--ui-muted-foreground)]">
                                  点击任意结果直接跳转原声秒数
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {globalSearchHits.slice(0, 8).map((hit) => {
                                  const hitMeta = getPlatformMeta(hit.platform);
                                  return (
                                    <Button
                                      key={hit.id}
                                      className="arbok-card-button h-auto w-full flex-col items-stretch gap-1 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-canvas)] px-3 py-2 text-left"
                                      onClick={() =>
                                        openEpisode(hit.episodeId, hit.startSec)
                                      }
                                    >
                                      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--ui-muted-foreground)]">
                                        <span className="flex min-w-0 items-center gap-1.5">
                                          <span
                                            className="shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold"
                                            style={{
                                              color: hitMeta.fg,
                                              background: hitMeta.bg,
                                            }}
                                          >
                                            {hit.kind === "note"
                                              ? "笔记"
                                              : hitMeta.label}
                                          </span>
                                          <span className="truncate font-medium text-[var(--ui-foreground)]">
                                            {hit.episodeTitle}
                                          </span>
                                        </span>
                                        <span className="tabular-nums shrink-0 font-semibold text-[var(--arbok-accent-text)]">
                                          {formatTime(hit.startSec)}
                                        </span>
                                      </div>
                                      <div className="line-clamp-1 text-xs text-[var(--ui-foreground)]">
                                        {hit.snippet}
                                      </div>
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          </section>
                        )}
                        <HomeFeed
                          isInboxHome={isInboxHome}
                          currentEpisode={currentEpisode}
                          isPlaying={isPlaying}
                          episodes={filteredEpisodes}
                          allEpisodes={episodes}
                          subscriptions={subscriptions}
                          recommendedShows={syncedRecommendedShows}
                          subscribingRecId={subscribingRecId}
                          showRecommendations={settings.showRecommendations ?? true}
                          keepOriginalShowNames={Boolean(
                            settings.keepOriginalShowNames
                          )}
                          uiLanguage={settings.uiLanguage}
                          onOpenEpisode={(id) => openEpisode(id)}
                          onContinueHero={() => {
                            openEpisode(currentEpisode.id);
                            setIsPlaying(true);
                          }}
                          onSelectSubscription={(subId) => {
                            setActiveNav(subId);
                            setPlatformFilter("all");
                          }}
                          onViewAllContinue={() => setActiveNav("continue")}
                          onViewAllLatest={() => {
                            setPlatformFilter("all");
                            toaster.info(`共展示 ${episodes.length} 期最新单集`);
                          }}
                          onOpenAddDialog={() => setAddDialogOpen(true)}
                          onOpenMoreRecommendations={() => setAddDialogOpen(true)}
                          onToggleRecommendSubscribe={handleToggleRecommendSubscribe}
                        />
                      </>
                    )}
                  </ScrollAreaContent>
                </ScrollAreaViewport>
                <ScrollAreaScrollbar orientation="vertical">
                  <ScrollAreaThumb />
                </ScrollAreaScrollbar>
              </ScrollArea>
            </>
          )}
        </main>
      </div>

      {viewMode === "list" && (
        <MiniPlayer
          episode={currentEpisode}
          allEpisodes={episodes}
          playQueue={playQueue}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onSkip={handleSkip}
          onSeek={handleSeek}
          onCycleSpeed={() => handleCycleSpeed(1)}
          onExpand={() => openEpisode(currentEpisode.id)}
          onPlayEpisode={(id) => {
            openEpisode(id);
            setIsPlaying(true);
          }}
          onMoveQueueItem={handleMoveQueueItem}
          onRemoveQueueItem={handleRemoveQueueItem}
          onClearQueue={handleClearQueue}
          onAddToQueue={handleAddToQueue}
        />
      )}

      <ExportMarkdownDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title={currentEpisode.title}
        markdown={exportMarkdownText}
        onCopy={() => {
          navigator.clipboard?.writeText(exportMarkdownText).catch(() => {});
          toaster.success("已复制 Markdown，可直接粘贴至 Obsidian / Notion");
          setExportDialogOpen(false);
        }}
        onDownload={() => {
          const blob = new Blob([exportMarkdownText], {
            type: "text/markdown;charset=utf-8",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${currentEpisode.title.slice(0, 32).replace(/[\\/:*?"<>|]/g, "")}.md`;
          a.click();
          URL.revokeObjectURL(url);
          toaster.success("已开始下载 .md 笔记文件");
        }}
      />

      <audio
        ref={audioRef}
        src={audioStreamUrl}
        preload="metadata"
        className="hidden"
        onTimeUpdate={() => handleMediaTimeUpdate(audioRef.current)}
        onLoadedMetadata={() => handleMediaLoadedMetadata(audioRef.current)}
        onDurationChange={() => applyPendingSeek(audioRef.current)}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => handleMediaCanPlay(audioRef.current)}
        onPlaying={() => handleMediaCanPlay(audioRef.current)}
        onEnded={handleMediaEnded}
        onError={() => {
          if (hydrated && !useVideoElement && audioStreamUrl) {
            handleMediaError();
          }
        }}
      />

      <ToastRegion toaster={toaster} data-agent-hidden>
        {() => (
          <Toast>
            <ToastTitle />
            <ToastDescription />
          </Toast>
        )}
      </ToastRegion>
    </div>
  );
}
