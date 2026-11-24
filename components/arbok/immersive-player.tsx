"use client";

import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress";
import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/react/resizable";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/react/slider";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Textarea } from "@ui-sdk/react/textarea";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import {
  ArrowLeftIcon,
  AudioLinesIcon,
  BookmarkPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HeadphonesIcon,
  LanguagesIcon,
  Maximize2Icon,
  MinusIcon,
  PanelLeftIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SearchIcon,
  SendIcon,
  ShareIcon,
  SparklesIcon,
  Trash2Icon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  GUIDE_TEMPLATE_PRESETS,
  TRANSLATION_PAIR_PRESETS,
} from "@/lib/arbok/providers";
import { getUiCopy } from "@/lib/arbok/i18n";
import { computeListFontPx, computeOverlayFontPx } from "@/lib/arbok/tts-sync";
import { EqualizerBars } from "./arbok-icons";
import { formatTime, getPlatformMeta } from "./mock-data";
import { PlayQueuePopover } from "./play-queue-popover";
import type {
  AsrEngine,
  AsrJobState,
  Episode,
  EpisodeNote,
  GuideTemplateId,
  OfflineDownloadJob,
  RightWorkbenchTab,
  SubtitleFontFamily,
  SubtitleMode,
  TranslationPairId,
  UiLanguage,
  VideoSubtitleStyle,
} from "./types";
import {
  YouTubeHdPlayer,
  type YouTubeHdPlayerHandle,
} from "./youtube-hd-player";

interface ImmersivePlayerProps {
  episode: Episode;
  allEpisodes?: Episode[];
  playQueue?: string[];
  downloadJob?: OfflineDownloadJob | null;
  notes: EpisodeNote[];
  isPlaying: boolean;
  isBuffering: boolean;
  isDemoPlaceholder: boolean;
  fetchingSubtitles: boolean;
  mediaError: string | null;
  volume: number;
  videoStreamUrl: string | null;
  youtubeVideoId: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  ytPlayerRef: React.RefObject<YouTubeHdPlayerHandle | null>;
  playbackRate: number;
  audioOnly: boolean;
  videoQuality: string;
  actualQuality: string | null;
  maxAvailableQuality: string | null;
  rightTab: RightWorkbenchTab;
  subtitleMode: SubtitleMode;
  subtitleZhFontSize: number;
  subtitleOrigFontSize: number;
  subtitleFontFamily: SubtitleFontFamily;
  videoSubtitleStyle: VideoSubtitleStyle;
  subtitleShowNextAudioLine: boolean;
  subtitleOverlayX?: number;
  subtitleOverlayY?: number;
  onSubtitleOverlayPosChange?: (x: number, y: number) => void;
  showYoutubeSubscribeButton?: boolean;
  youtubeChannelUrl?: string;
  uiLanguage?: UiLanguage;
  ttsDubbingEnabled: boolean;
  ttsDubbingStatus: "idle" | "speaking" | "catching_up";
  translationPair: TranslationPairId;
  autoScroll: boolean;
  asrEngine: AsrEngine;
  asrJob: AsrJobState | null;
  translationProgress: { completed: number; total: number } | null;
  guideTemplate: GuideTemplateId;
  customGuidePrompt: string;
  generatingGuide?: boolean;
  streamingChatText: string | null;
  sidebarCollapsed: boolean;
  subSearchInputRef: React.RefObject<HTMLInputElement | null>;
  onToggleSidebar: () => void;
  onBack: () => void;
  onTogglePlay: () => void;
  onRetryPlayback: () => void;
  onOpenAddSource: () => void;
  onFetchOfficialSubtitles: (epId: string, force?: boolean) => Promise<void>;
  onVolumeChange: (volume: number) => void;
  onVideoTimeUpdate: () => void;
  onVideoLoadedMetadata: () => void;
  onVideoWaiting: () => void;
  onVideoCanPlay: () => void;
  onVideoEnded: () => void;
  onVideoError: () => void;
  onYouTubeTimeUpdate: (sec: number) => void;
  onYouTubeDurationReady: (durationSec: number) => void;
  onYouTubePlayingChange: (playing: boolean) => void;
  onYouTubeBufferingChange: (buffering: boolean) => void;
  onYouTubeActualQualityChange: (qualityLabel: string, maxLabel?: string) => void;
  onYouTubeEnded: () => void;
  onYouTubeEmbedUnavailable: () => void;
  onSkip: (delta: number) => void;
  onSeek: (sec: number, autoPlay?: boolean) => void;
  onPlaybackRateChange: (rate: number) => void;
  onAudioOnlyChange: (audioOnly: boolean) => void;
  onVideoQualityChange: (quality: string) => void;
  onTtsDubbingChange: (enabled: boolean) => void;
  onToggleOffline: (epId: string) => void;
  onPauseDownload?: (epId: string) => void;
  onResumeDownload?: (epId: string) => void;
  onCancelDownload?: (epId: string) => void;
  onPlayEpisode?: (epId: string) => void;
  onMoveQueueItem?: (epId: string, dir: -1 | 1) => void;
  onRemoveQueueItem?: (epId: string) => void;
  onClearQueue?: () => void;
  onAddToQueue?: (epId: string) => void;
  onRightTabChange: (tab: RightWorkbenchTab) => void;
  onSubtitleModeChange: (mode: SubtitleMode) => void;
  onTranslationPairChange: (pair: TranslationPairId) => void;
  onAutoScrollChange: (enabled: boolean) => void;
  onTranslateSubtitles: (epId: string, force?: boolean) => Promise<void>;
  onGuideTemplateChange: (template: GuideTemplateId) => void;
  onCustomGuidePromptChange: (prompt: string) => void;
  onSaveNote: (epId: string, segId: number, body: string) => void;
  onDeleteNote: (noteId: string) => void;
  onCopySegment: (text: string) => void;
  onCopySourceUrl: (url: string) => void;
  onRunAsr: (
    epId: string,
    localAudioPath?: string,
    options?: { force?: boolean }
  ) => Promise<void>;
  onCancelAsr: (epId: string) => Promise<void>;
  onGenerateGuide: (epId: string) => Promise<void>;
  onSendChat: (epId: string, prompt: string) => Promise<void>;
  onClearChat: (epId: string) => Promise<void>;
  onOpenBiliSettings: () => void;
  onOpenAsrSettings: () => void;
  onOpenExport: () => void;
}

const SPEED_OPTIONS = [
  { value: "0.5", label: "0.5x" },
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1.0x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "1.75", label: "1.75x" },
  { value: "2", label: "2.0x" },
  { value: "2.5", label: "2.5x" },
  { value: "3", label: "3.0x" },
];

const QUALITY_OPTIONS = [
  { value: "4K", label: "4K" },
  { value: "2K", label: "2K" },
  { value: "1080P", label: "1080P" },
  { value: "720P", label: "720P" },
  { value: "480P", label: "480P" },
];

const TRANSLATION_PAIR_OPTIONS = TRANSLATION_PAIR_PRESETS.map((p) => ({
  value: p.id,
  label: p.label,
}));

const QUICK_PROMPTS = [
  "总结最核心的反直觉观点",
  "提取提到的技术方案与数据",
  "用三句话给非技术朋友解释",
];

function renderHighlightedText(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, idx) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={`${idx}-${part}`}
        className="rounded-xs bg-amber-300/45 px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={`${idx}-${part}`}>{part}</Fragment>
    )
  );
}

export function ImmersivePlayer({
  episode,
  allEpisodes = [],
  playQueue = [],
  downloadJob = null,
  notes,
  isPlaying,
  isBuffering,
  isDemoPlaceholder,
  fetchingSubtitles,
  mediaError,
  volume,
  videoStreamUrl,
  youtubeVideoId,
  videoRef,
  ytPlayerRef,
  playbackRate,
  audioOnly,
  videoQuality,
  actualQuality,
  maxAvailableQuality,
  rightTab,
  subtitleMode,
  subtitleZhFontSize,
  subtitleOrigFontSize,
  subtitleFontFamily,
  videoSubtitleStyle,
  subtitleShowNextAudioLine,
  subtitleOverlayX = 50,
  subtitleOverlayY = 84,
  onSubtitleOverlayPosChange,
  showYoutubeSubscribeButton = false,
  youtubeChannelUrl,
  uiLanguage = "system",
  ttsDubbingEnabled,
  ttsDubbingStatus,
  translationPair,
  autoScroll,
  asrEngine,
  asrJob,
  translationProgress,
  guideTemplate,
  customGuidePrompt,
  generatingGuide = false,
  streamingChatText,
  sidebarCollapsed,
  subSearchInputRef,
  onToggleSidebar,
  onBack,
  onTogglePlay,
  onRetryPlayback,
  onOpenAddSource,
  onFetchOfficialSubtitles,
  onVolumeChange,
  onVideoTimeUpdate,
  onVideoLoadedMetadata,
  onVideoWaiting,
  onVideoCanPlay,
  onVideoEnded,
  onVideoError,
  onYouTubeTimeUpdate,
  onYouTubeDurationReady,
  onYouTubePlayingChange,
  onYouTubeBufferingChange,
  onYouTubeActualQualityChange,
  onYouTubeEnded,
  onYouTubeEmbedUnavailable,
  onSkip,
  onSeek,
  onPlaybackRateChange,
  onAudioOnlyChange,
  onVideoQualityChange,
  onTtsDubbingChange,
  onToggleOffline,
  onPauseDownload,
  onResumeDownload,
  onCancelDownload,
  onPlayEpisode,
  onMoveQueueItem,
  onRemoveQueueItem,
  onClearQueue,
  onAddToQueue,
  onRightTabChange,
  onSubtitleModeChange,
  onTranslationPairChange,
  onAutoScrollChange,
  onTranslateSubtitles,
  onGuideTemplateChange,
  onCustomGuidePromptChange,
  onSaveNote,
  onDeleteNote,
  onCopySegment,
  onCopySourceUrl,
  onRunAsr,
  onCancelAsr,
  onGenerateGuide,
  onSendChat,
  onClearChat,
  onOpenBiliSettings,
  onOpenAsrSettings,
  onOpenExport,
}: ImmersivePlayerProps) {
  const [subSearch, setSubSearch] = useState("");
  const [editingSegId, setEditingSegId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [expandedDescEpId, setExpandedDescEpId] = useState<string | null>(null);
  const descExpanded = expandedDescEpId === episode.id;
  const [descGoogleCache, setDescGoogleCache] = useState<Record<string, string>>(
    {}
  );
  const [descModeByEp, setDescModeByEp] = useState<
    Record<string, "orig" | "google">
  >({});
  const [descTranslateError, setDescTranslateError] = useState<string | null>(
    null
  );
  const [localAudioPath, setLocalAudioPath] = useState(
    episode.localFilePath ?? ""
  );
  const [videoScalePct, setVideoScalePct] = useState(100);
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);
  const [dragSubtitlePos, setDragSubtitlePos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  const subViewportRef = useRef<HTMLDivElement | null>(null);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const videoBoxRef = useRef<HTMLDivElement | null>(null);
  const subtitleOverlayRef = useRef<HTMLDivElement | null>(null);

  const activeSubtitlePos = dragSubtitlePos ?? {
    x: subtitleOverlayX,
    y: subtitleOverlayY,
  };

  function handleStartSubtitleDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();

    const boxRect = videoBoxRef.current?.getBoundingClientRect();
    const subRect = subtitleOverlayRef.current?.getBoundingClientRect();
    const boxW = Math.max(1, boxRect?.width ?? 640);
    const boxH = Math.max(1, boxRect?.height ?? 360);
    const halfW = (subRect?.width ?? 220) / 2;
    const halfH = (subRect?.height ?? 48) / 2;
    const minX = Math.min(50, Math.max(8, (halfW / boxW) * 100 + 2));
    const maxX = Math.max(50, 100 - minX);
    const minY = Math.min(50, Math.max(10, (halfH / boxH) * 100 + 4));
    const maxY = Math.max(50, Math.min(94, 100 - (halfH / boxH) * 100 - 3));

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startX = activeSubtitlePos.x;
    const startY = activeSubtitlePos.y;
    let latestX = startX;
    let latestY = startY;
    let hasMoved = false;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;
      if (!hasMoved) {
        if (Math.hypot(dx, dy) < 3) return;
        hasMoved = true;
        setIsDraggingSubtitle(true);
      }
      const dxPct = (dx / boxW) * 100;
      const dyPct = (dy / boxH) * 100;
      latestX = Math.max(minX, Math.min(maxX, startX + dxPct));
      latestY = Math.max(minY, Math.min(maxY, startY + dyPct));
      setDragSubtitlePos({ x: latestX, y: latestY });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (hasMoved) {
        setIsDraggingSubtitle(false);
        const committedX = Math.round(latestX * 10) / 10;
        const committedY = Math.round(latestY * 10) / 10;
        onSubtitleOverlayPosChange?.(committedX, committedY);
        setDragSubtitlePos(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  const meta = getPlatformMeta(episode.platform);
  const showVideo = episode.mediaType === "video" && !audioOnly;
  const canBilingual = episode.transcript.length > 0;
  const hasUntranslated = episode.transcript.some((s) => !s.zh?.trim());

  function handleStartStageDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const containerWidth =
      stageContainerRef.current?.getBoundingClientRect().width ?? 640;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPct = videoScalePct;
    setIsDraggingStage(true);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const dominantDelta = Math.abs(dx) >= Math.abs(dy) ? dx : dy * (16 / 9);
      const nextPct = Math.round(
        Math.max(45, Math.min(100, startPct + (dominantDelta / containerWidth) * 100))
      );
      setVideoScalePct(nextPct);
    };

    const onUp = () => {
      setIsDraggingStage(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleToggleFullscreen() {
    const target = videoBoxRef.current ?? videoRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void target.requestFullscreen?.();
    }
  }

  const activeSegIdx =
    episode.transcript.length > 0
      ? (() => {
          for (let i = episode.transcript.length - 1; i >= 0; i--) {
            if (episode.positionSec >= episode.transcript[i].start) return i;
          }
          return 0;
        })()
      : -1;
  const activeSeg = activeSegIdx >= 0 ? episode.transcript[activeSegIdx] : null;
  const nextSeg =
    activeSegIdx >= 0 && activeSegIdx + 1 < episode.transcript.length
      ? episode.transcript[activeSegIdx + 1]
      : null;

  const fontClass = subtitleFontFamily === "lxgw" ? "arbok-font-lxgw" : "";
  const overlayStyleClass =
    videoSubtitleStyle === "outline"
      ? "arbok-sub-overlay-outline"
      : videoSubtitleStyle === "none"
        ? "arbok-sub-overlay-none"
        : "arbok-sub-overlay-translucent";
  const overlayZhPx = computeOverlayFontPx(subtitleZhFontSize, "zh");
  const overlayOrigPx = computeOverlayFontPx(subtitleOrigFontSize, "orig");
  const listZhPx = computeListFontPx(subtitleZhFontSize, "zh");
  const listOrigPx = computeListFontPx(subtitleOrigFontSize, "orig");

  useEffect(() => {
    if (!autoScroll || rightTab !== "subtitles" || !activeRowRef.current) return;
    const viewport = subViewportRef.current;
    const row = activeRowRef.current;
    if (viewport && typeof viewport.scrollTo === "function") {
      const vpRect = viewport.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const centeredTop =
        viewport.scrollTop +
        (rowRect.top - vpRect.top) -
        vpRect.height / 2 +
        rowRect.height / 2;
      viewport.scrollTo({
        top: Math.max(0, centeredTop),
        behavior: "smooth",
      });
    } else {
      row.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeSeg?.id, autoScroll, rightTab]);

  function openNoteEditor(segId: number) {
    const existing = notes.find((n) => n.segId === segId);
    setNoteDraft(existing?.body ?? "");
    setEditingSegId(segId);
  }

  function submitInlineNote(segId: number) {
    if (!noteDraft.trim()) return;
    onSaveNote(episode.id, segId, noteDraft.trim());
    setEditingSegId(null);
    setNoteDraft("");
  }

  async function handleChatSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = chatDraft.trim();
    if (!prompt) return;
    setChatDraft("");
    await onSendChat(episode.id, prompt);
  }

  function renderChatContent(content: string) {
    const tokens = content.split(/(\[\d{2}:\d{2}\])/g);
    return tokens.map((token, index) => {
      const match = token.match(/^\[(\d{2}):(\d{2})\]$/);
      if (!match) {
        return <Fragment key={`${index}-${token}`}>{token}</Fragment>;
      }
      const sec = Number(match[1]) * 60 + Number(match[2]);
      const label = `${match[1]}:${match[2]}`;
      return (
        <Button
          key={`${index}-${label}`}
          className="tabular-nums mx-0.5 inline-flex h-5 rounded px-1.5 text-[11px] font-semibold"
          style={{
            color: "var(--arbok-accent-text)",
            background: "var(--arbok-accent-soft)",
            borderColor: "var(--arbok-accent-border)",
          }}
          onClick={() => onSeek(sec, true)}
        >
          跳转 {label}
        </Button>
      );
    });
  }

  function renderDescriptionContent(text: string) {
    const tokenRe = /(https?:\/\/[^\s<>()]+|\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/g;
    const parts = text.split(tokenRe);
    return parts.map((part, idx) => {
      if (/^https?:\/\//.test(part)) {
        return (
          <a
            key={`${idx}-url`}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all underline underline-offset-2 hover:opacity-80"
            style={{ color: "var(--arbok-accent-text)" }}
          >
            {part}
          </a>
        );
      }
      const tsMatch = part.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
      if (tsMatch) {
        const hrs = tsMatch[1] ? Number(tsMatch[1]) : 0;
        const mins = Number(tsMatch[2]);
        const secs = Number(tsMatch[3]);
        const totalSec = hrs * 3600 + mins * 60 + secs;
        if (totalSec <= episode.durationSec + 60) {
          return (
            <Button
              key={`${idx}-ts-${part}`}
              className="tabular-nums mx-0.5 inline-flex h-5 rounded px-1.5 text-[11px] font-semibold"
              style={{
                color: "var(--arbok-accent-text)",
                background: "var(--arbok-accent-soft)",
                borderColor: "var(--arbok-accent-border)",
              }}
              onClick={() => onSeek(totalSec, true)}
            >
              {part}
            </Button>
          );
        }
      }
      return <Fragment key={`${idx}-txt`}>{part}</Fragment>;
    });
  }

  const rawDescription =
    episode.description?.trim() ||
    episode.guide?.tldr?.trim() ||
    episode.subtitle?.trim() ||
    "";
  const descViewMode = descModeByEp[episode.id] ?? "orig";
  const googleTranslatedDesc = descGoogleCache[episode.id];
  const displayedDescription =
    descViewMode === "google" && googleTranslatedDesc
      ? googleTranslatedDesc
      : rawDescription;
  const isLongDescription =
    displayedDescription.length > 260 ||
    displayedDescription.split("\n").length > 5;

  async function handleGoogleTranslateDescription() {
    if (!rawDescription) return;
    setDescTranslateError(null);
    if (descGoogleCache[episode.id]) {
      setDescModeByEp((prev) => ({ ...prev, [episode.id]: "google" }));
      return;
    }
    if (process.env.NODE_ENV === "test") {
      setDescGoogleCache((prev) => ({
        ...prev,
        [episode.id]: `[谷歌翻译] ${rawDescription}`,
      }));
      setDescModeByEp((prev) => ({ ...prev, [episode.id]: "google" }));
      return;
    }
    try {
      const res = await fetch("/api/translate/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawDescription, targetLang: "zh-CN" }),
      });
      const data = (await res.json()) as {
        translatedText?: string;
        error?: string;
      };
      if (!res.ok || !data.translatedText) {
        setDescTranslateError(data.error ?? "谷歌翻译失败，请检查代理连接");
        return;
      }
      setDescGoogleCache((prev) => ({
        ...prev,
        [episode.id]: data.translatedText!,
      }));
      setDescModeByEp((prev) => ({ ...prev, [episode.id]: "google" }));
    } catch {
      setDescTranslateError("谷歌翻译网络请求失败，请检查代理连接");
    }
  }

  const isAsrRunning =
    asrJob?.status === "downloading" ||
    asrJob?.status === "splitting" ||
    asrJob?.status === "transcribing";

  return (
    <Resizable className="arbok-resizable flex h-full w-full min-h-0 flex-1">
      <ResizablePanel
        defaultSize={56}
        minSize={30}
        maxSize={78}
        className="flex h-full flex-col bg-[var(--ui-background)]"
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4">
          <div className="flex items-center gap-1.5">
            {sidebarCollapsed && (
              <Button
                aria-label="展开侧边栏"
                className="border-transparent bg-transparent"
                onClick={onToggleSidebar}
              >
                <PanelLeftIcon className="size-4" aria-hidden="true" />
              </Button>
            )}
            <Button
              className="border-transparent bg-transparent"
              onClick={onBack}
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
              <span>返回列表</span>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: meta.fg, background: meta.bg }}
            >
              {meta.label}
            </span>
            <span className="max-w-[160px] truncate text-xs font-medium text-[var(--ui-muted-foreground)]">
              {episode.channel}
            </span>
            {showYoutubeSubscribeButton && episode.platform === "youtube" && (
              <a
                href={youtubeChannelUrl || episode.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-6 items-center gap-1 rounded-full bg-[#dc2626] px-2.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <span>{getUiCopy(uiLanguage).ytSubscribeAction}</span>
                <ExternalLinkIcon className="size-3" aria-hidden="true" />
              </a>
            )}
            {onPlayEpisode &&
              onMoveQueueItem &&
              onRemoveQueueItem &&
              onClearQueue &&
              onAddToQueue && (
                <PlayQueuePopover
                  queueIds={playQueue}
                  episodes={allEpisodes}
                  currentEpisodeId={episode.id}
                  onPlayEpisode={onPlayEpisode}
                  onMoveItem={onMoveQueueItem}
                  onRemoveItem={onRemoveQueueItem}
                  onClearQueue={onClearQueue}
                  onAddEpisode={onAddToQueue}
                  side="bottom"
                />
              )}
          </div>
        </div>

        <ScrollArea className="arbok-scroll min-h-0 flex-1">
          <ScrollAreaViewport role="region" aria-label="媒体播放区">
            <ScrollAreaContent className="flex w-full flex-col justify-center px-5 py-4">
              {showVideo ? (
                <div ref={stageContainerRef} className="flex w-full flex-col items-center">
                  <div
                    ref={videoBoxRef}
                    className="group/stage relative flex aspect-video flex-col justify-between overflow-hidden rounded-2xl p-4 text-white shadow-xl transition-[width] duration-75"
                    style={{
                      width: `${videoScalePct}%`,
                      background:
                        youtubeVideoId || videoStreamUrl
                          ? "#09090b"
                          : episode.gradient,
                    }}
                  >
                    {youtubeVideoId ? (
                      <YouTubeHdPlayer
                        ref={ytPlayerRef}
                        videoId={youtubeVideoId}
                        initialTimeSec={episode.positionSec}
                        isPlaying={isPlaying}
                        playbackRate={playbackRate}
                        volume={volume}
                        preferredQuality={videoQuality}
                        onTimeUpdate={onYouTubeTimeUpdate}
                        onDurationReady={onYouTubeDurationReady}
                        onPlayingChange={onYouTubePlayingChange}
                        onBufferingChange={onYouTubeBufferingChange}
                        onActualQualityChange={onYouTubeActualQualityChange}
                        onEnded={onYouTubeEnded}
                        onEmbedUnavailable={onYouTubeEmbedUnavailable}
                      />
                    ) : (
                      videoStreamUrl && (
                        <video
                          ref={videoRef}
                          src={videoStreamUrl}
                          poster={episode.coverUrl}
                          playsInline
                          preload="metadata"
                          className="absolute inset-0 h-full w-full bg-black object-contain"
                          onClick={onTogglePlay}
                          onTimeUpdate={onVideoTimeUpdate}
                          onLoadedMetadata={onVideoLoadedMetadata}
                          onWaiting={onVideoWaiting}
                          onCanPlay={onVideoCanPlay}
                          onPlaying={onVideoCanPlay}
                          onEnded={onVideoEnded}
                          onError={onVideoError}
                        />
                      )
                    )}

                    <div className="pointer-events-none relative z-10 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium backdrop-blur-md">
                          <span
                            className={`size-1.5 rounded-full ${
                              isBuffering ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                            }`}
                          />
                          {isBuffering
                            ? "正在缓冲媒体流…"
                            : youtubeVideoId
                              ? `YouTube 高清直连 · 实际 ${actualQuality ?? videoQuality}${
                                  maxAvailableQuality &&
                                  maxAvailableQuality !== videoQuality &&
                                  (videoQuality === "4K" || videoQuality === "2K")
                                    ? `（片源最高 ${maxAvailableQuality}）`
                                    : ""
                                }`
                              : `本地流代理 · 实际 ${actualQuality ?? videoQuality} 无广告`}
                        </span>
                        {ttsDubbingEnabled && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
                            <span
                              className={`size-1.5 rounded-full ${
                                ttsDubbingStatus === "catching_up"
                                  ? "bg-amber-400 animate-pulse"
                                  : "bg-sky-400 animate-pulse"
                              }`}
                            />
                            {ttsDubbingStatus === "catching_up"
                              ? "中文播报追赶中 · 已暂停视频等待同步"
                              : "中文 TTS 播报中"}
                          </span>
                        )}
                      </div>

                      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/55 p-1 backdrop-blur-md">
                        <Button
                          aria-label="缩小视频画面"
                          className="size-6 rounded-full border-transparent bg-transparent p-0 text-white hover:bg-white/15"
                          onClick={() =>
                            setVideoScalePct((pct) => Math.max(45, pct - 10))
                          }
                        >
                          <MinusIcon className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          aria-label="还原视频画面大小"
                          className="tabular-nums h-6 rounded-full border-transparent bg-transparent px-1.5 text-[11px] text-white hover:bg-white/15"
                          onClick={() => setVideoScalePct(100)}
                        >
                          {videoScalePct}%
                        </Button>
                        <Button
                          aria-label="放大视频画面"
                          className="size-6 rounded-full border-transparent bg-transparent p-0 text-white hover:bg-white/15"
                          onClick={() =>
                            setVideoScalePct((pct) => Math.min(100, pct + 10))
                          }
                        >
                          <PlusIcon className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          aria-label="全屏播放视频"
                          className="size-6 rounded-full border-transparent bg-transparent p-0 text-white hover:bg-white/15"
                          onClick={handleToggleFullscreen}
                        >
                          <Maximize2Icon className="size-3" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>

                    {!youtubeVideoId && !videoStreamUrl && (
                      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                        <div className="text-xl font-bold tracking-tight">
                          {episode.coverLabel}
                        </div>
                        <div className="text-xs text-white/85">
                          {isBuffering
                            ? "正在加载音频流…"
                            : isPlaying
                              ? "播放中 · 点击右侧任意字幕可毫秒级跳转"
                              : "已暂停 · 按 Space 开始播放"}
                        </div>
                        <EqualizerBars playing={isPlaying} />
                      </div>
                    )}

                    {isDraggingSubtitle && (
                      <div
                        aria-hidden="true"
                        className="fixed inset-0 z-40 cursor-grabbing"
                      />
                    )}

                    {subtitleMode !== "none" &&
                      activeSeg &&
                      ((canBilingual && subtitleMode !== "orig" && activeSeg.zh && overlayZhPx > 0) ||
                        (subtitleMode !== "zh" && overlayOrigPx > 0)) && (
                        <div
                          ref={subtitleOverlayRef}
                          data-testid="video-subtitle-overlay"
                          title="按住拖动可自由移动字幕位置，双击恢复默认位置"
                          onPointerDown={handleStartSubtitleDrag}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setDragSubtitlePos(null);
                            onSubtitleOverlayPosChange?.(50, 84);
                          }}
                          className={`pointer-events-auto absolute z-20 max-w-[92%] touch-none select-none text-center text-white antialiased transition-shadow ${overlayStyleClass} ${fontClass} ${
                            isDraggingSubtitle
                              ? "cursor-grabbing ring-2 ring-sky-400/85"
                              : "cursor-grab hover:ring-1 hover:ring-white/45"
                          }`}
                          style={{
                            left: `${activeSubtitlePos.x}%`,
                            top: `${activeSubtitlePos.y}%`,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          {canBilingual &&
                            subtitleMode !== "orig" &&
                            activeSeg.zh &&
                            overlayZhPx > 0 && (
                              <div
                                className="font-semibold leading-[1.32] tracking-[0.015em] text-white"
                                style={{ fontSize: `${overlayZhPx}px` }}
                              >
                                {activeSeg.zh}
                              </div>
                            )}
                          {(!canBilingual ||
                            !activeSeg.zh ||
                            subtitleMode !== "zh") &&
                            overlayOrigPx > 0 && (
                              <div
                                translate="no"
                                className={`notranslate leading-[1.38] ${
                                  canBilingual &&
                                  activeSeg.zh &&
                                  subtitleMode === "bilingual"
                                    ? "mt-1 text-white/90"
                                    : "font-medium text-white"
                                }`}
                                style={{ fontSize: `${overlayOrigPx}px` }}
                              >
                                {activeSeg.orig}
                              </div>
                            )}
                        </div>
                      )}

                    {/* Pointer drag handle for free resizing of the video stage */}
                    <div
                      aria-hidden="true"
                      title="拖拽拉伸或缩小播放器画面（双击恢复 100%）"
                      onPointerDown={handleStartStageDrag}
                      onDoubleClick={() => setVideoScalePct(100)}
                      className={`absolute right-1.5 bottom-1.5 z-20 flex size-6 cursor-nwse-resize items-end justify-end rounded-md p-1 transition-opacity ${
                        isDraggingStage
                          ? "bg-white/25 opacity-100"
                          : "opacity-55 hover:bg-white/20 hover:opacity-100"
                      }`}
                    >
                      <span className="block size-2.5 border-r-2 border-b-2 border-white/90" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-3">
                  <div
                    className="relative flex size-56 flex-col items-center justify-center overflow-hidden rounded-2xl p-5 text-center text-white shadow-xl"
                    style={{ background: episode.gradient }}
                  >
                    {episode.coverUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={episode.coverUrl}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                        <div className="relative z-10 mt-auto flex flex-col items-center gap-1.5">
                          <span className="rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-medium backdrop-blur-md">
                            {isBuffering
                              ? "缓冲中…"
                              : episode.mediaType === "video"
                                ? "纯音频模式"
                                : meta.label}
                          </span>
                          <EqualizerBars playing={isPlaying} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[11px] tracking-widest uppercase text-white/80">
                          {isBuffering
                            ? "缓冲中…"
                            : episode.mediaType === "video"
                              ? "纯音频模式"
                              : meta.label}
                        </div>
                        <div className="mt-1.5 text-2xl font-bold tracking-tight">
                          {episode.coverLabel}
                        </div>
                        <div className="mt-4">
                          <EqualizerBars playing={isPlaying} />
                        </div>
                      </>
                    )}
                  </div>

                  {subtitleMode !== "none" && subtitleShowNextAudioLine && activeSeg && (
                    <div
                      className={`mt-4 w-full max-w-xl rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-4 py-3 text-center ${fontClass}`}
                    >
                      <div className="text-[11px] font-medium text-[var(--arbok-accent-text)]">
                        当前字幕
                      </div>
                      {subtitleMode !== "orig" && activeSeg.zh && listZhPx > 0 && (
                        <div
                          className="mt-1 font-medium leading-snug text-[var(--ui-foreground)]"
                          style={{ fontSize: `${listZhPx}px` }}
                        >
                          {activeSeg.zh}
                        </div>
                      )}
                      {(!activeSeg.zh || subtitleMode !== "zh") && listOrigPx > 0 && (
                        <div
                          translate="no"
                          className="notranslate mt-0.5 leading-relaxed text-[var(--ui-muted-foreground)]"
                          style={{ fontSize: `${listOrigPx}px` }}
                        >
                          {activeSeg.orig}
                        </div>
                      )}

                      {nextSeg && (
                        <div className="mt-2.5 border-t border-[var(--ui-border)] pt-2 opacity-65">
                          <div className="text-[10px] font-medium text-[var(--ui-muted-foreground)]">
                            下一句预告 · {formatTime(nextSeg.start)}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                            {subtitleMode !== "orig" && nextSeg.zh
                              ? nextSeg.zh
                              : nextSeg.orig}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isDemoPlaceholder && (
                <div
                  role="status"
                  className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-accent-soft)] px-3.5 py-2.5 text-xs text-[var(--ui-foreground)]"
                >
                  <span className="leading-relaxed">
                    当前条目为内置界面演示占位卡片（无真实音视频源与完整字幕），请添加真实播客、YouTube 或 B站链接体验真实播放。
                  </span>
                  <Button
                    data-variant="solid"
                    className="shrink-0"
                    onClick={onOpenAddSource}
                  >
                    导入真实内容
                  </Button>
                </div>
              )}

              {mediaError && !isDemoPlaceholder && (
                <div
                  role="alert"
                  className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--status-warn-bg)] px-3.5 py-2.5 text-xs text-[var(--status-warn-fg)]"
                >
                  <span className="leading-relaxed">{mediaError}</span>
                  <Button className="shrink-0" onClick={onRetryPlayback}>
                    重试播放
                  </Button>
                </div>
              )}

              <div className="mt-5">
                <h1 className="text-lg font-semibold leading-snug tracking-tight text-[var(--ui-foreground)]">
                  {episode.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ui-muted-foreground)]">
                  <span>{episode.date}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {formatTime(episode.durationSec)}
                  </span>
                  <span>·</span>
                  <Button
                    className="h-6 border-transparent bg-transparent px-1.5 text-xs"
                    style={{ color: "var(--arbok-accent-text)" }}
                    onClick={() => onCopySourceUrl(episode.pageUrl)}
                  >
                    复制原链接
                  </Button>
                </div>
              </div>

              <div className="mt-5">
                <Slider
                  className="arbok-compact-slider"
                  min={0}
                  max={episode.durationSec}
                  step={1}
                  value={Math.floor(episode.positionSec)}
                  onValueChange={(next) => {
                    const val = Array.isArray(next) ? next[0] : next;
                    onSeek(val, isPlaying);
                  }}
                >
                  <SliderControl>
                    <SliderTrack>
                      <SliderIndicator />
                      <SliderThumb aria-label="播放进度" />
                    </SliderTrack>
                  </SliderControl>
                </Slider>
                <div className="tabular-nums mt-1.5 flex justify-between text-[11px] text-[var(--ui-muted-foreground)]">
                  <span>{formatTime(episode.positionSec)}</span>
                  <span>{formatTime(episode.durationSec)}</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    items={SPEED_OPTIONS}
                    value={String(playbackRate)}
                    onValueChange={(next) => {
                      if (next) onPlaybackRateChange(Number(next));
                    }}
                  >
                    <SelectLabel className="sr-only">播放倍速</SelectLabel>
                    <SelectTrigger className="tabular-nums w-[74px] shrink-0">
                      <SelectValue />
                      <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPEED_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                          <SelectItemIndicator>
                            <CheckIcon className="size-3.5" aria-hidden="true" />
                          </SelectItemIndicator>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {episode.mediaType === "video" ? (
                    <>
                      <Toggle
                        pressed={audioOnly}
                        onPressedChange={onAudioOnlyChange}
                      >
                        <ToggleIcon>
                          <HeadphonesIcon className="size-3.5" />
                        </ToggleIcon>
                        <span>纯音频模式</span>
                      </Toggle>
                      <Select
                        items={QUALITY_OPTIONS}
                        value={videoQuality}
                        onValueChange={(next) => {
                          if (next) onVideoQualityChange(next);
                        }}
                      >
                        <SelectLabel className="sr-only">视频清晰度</SelectLabel>
                        <SelectTrigger className="w-[82px] shrink-0">
                          <SelectValue />
                          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                        </SelectTrigger>
                        <SelectContent>
                          {QUALITY_OPTIONS.map((q) => (
                            <SelectItem key={q.value} value={q.value}>
                              {q.label}
                              <SelectItemIndicator>
                                <CheckIcon className="size-3.5" aria-hidden="true" />
                              </SelectItemIndicator>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <span className="rounded bg-[var(--ui-muted)] px-2 py-1 text-xs text-[var(--ui-muted-foreground)]">
                      {episode.platform === "local" ? "本地离线音频" : "纯音频播客流"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    aria-label="快退 15 秒"
                    className="size-9 rounded-full"
                    onClick={() => onSkip(-15)}
                  >
                    <RotateCcwIcon className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    data-variant="solid"
                    aria-label={isPlaying ? "暂停播放" : "开始播放"}
                    className="size-11 rounded-full shadow-md"
                    onClick={onTogglePlay}
                  >
                    {isPlaying ? (
                      <PauseIcon className="size-5" aria-hidden="true" />
                    ) : (
                      <PlayIcon className="size-5 translate-x-[1px]" aria-hidden="true" />
                    )}
                  </Button>
                  <Button
                    aria-label="快进 15 秒"
                    className="size-9 rounded-full"
                    onClick={() => onSkip(15)}
                  >
                    <RotateCwIcon className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <Toggle
                    pressed={ttsDubbingEnabled}
                    onPressedChange={onTtsDubbingChange}
                  >
                    <ToggleIcon>
                      <AudioLinesIcon className="size-3.5" />
                    </ToggleIcon>
                    <span>播报 TTS</span>
                  </Toggle>

                  <div className="flex items-center gap-2">
                    <Volume2Icon
                      className="size-3.5 shrink-0 text-[var(--ui-muted-foreground)]"
                      aria-hidden="true"
                    />
                    <div className="w-24 shrink-0">
                      <Slider
                        className="arbok-compact-slider"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(volume * 100)}
                        onValueChange={(next) => {
                          const val = Array.isArray(next) ? next[0] : next;
                          onVolumeChange(Math.max(0, Math.min(1, val / 100)));
                        }}
                      >
                        <SliderControl>
                          <SliderTrack>
                            <SliderIndicator />
                            <SliderThumb aria-label="播放音量" />
                          </SliderTrack>
                        </SliderControl>
                      </Slider>
                    </div>
                  </div>

                  {downloadJob &&
                  (downloadJob.status === "downloading" ||
                    downloadJob.status === "queued" ||
                    downloadJob.status === "paused") ? (
                    <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-2 py-1 text-xs">
                      <span className="tabular-nums font-medium text-[var(--ui-foreground)]">
                        {downloadJob.status === "paused"
                          ? `已暂停 ${downloadJob.progress}%`
                          : downloadJob.status === "queued"
                            ? "排队下载"
                            : `下载中 ${downloadJob.progress}%`}
                      </span>
                      {downloadJob.status === "paused" ? (
                        <Button
                          aria-label="继续当前离线下载"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() => onResumeDownload?.(episode.id)}
                        >
                          继续
                        </Button>
                      ) : (
                        <Button
                          aria-label="暂停当前离线下载"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={() => onPauseDownload?.(episode.id)}
                        >
                          暂停
                        </Button>
                      )}
                      <Button
                        aria-label="取消当前离线下载"
                        className="h-6 px-1.5 text-[11px]"
                        onClick={() => onCancelDownload?.(episode.id)}
                      >
                        取消
                      </Button>
                    </div>
                  ) : (
                    <Toggle
                      pressed={episode.isOffline}
                      disabled={episode.platform === "local"}
                      onPressedChange={() => onToggleOffline(episode.id)}
                    >
                      <ToggleIcon>
                        <DownloadIcon className="size-3.5" />
                      </ToggleIcon>
                      <span>
                        {episode.platform === "local"
                          ? "本地离线"
                          : episode.isOffline
                            ? "已离线"
                            : "离线下载"}
                      </span>
                    </Toggle>
                  )}
                </div>
              </div>

              <section
                aria-label={episode.mediaType === "video" ? "视频简介" : "节目简介"}
                className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-semibold tracking-wide text-[var(--ui-foreground)]">
                      {episode.mediaType === "video" ? "视频简介" : "节目简介"}
                    </h2>
                    <span className="text-[11px] text-[var(--ui-muted-foreground)]">
                      {episode.channel} · {episode.date}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rawDescription && (
                      <div className="flex items-center gap-1">
                        <Button
                          data-variant={
                            descViewMode === "google" ? "solid" : undefined
                          }
                          className="h-6 px-2 text-xs"
                          pendingAnnouncement="正在使用谷歌翻译简介"
                          onClick={handleGoogleTranslateDescription}
                        >
                          谷歌翻译
                        </Button>
                        <Button
                          data-variant={
                            descViewMode === "orig" ? "solid" : undefined
                          }
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            setDescTranslateError(null);
                            setDescModeByEp((prev) => ({
                              ...prev,
                              [episode.id]: "orig",
                            }));
                          }}
                        >
                          原文
                        </Button>
                      </div>
                    )}
                    <span className="hidden text-[11px] text-[var(--ui-muted-foreground)] sm:inline">
                      Space 播放 · C 切双语 · ⌘F 搜字幕
                    </span>
                    {isLongDescription && (
                      <Button
                        className="h-6 border-transparent bg-transparent px-1.5 text-xs"
                        style={{ color: "var(--arbok-accent-text)" }}
                        onClick={() =>
                          setExpandedDescEpId((cur) =>
                            cur === episode.id ? null : episode.id
                          )
                        }
                      >
                        {descExpanded ? "收起简介" : "展开简介"}
                      </Button>
                    )}
                  </div>
                </div>

                {descTranslateError && (
                  <div
                    role="alert"
                    className="mb-2 rounded-lg bg-[var(--status-warn-bg)] px-2.5 py-1.5 text-xs text-[var(--status-warn-fg)]"
                  >
                    {descTranslateError}
                  </div>
                )}

                {displayedDescription ? (
                  <div
                    className={`whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ui-muted-foreground)] ${
                      !descExpanded && isLongDescription ? "line-clamp-4" : ""
                    }`}
                  >
                    {renderDescriptionContent(displayedDescription)}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ui-muted-foreground)]">
                    <span>
                      {fetchingSubtitles
                        ? "正在从原平台同步视频简介与元数据…"
                        : "暂无原始简介，可在右侧「AI 导读」一键提炼全文摘要与章节时间线。"}
                    </span>
                    {!fetchingSubtitles && (
                      <Button
                        className="h-7 px-2.5 text-xs"
                        onClick={() => onRightTabChange("guide")}
                      >
                        查看 AI 导读
                      </Button>
                    )}
                  </div>
                )}
              </section>
            </ScrollAreaContent>
          </ScrollAreaViewport>
          <ScrollAreaScrollbar orientation="vertical">
            <ScrollAreaThumb />
          </ScrollAreaScrollbar>
        </ScrollArea>
      </ResizablePanel>

      <ResizableHandle aria-label="调整播放区与阅读区宽度" />

      <ResizablePanel
        minSize={35}
        className="flex h-full flex-col bg-[var(--ui-background)]"
      >
        <Tabs
          value={rightTab}
          onValueChange={(next) => {
            if (
              next === "subtitles" ||
              next === "guide" ||
              next === "chat" ||
              next === "notes"
            ) {
              onRightTabChange(next);
            }
          }}
          className="flex h-full min-h-0 flex-1 flex-col"
        >
          <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4">
            <TabsList aria-label="单集阅读工作台" className="border-b-0">
              <TabsTab value="subtitles">字幕</TabsTab>
              <TabsTab value="guide">AI 导读</TabsTab>
              <TabsTab value="chat">AI 问答</TabsTab>
              <TabsTab value="notes">
                {notes.length > 0 ? `笔记 (${notes.length})` : "笔记"}
              </TabsTab>
            </TabsList>

            <Button onClick={onOpenExport}>
              <ShareIcon className="size-3.5" aria-hidden="true" />
              <span>导出 MD</span>
            </Button>
          </div>

          <TabsPanel
            value="subtitles"
            className="flex min-h-0 flex-1 flex-col p-0"
          >
            {episode.transcript.length === 0 ? (
              <div className="mx-auto my-10 w-full max-w-md rounded-2xl border border-dashed border-[var(--ui-input)] bg-[var(--ui-muted)] p-6 text-center">
                <h2 className="text-[15px] font-semibold text-[var(--ui-foreground)]">
                  {fetchingSubtitles
                    ? "正在拉取完整官方字幕…"
                    : "该单集暂无官方字幕"}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                  当前引擎：{" "}
                  <strong className="text-[var(--ui-foreground)]">
                    {asrEngine === "cloud"
                      ? "云端 ASR API（支持分片断点重试）"
                      : "本地离线 ASR（whisper.cpp 独立子进程）"}
                  </strong>
                </p>

                {isAsrRunning && asrJob && (
                  <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-3.5 text-left">
                    <Progress value={asrJob.progress} className="arbok-compact-progress">
                      <div className="flex items-center justify-between text-xs">
                        <ProgressLabel className="font-medium text-[var(--ui-foreground)]">
                          {asrJob.message}
                        </ProgressLabel>
                        <ProgressValue className="tabular-nums text-[var(--ui-muted-foreground)]" />
                      </div>
                      <ProgressTrack>
                        <ProgressIndicator />
                      </ProgressTrack>
                    </Progress>
                    <div className="mt-3 flex justify-end">
                      <Button onClick={() => onCancelAsr(episode.id)}>
                        取消转写任务
                      </Button>
                    </div>
                  </div>
                )}

                {asrJob?.status === "failed" && asrJob.error && (
                  <div
                    role="alert"
                    className="mt-4 rounded-lg border border-[var(--ui-border)] bg-[var(--status-warn-bg)] p-3 text-left text-xs leading-relaxed text-[var(--status-warn-fg)]"
                  >
                    {asrJob.error}
                  </div>
                )}

                <div className="mt-4 text-left">
                  <Field name="localAudioPath">
                    <FieldLabel className="text-xs">
                      可选：指定本机音频文件路径（离线直转）
                    </FieldLabel>
                    <Input
                      value={localAudioPath}
                      placeholder="/Users/.../episode.mp3（留空则自动拉取）"
                      onValueChange={setLocalAudioPath}
                    />
                  </Field>
                </div>

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button
                    data-variant="solid"
                    disabled={isAsrRunning}
                    pendingAnnouncement="正在转写字幕"
                    onClick={() =>
                      onRunAsr(episode.id, localAudioPath.trim() || undefined)
                    }
                  >
                    {asrJob?.status === "failed"
                      ? "从断点重试转写"
                      : "开始转写字幕"}
                  </Button>
                  {!isDemoPlaceholder &&
                    (episode.platform === "youtube" ||
                      episode.platform === "bilibili") && (
                      <Button
                        disabled={fetchingSubtitles}
                        pendingAnnouncement="正在拉取官方字幕"
                        onClick={() => onFetchOfficialSubtitles(episode.id, true)}
                      >
                        拉取官方字幕
                      </Button>
                    )}
                  <Button onClick={onOpenAsrSettings}>配置 ASR 引擎</Button>
                  {episode.platform === "bilibili" && (
                    <Button onClick={onOpenBiliSettings}>
                      登录 B站解锁官方 AI 字幕
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {canBilingual ? (
                      <>
                        <SegmentedControl
                          aria-label="字幕显示语言"
                          value={subtitleMode}
                          onValueChange={(next) => {
                            if (
                              next === "none" ||
                              next === "bilingual" ||
                              next === "zh" ||
                              next === "orig"
                            ) {
                              onSubtitleModeChange(next);
                            }
                          }}
                        >
                          <SegmentedControlIndicator />
                          <SegmentedControlItem value="none">无</SegmentedControlItem>
                          <SegmentedControlItem value="bilingual">双语</SegmentedControlItem>
                          <SegmentedControlItem value="zh">纯中文</SegmentedControlItem>
                          <SegmentedControlItem value="orig">纯原文</SegmentedControlItem>
                        </SegmentedControl>

                        <Select
                          items={TRANSLATION_PAIR_OPTIONS}
                          value={translationPair}
                          onValueChange={(next) => {
                            if (next) {
                              onTranslationPairChange(next as TranslationPairId);
                            }
                          }}
                        >
                          <SelectLabel className="sr-only">翻译语言方向</SelectLabel>
                          <SelectTrigger className="w-[144px] shrink-0">
                            <SelectValue />
                            <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                          </SelectTrigger>
                          <SelectContent>
                            {TRANSLATION_PAIR_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                                <SelectItemIndicator>
                                  <CheckIcon className="size-3.5" aria-hidden="true" />
                                </SelectItemIndicator>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          pendingAnnouncement="正在流式翻译双语字幕"
                          onClick={() =>
                            onTranslateSubtitles(episode.id, !hasUntranslated)
                          }
                        >
                          <LanguagesIcon className="size-3.5" aria-hidden="true" />
                          <span>
                            {hasUntranslated ? "翻译双语字幕" : "重新翻译字幕"}
                          </span>
                        </Button>
                      </>
                    ) : (
                      <span className="rounded bg-[var(--ui-muted)] px-2 py-1 text-xs text-[var(--ui-muted-foreground)]">
                        中文原文
                      </span>
                    )}

                    <Toggle
                      pressed={autoScroll}
                      onPressedChange={onAutoScrollChange}
                    >
                      自动跟随
                    </Toggle>

                    <Button
                      disabled={isAsrRunning}
                      title="忽略旧字幕与断点，重新转写生成字幕"
                      pendingAnnouncement="正在重新生成字幕"
                      onClick={() =>
                        void onRunAsr(episode.id, undefined, { force: true })
                      }
                    >
                      <RefreshCwIcon
                        className={`size-3.5 ${isAsrRunning ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      <span>{isAsrRunning ? "生成中…" : "重新生成"}</span>
                    </Button>

                    <span className="tabular-nums rounded bg-[var(--ui-muted)] px-2 py-0.5 text-[11px] text-[var(--ui-muted-foreground)]">
                      共 {episode.transcript.length} 句 · 至{" "}
                      {formatTime(
                        episode.transcript[episode.transcript.length - 1]?.end ?? 0
                      )}
                    </span>
                  </div>

                  <InputGroup className="w-44">
                    <SearchIcon
                      className="ml-2 size-3.5 text-[var(--ui-muted-foreground)]"
                      aria-hidden="true"
                    />
                    <Input
                      ref={subSearchInputRef}
                      type="search"
                      aria-label="搜索当前文稿"
                      value={subSearch}
                      placeholder="搜文稿 (⌘F)..."
                      onValueChange={setSubSearch}
                    />
                    <InputClear aria-label="清空文稿搜索">
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </InputClear>
                  </InputGroup>
                </div>

                {isAsrRunning && asrJob && (
                  <div className="border-b border-[var(--ui-border)] bg-[var(--arbok-surface)] px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <Progress
                          value={asrJob.progress}
                          className="arbok-compact-progress"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <ProgressLabel className="truncate font-medium text-[var(--ui-foreground)]">
                              {asrJob.message}
                            </ProgressLabel>
                            <ProgressValue className="tabular-nums text-[var(--arbok-accent-text)]" />
                          </div>
                          <ProgressTrack>
                            <ProgressIndicator />
                          </ProgressTrack>
                        </Progress>
                      </div>
                      <Button
                        className="h-7 shrink-0 px-2.5 text-xs"
                        onClick={() => onCancelAsr(episode.id)}
                      >
                        取消转写
                      </Button>
                    </div>
                  </div>
                )}

                {!isAsrRunning && asrJob?.status === "failed" && asrJob.error && (
                  <div
                    role="alert"
                    className="flex items-center justify-between gap-2 border-b border-[var(--ui-border)] bg-[var(--status-warn-bg)] px-4 py-2 text-xs text-[var(--status-warn-fg)]"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      重新生成字幕失败：{asrJob.error}
                    </span>
                    <Button
                      className="h-7 shrink-0 px-2.5 text-xs"
                      onClick={() =>
                        void onRunAsr(episode.id, undefined, { force: true })
                      }
                    >
                      重试
                    </Button>
                  </div>
                )}

                {translationProgress && (
                  <div className="border-b border-[var(--ui-border)] bg-[var(--arbok-accent-soft)] px-4 py-2">
                    <Progress
                      value={Math.round(
                        (translationProgress.completed /
                          Math.max(1, translationProgress.total)) *
                          100
                      )}
                      className="arbok-compact-progress"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <ProgressLabel className="font-medium text-[var(--ui-foreground)]">
                          流式上下文翻译中（已写入 SQLite 缓存：
                          {translationProgress.completed} /{" "}
                          {translationProgress.total} 句）
                        </ProgressLabel>
                        <ProgressValue className="tabular-nums text-[var(--arbok-accent-text)]" />
                      </div>
                      <ProgressTrack>
                        <ProgressIndicator />
                      </ProgressTrack>
                    </Progress>
                  </div>
                )}

                <ScrollArea className="arbok-scroll min-h-0 flex-1">
                  <ScrollAreaViewport
                    ref={subViewportRef}
                    role="region"
                    aria-label="同步字幕列表"
                  >
                    <ScrollAreaContent className="flex flex-col gap-1 px-4 pt-16 pb-[42vh]">
                      {episode.transcript.map((seg) => {
                        const isActive = activeSeg?.id === seg.id;
                        const ts = formatTime(seg.start);
                        const existingNote = notes.find((n) => n.segId === seg.id);
                        const isEditing = editingSegId === seg.id;

                        return (
                          <div
                            key={seg.id}
                            ref={isActive ? activeRowRef : null}
                            className="group relative rounded-xl"
                          >
                            <div className="flex items-start gap-1">
                              <Button
                                data-active={isActive ? "true" : "false"}
                                className="arbok-subtitle-row flex-1 gap-3.5"
                                onClick={() => onSeek(seg.start, true)}
                              >
                                <span
                                  className="tabular-nums w-11 shrink-0 pt-0.5 text-xs"
                                  style={{
                                    color: isActive
                                      ? "var(--arbok-accent-text)"
                                      : "var(--ui-muted-foreground)",
                                    fontWeight: isActive ? 600 : 400,
                                  }}
                                >
                                  {ts}
                                </span>
                                <span
                                  className={`flex min-w-0 flex-1 flex-col gap-1 ${fontClass}`}
                                >
                                  {(!canBilingual ||
                                    !seg.zh ||
                                    subtitleMode !== "zh") &&
                                    listOrigPx > 0 && (
                                      <span
                                        translate="no"
                                        className="notranslate leading-relaxed text-[var(--ui-foreground)]"
                                        style={{ fontSize: `${listOrigPx}px` }}
                                      >
                                        {renderHighlightedText(seg.orig, subSearch)}
                                      </span>
                                    )}
                                  {canBilingual &&
                                    seg.zh &&
                                    subtitleMode !== "orig" &&
                                    listZhPx > 0 && (
                                      <span
                                        className={
                                          subtitleMode === "zh"
                                            ? "leading-relaxed text-[var(--ui-foreground)]"
                                            : "leading-relaxed text-[var(--ui-muted-foreground)]"
                                        }
                                        style={{ fontSize: `${listZhPx}px` }}
                                      >
                                        {renderHighlightedText(seg.zh, subSearch)}
                                      </span>
                                    )}
                                </span>
                              </Button>

                              <div className="flex shrink-0 items-center gap-1 pt-2 pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                                <Button
                                  aria-label={`为 ${ts} 记笔记`}
                                  className="size-7"
                                  onClick={() => openNoteEditor(seg.id)}
                                >
                                  <BookmarkPlusIcon
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                </Button>
                                <Button
                                  aria-label={`复制 ${ts} 字幕`}
                                  className="size-7"
                                  onClick={() =>
                                    onCopySegment(
                                      `[${ts}] ${seg.orig}${seg.zh ? `\n${seg.zh}` : ""}`
                                    )
                                  }
                                >
                                  <CopyIcon className="size-3.5" aria-hidden="true" />
                                </Button>
                              </div>
                            </div>

                            {existingNote && !isEditing && (
                              <div
                                className="mx-3 mb-2 rounded-lg border-l-2 px-3 py-2 text-xs leading-relaxed text-[var(--ui-foreground)]"
                                style={{
                                  background: "var(--status-warn-bg)",
                                  borderColor: "var(--status-warn-fg)",
                                }}
                              >
                                <strong>笔记：</strong>
                                {existingNote.body}
                              </div>
                            )}

                            {isEditing && (
                              <div className="mx-3 mb-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-muted)] p-3">
                                <Field name={`note-${seg.id}`}>
                                  <FieldLabel>单句笔记（{ts}）</FieldLabel>
                                  <Textarea
                                    autoResize
                                    rows={2}
                                    value={noteDraft}
                                    placeholder="记录这一句给你的启发或待办..."
                                    onValueChange={setNoteDraft}
                                  />
                                </Field>
                                <div className="mt-2.5 flex justify-end gap-2">
                                  <Button
                                    onClick={() => {
                                      setEditingSegId(null);
                                      setNoteDraft("");
                                    }}
                                  >
                                    取消编辑笔记
                                  </Button>
                                  <Button
                                    data-variant="solid"
                                    onClick={() => submitInlineNote(seg.id)}
                                  >
                                    保存单句笔记
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </ScrollAreaContent>
                  </ScrollAreaViewport>
                  <ScrollAreaScrollbar orientation="vertical">
                    <ScrollAreaThumb />
                  </ScrollAreaScrollbar>
                </ScrollArea>
              </>
            )}
          </TabsPanel>

          <TabsPanel value="guide" className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ui-border)] px-4 py-2">
              <div className="flex items-center gap-2">
                <Select
                  items={GUIDE_TEMPLATE_PRESETS.map((t) => ({
                    value: t.id,
                    label: t.label,
                  }))}
                  value={guideTemplate}
                  onValueChange={(next) => {
                    if (
                      next === "deep" ||
                      next === "brief" ||
                      next === "technical" ||
                      next === "custom"
                    ) {
                      onGuideTemplateChange(next);
                    }
                  }}
                >
                  <SelectLabel className="sr-only">AI 导读模板</SelectLabel>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                    <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                  </SelectTrigger>
                  <SelectContent>
                    {GUIDE_TEMPLATE_PRESETS.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.label}
                        <SelectItemIndicator>
                          <CheckIcon className="size-3.5" aria-hidden="true" />
                        </SelectItemIndicator>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {episode.guide?.modelName && (
                  <span className="text-xs text-[var(--ui-muted-foreground)]">
                    {episode.guide.modelName} · SQLite 已缓存
                  </span>
                )}
              </div>

              <Button
                data-variant={episode.guide ? undefined : "solid"}
                disabled={generatingGuide}
                pendingAnnouncement="正在生成 AI 导读"
                onClick={() => onGenerateGuide(episode.id)}
              >
                <SparklesIcon
                  className={`size-3.5 ${generatingGuide ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>
                  {generatingGuide
                    ? "正在生成导读…"
                    : episode.guide
                      ? "重新生成导读"
                      : "一键生成 AI 导读"}
                </span>
              </Button>
            </div>

            {guideTemplate === "custom" && (
              <div className="border-b border-[var(--ui-border)] bg-[var(--ui-muted)] px-4 py-2.5">
                <Field name="customGuidePrompt">
                  <FieldLabel className="text-xs">自定义导读提示词</FieldLabel>
                  <Textarea
                    rows={2}
                    value={customGuidePrompt}
                    placeholder="例如：重点提炼本期提到的商业模式、增长指标与反常识案例..."
                    onValueChange={onCustomGuidePromptChange}
                  />
                </Field>
              </div>
            )}

            {generatingGuide && !episode.guide ? (
              <div
                role="status"
                className="mx-auto my-12 max-w-md rounded-2xl border border-[var(--arbok-accent-border)] bg-[var(--arbok-accent-soft)] p-6 text-center"
              >
                <SparklesIcon
                  className="mx-auto size-6 animate-pulse text-[var(--arbok-accent-text)]"
                  aria-hidden="true"
                />
                <h2 className="mt-2.5 text-[15px] font-semibold text-[var(--ui-foreground)]">
                  正在生成 AI 导读…
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                  正在提炼全部 {episode.transcript.length} 句文稿的核心观点、章节时间线与必听片段，请稍候（通常需 10–30 秒）。
                </p>
              </div>
            ) : !episode.guide ? (
              <div className="mx-auto my-12 max-w-md rounded-2xl border border-dashed border-[var(--ui-input)] bg-[var(--ui-muted)] p-6 text-center">
                <h2 className="text-[15px] font-semibold text-[var(--ui-foreground)]">
                  尚未生成 AI 导读
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                  选择上方模板后点击「一键生成 AI 导读」，超长文稿将自动采用分段压缩提炼并持久化缓存。
                </p>
              </div>
            ) : (
              <ScrollArea className="arbok-scroll min-h-0 flex-1">
                <ScrollAreaViewport role="region" aria-label="AI 导读内容">
                  <ScrollAreaContent className="flex flex-col gap-6 px-5 py-4 pb-10">
                    <section>
                      <h3 className="mb-2 text-xs font-semibold tracking-wider uppercase text-[var(--ui-muted-foreground)]">
                        一句话总结
                      </h3>
                      <div
                        className="rounded-xl border p-4 text-[13.5px] leading-relaxed text-[var(--ui-foreground)]"
                        style={{
                          background: "var(--arbok-accent-soft)",
                          borderColor: "var(--arbok-accent-border)",
                        }}
                      >
                        {episode.guide.tldr}
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-2 text-xs font-semibold tracking-wider uppercase text-[var(--ui-muted-foreground)]">
                        章节时间线（点击跳转播放）
                      </h3>
                      <div className="flex flex-col gap-1.5">
                        {episode.guide.timeline.map((item) => (
                          <Button
                            key={`${item.start}-${item.title}`}
                            className="arbok-card-button w-full items-start gap-3 border-transparent bg-transparent p-2.5 hover:bg-[var(--ui-muted)]"
                            onClick={() => onSeek(item.start, true)}
                          >
                            <span
                              className="tabular-nums mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
                              style={{
                                color: "var(--arbok-accent-text)",
                                background: "var(--arbok-accent-soft)",
                              }}
                            >
                              {formatTime(item.start)}
                            </span>
                            <span className="flex flex-col gap-0.5">
                              <span className="text-[13px] font-semibold text-[var(--ui-foreground)]">
                                {item.title}
                              </span>
                              <span className="text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                                {item.summary}
                              </span>
                            </span>
                          </Button>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-2 text-xs font-semibold tracking-wider uppercase text-[var(--ui-muted-foreground)]">
                        核心观点
                      </h3>
                      <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-[var(--ui-foreground)]">
                        {episode.guide.takeaways.map((point) => (
                          <li key={point} className="flex items-start gap-2.5">
                            <span
                              className="mt-2 size-1.5 shrink-0 rounded-full"
                              style={{ background: "var(--arbok-accent-text)" }}
                            />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section>
                      <h3 className="mb-2 text-xs font-semibold tracking-wider uppercase text-[var(--ui-muted-foreground)]">
                        先听这几段
                      </h3>
                      <div className="flex flex-col gap-2">
                        {episode.guide.highlights.map((clip) => (
                          <Button
                            key={`${clip.start}-${clip.end}`}
                            className="arbok-card-button w-full justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-3.5 py-3 hover:border-[var(--arbok-accent-border)]"
                            onClick={() => onSeek(clip.start, true)}
                          >
                            <span className="flex flex-col gap-0.5">
                              <span className="text-[13px] font-medium text-[var(--ui-foreground)]">
                                {clip.reason}
                              </span>
                              <span className="tabular-nums text-[11px] text-[var(--ui-muted-foreground)]">
                                {formatTime(clip.start)} — {formatTime(clip.end)}
                              </span>
                            </span>
                            <span
                              className="shrink-0 rounded px-2 py-1 text-xs font-semibold"
                              style={{
                                color: "var(--arbok-accent-text)",
                                background: "var(--arbok-accent-soft)",
                              }}
                            >
                              试听片段
                            </span>
                          </Button>
                        ))}
                      </div>
                    </section>
                  </ScrollAreaContent>
                </ScrollAreaViewport>
                <ScrollAreaScrollbar orientation="vertical">
                  <ScrollAreaThumb />
                </ScrollAreaScrollbar>
              </ScrollArea>
            )}
          </TabsPanel>

          <TabsPanel value="chat" className="flex min-h-0 flex-1 flex-col p-0">
            {episode.chat.length > 0 && (
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--ui-border)] px-4 py-1.5">
                <span className="text-xs text-[var(--ui-muted-foreground)]">
                  对话已持久化至本单集 SQLite 记录
                </span>
                <Button
                  className="h-7 border-transparent bg-transparent text-xs"
                  onClick={() => onClearChat(episode.id)}
                >
                  清空对话记录
                </Button>
              </div>
            )}

            <ScrollArea className="arbok-scroll min-h-0 flex-1">
              <ScrollAreaViewport role="region" aria-label="AI 问答对话记录">
                <ScrollAreaContent className="flex flex-col gap-3 px-4 py-4">
                  {episode.chat.length === 0 && !streamingChatText ? (
                    <div className="mx-auto my-8 max-w-xs text-center">
                      <div className="text-sm font-semibold text-[var(--ui-foreground)]">
                        基于本期全量文稿向 AI 提问
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                        回答流式输出并附带可点击的 [MM:SS] 时间戳引用，点击即可直接跳回原声片段核对。
                      </p>
                    </div>
                  ) : (
                    <>
                      {episode.chat.map((msg) => (
                        <div
                          key={msg.id}
                          className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed select-text ${
                            msg.role === "user"
                              ? "self-end bg-[var(--ui-primary)] text-[var(--ui-primary-foreground)]"
                              : "self-start border border-[var(--ui-border)] bg-[var(--ui-muted)] text-[var(--ui-foreground)]"
                          }`}
                        >
                          {msg.role === "assistant"
                            ? renderChatContent(msg.content)
                            : msg.content}
                        </div>
                      ))}
                      {streamingChatText !== null && (
                        <div className="max-w-[90%] self-start rounded-xl border border-[var(--arbok-accent-border)] bg-[var(--ui-muted)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--ui-foreground)] select-text">
                          {streamingChatText
                            ? renderChatContent(streamingChatText)
                            : "正在检索文稿并思考…"}
                        </div>
                      )}
                    </>
                  )}
                </ScrollAreaContent>
              </ScrollAreaViewport>
              <ScrollAreaScrollbar orientation="vertical">
                <ScrollAreaThumb />
              </ScrollAreaScrollbar>
            </ScrollArea>

            <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-2">
              {QUICK_PROMPTS.map((q) => (
                <Button
                  key={q}
                  className="h-7 rounded-full px-2.5 text-xs"
                  onClick={() => onSendChat(episode.id, q)}
                >
                  {q}
                </Button>
              ))}
            </div>

            <form
              onSubmit={handleChatSubmit}
              className="flex shrink-0 items-center gap-2 border-t border-[var(--ui-border)] px-4 py-3"
            >
              <Field className="flex-1">
                <FieldLabel className="sr-only">向 AI 提问本期内容</FieldLabel>
                <Input
                  value={chatDraft}
                  placeholder="输入关于本期的任何问题，回车发送..."
                  onValueChange={setChatDraft}
                />
              </Field>
              <Button
                type="submit"
                data-variant="solid"
                disabled={streamingChatText !== null}
              >
                <SendIcon className="size-3.5" aria-hidden="true" />
                <span>发送提问</span>
              </Button>
            </form>
          </TabsPanel>

          <TabsPanel value="notes" className="flex min-h-0 flex-1 flex-col p-0">
            <ScrollArea className="arbok-scroll min-h-0 flex-1">
              <ScrollAreaViewport role="region" aria-label="本期笔记列表">
                <ScrollAreaContent className="flex flex-col gap-3 px-4 py-4">
                  {notes.length === 0 ? (
                    <div className="mx-auto my-8 max-w-sm rounded-2xl border border-dashed border-[var(--ui-input)] bg-[var(--ui-muted)] p-6 text-center">
                      <h3 className="text-sm font-semibold text-[var(--ui-foreground)]">
                        本期还没有笔记
                      </h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                        在「字幕」标签页悬停任意句子点击「记笔记」，批注将保存在本地并支持一键导出至 Obsidian。
                      </p>
                    </div>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Button
                            className="tabular-nums h-6 px-2 text-xs font-semibold"
                            style={{
                              color: "var(--arbok-accent-text)",
                              background: "var(--arbok-accent-soft)",
                              borderColor: "var(--arbok-accent-border)",
                            }}
                            onClick={() => onSeek(note.ts, true)}
                          >
                            跳播 {formatTime(note.ts)}
                          </Button>
                          <Button
                            aria-label={`删除 ${formatTime(note.ts)} 的笔记`}
                            className="size-7 border-transparent bg-transparent"
                            onClick={() => onDeleteNote(note.id)}
                          >
                            <Trash2Icon className="size-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                        <blockquote className="my-2 border-l-2 border-[var(--ui-input)] pl-2.5 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                          {note.quote}
                        </blockquote>
                        <p className="text-[13px] leading-relaxed text-[var(--ui-foreground)]">
                          {note.body}
                        </p>
                      </div>
                    ))
                  )}
                </ScrollAreaContent>
              </ScrollAreaViewport>
              <ScrollAreaScrollbar orientation="vertical">
                <ScrollAreaThumb />
              </ScrollAreaScrollbar>
            </ScrollArea>
          </TabsPanel>
        </Tabs>
      </ResizablePanel>
    </Resizable>
  );
}
