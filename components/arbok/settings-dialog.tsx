"use client";

import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog";
import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress";
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
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import {
  BookOpenIcon,
  CaptionsIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloudIcon,
  Code2Icon,
  CpuIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  InfoIcon,
  LaptopIcon,
  LockIcon,
  MessageSquareIcon,
  MicIcon,
  QrCodeIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  TvIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import {
  CLOUD_ASR_PRESETS,
  CLOUD_TTS_PRESETS,
  LLM_PROVIDER_PRESETS,
  LOCAL_AI_CLI_METADATA,
  LOCAL_ASR_MODEL_DESCRIPTIONS,
  SYSTEM_TTS_VOICES,
  getCloudAsrPreset,
  getCloudTtsPreset,
  getDefaultLocalAiCliConfig,
  getLlmPreset,
  isLocalAiProviderId,
} from "@/lib/arbok/providers";
import { UI_LANGUAGE_OPTIONS, getUiCopy } from "@/lib/arbok/i18n";
import { computeOverlayFontPx } from "@/lib/arbok/tts-sync";
import { ArbokLogo } from "./arbok-icons";
import { ProviderIcon } from "./provider-icons";
import type {
  AppSettings,
  AsrEngine,
  EnvDependency,
  KeychainStatus,
  LlmProviderId,
  LocalAiCliConfig,
  LocalAiCliStatus,
  LocalAiProviderId,
  LocalAsrModel,
  LocalCliModelItem,
  LocalModelDownloadState,
  LocalTtsModel,
  StorageUsage,
  SubtitleFontFamily,
  SubtitleMode,
  ThemeMode,
  TtsEngine,
  UiLanguage,
  UpdateCheckResult,
  VideoSubtitleStyle,
} from "./types";

const CACHE_LIMIT_OPTIONS = [
  { value: "1024", label: "1 GB" },
  { value: "2048", label: "2 GB" },
  { value: "5120", label: "5 GB（默认）" },
  { value: "10240", label: "10 GB" },
  { value: "20480", label: "20 GB" },
];

function formatProtectedBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  settings: AppSettings;
  keyStatus: KeychainStatus;
  envDeps: EnvDependency[];
  localAiClis?: LocalAiCliStatus[];
  localModels: LocalAsrModel[];
  asrModelDownloads?: Record<string, LocalModelDownloadState>;
  localTtsModels: LocalTtsModel[];
  cacheUsedMb: number;
  storageUsage?: StorageUsage | null;
  llmApiKeyDraft: string;
  asrApiKeyDraft: string;
  ttsApiKeyDraft: string;
  biliCookieDraft: string;
  llmTestResult: { ok: boolean; message: string } | null;
  biliQr: {
    qrcodeKey: string;
    qrSvg: string;
    status: "waiting" | "scanned" | "expired" | "confirmed";
    message: string;
  } | null;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSubtitleModeChange: (mode: SubtitleMode) => void;
  onLlmApiKeyDraftChange: (value: string) => void;
  onAsrApiKeyDraftChange: (value: string) => void;
  onTtsApiKeyDraftChange: (value: string) => void;
  onBiliCookieDraftChange: (value: string) => void;
  onSaveLlmConfig: (overrides?: {
    provider?: LlmProviderId;
    model?: string;
    baseUrl?: string;
    localAiConfigs?: AppSettings["localAiConfigs"];
  }) => Promise<void>;
  onDeleteLlmKey?: (provider: LlmProviderId) => void;
  onTestLlm: (overrides?: {
    provider?: LlmProviderId;
    model?: string;
    baseUrl?: string;
  }) => Promise<void>;
  onSaveAsrConfig: () => Promise<void>;
  onRefreshLocalModels?: () => Promise<void>;
  onDownloadLocalModel: (modelId: string) => Promise<void>;
  onDeleteLocalModel: (modelId: string) => Promise<void>;
  onSaveTtsConfig: () => Promise<void>;
  onTestTts: () => Promise<void>;
  onDownloadLocalTtsModel: (modelId: string) => Promise<void>;
  onDeleteLocalTtsModel: (modelId: string) => Promise<void>;
  onClearCache: () => void;
  onEnforceCacheLru?: () => void;
  onTestProxy: () => void;
  onStartBiliQr: () => Promise<void>;
  onLogoutBili: () => void;
  onSaveBiliCookie: () => Promise<void>;
  onRefreshEnv: () => Promise<void>;
}

const PROXY_MODES = [
  { value: "system", label: "跟随 macOS 系统代理（推荐）" },
  { value: "custom", label: "自定义 HTTP / SOCKS5 代理" },
  { value: "direct", label: "直连（不使用代理）" },
];

export function SettingsDialog({
  open,
  onOpenChange,
  activeTab,
  onActiveTabChange,
  settings,
  keyStatus,
  envDeps,
  localAiClis = [],
  localModels,
  asrModelDownloads = {},
  localTtsModels,
  cacheUsedMb,
  storageUsage,
  llmApiKeyDraft,
  asrApiKeyDraft,
  ttsApiKeyDraft,
  biliCookieDraft,
  llmTestResult,
  biliQr,
  onUpdateSettings,
  onSubtitleModeChange,
  onLlmApiKeyDraftChange,
  onAsrApiKeyDraftChange,
  onTtsApiKeyDraftChange,
  onBiliCookieDraftChange,
  onSaveLlmConfig,
  onDeleteLlmKey,
  onTestLlm,
  onSaveAsrConfig,
  onRefreshLocalModels,
  onDownloadLocalModel,
  onDeleteLocalModel,
  onSaveTtsConfig,
  onTestTts,
  onDownloadLocalTtsModel,
  onDeleteLocalTtsModel,
  onClearCache,
  onEnforceCacheLru,
  onTestProxy,
  onStartBiliQr,
  onLogoutBili,
  onSaveBiliCookie,
  onRefreshEnv,
}: SettingsDialogProps) {
  const cachePercent = Math.min(
    100,
    Math.round((cacheUsedMb / Math.max(512, settings.cacheLimitMb)) * 100)
  );
  const [selectedLlmProvider, setSelectedLlmProvider] =
    useState<LlmProviderId | null>(null);
  const [apiDraftBaseUrl, setApiDraftBaseUrl] = useState<string | null>(null);
  const [apiDraftModel, setApiDraftModel] = useState<string | null>(null);
  const [customCliModelDraft, setCustomCliModelDraft] = useState("");
  const [refreshingCliModels, setRefreshingCliModels] = useState(false);

  const defaultLlmPreset = getLlmPreset(settings.llmProvider);
  const viewedProviderId = selectedLlmProvider ?? settings.llmProvider;
  const activeLlmPreset = getLlmPreset(viewedProviderId);
  const activeLlmKeyInfo = keyStatus.llmKeys[viewedProviderId];
  const isViewingDefaultProvider = settings.llmProvider === viewedProviderId;
  const viewedBaseUrl = isViewingDefaultProvider
    ? settings.llmBaseUrl
    : (apiDraftBaseUrl ?? activeLlmPreset.baseUrl);
  const viewedModel = isViewingDefaultProvider
    ? settings.llmModel
    : (apiDraftModel ?? activeLlmPreset.defaultModel);

  const activeAsrPreset = getCloudAsrPreset(settings.cloudAsrProvider);
  const activeAsrKeyInfo = keyStatus.asrKeys[settings.cloudAsrProvider];
  const activeTtsPreset = getCloudTtsPreset(settings.cloudTtsProvider);
  const activeTtsKeyInfo = keyStatus.ttsKeys?.[settings.cloudTtsProvider];

  const [showMoreLlmProviders, setShowMoreLlmProviders] = useState(true);
  const [editingLlmKey, setEditingLlmKey] = useState(false);
  const [showLlmAdvanced, setShowLlmAdvanced] = useState(true);
  const [showPerTaskModels, setShowPerTaskModels] = useState(true);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const [showOtherLocalAsr, setShowOtherLocalAsr] = useState(true);
  const [customTtsVoiceMode, setCustomTtsVoiceMode] = useState(false);
  const [showCloudTtsAdvanced, setShowCloudTtsAdvanced] = useState(true);

  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] =
    useState<UpdateCheckResult | null>(null);

  async function handleCheckUpdates() {
    setCheckingUpdate(true);
    try {
      const res = await fetch("/api/updates/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: settings.otaRepo || "luqiming19820311/Arbok1",
        }),
      });
      const data = (await res.json()) as UpdateCheckResult;
      setUpdateCheckResult(data);
    } catch {
      setUpdateCheckResult({
        status: "up-to-date",
        currentVersion: "0.2.0",
        latestVersion: "0.2.0",
        repo: settings.otaRepo || "luqiming19820311/Arbok1",
        message: "已经是最新版本",
      });
    } finally {
      setCheckingUpdate(false);
    }
  }

  const localLlmPresets = LLM_PROVIDER_PRESETS.filter(
    (p) => p.category === "local"
  );
  const featuredLlmPresets = LLM_PROVIDER_PRESETS.filter(
    (p) => p.category === "featured"
  );
  const aggregatorLlmPresets = LLM_PROVIDER_PRESETS.filter(
    (p) => p.category === "aggregator"
  );
  const vendorLlmPresets = LLM_PROVIDER_PRESETS.filter(
    (p) => p.category === "vendor"
  );

  const taskProviderOptions = [
    { value: "default", label: `跟随默认（${defaultLlmPreset.shortName}）` },
    ...LLM_PROVIDER_PRESETS.filter((p) => p.category !== "legacy").map((p) => ({
      value: p.id,
      label: p.shortName,
    })),
  ];

  function getLocalCliStatus(id: LocalAiProviderId): LocalAiCliStatus {
    const found = localAiClis.find((item) => item.id === id);
    if (found) return found;
    const meta = LOCAL_AI_CLI_METADATA[id];
    return {
      id,
      available: true,
      version: meta.defaultVersionLabel,
      vendor: meta.vendor,
      models: [...meta.defaultModels],
    };
  }

  function getLocalCliConfig(id: LocalAiProviderId): LocalAiCliConfig {
    const fallback = getDefaultLocalAiCliConfig(id);
    const saved = settings.localAiConfigs?.[id];
    if (!saved) return fallback;
    return {
      modelMode: saved.modelMode || fallback.modelMode,
      chatModels: Array.isArray(saved.chatModels)
        ? saved.chatModels
        : fallback.chatModels,
      customModels: Array.isArray(saved.customModels) ? saved.customModels : [],
    };
  }

  function updateLocalCliConfig(
    id: LocalAiProviderId,
    updater: (prev: LocalAiCliConfig) => LocalAiCliConfig
  ): AppSettings["localAiConfigs"] {
    const prev = getLocalCliConfig(id);
    const next = updater(prev);
    const nextAll: AppSettings["localAiConfigs"] = {
      ...(settings.localAiConfigs ?? {}),
      [id]: next,
    };
    const patch: Partial<AppSettings> = { localAiConfigs: nextAll };
    if (settings.llmProvider === id) {
      patch.llmModel = next.modelMode;
    }
    onUpdateSettings(patch);
    return nextAll;
  }

  function getMergedCliModels(id: LocalAiProviderId): {
    items: Array<LocalCliModelItem & { isCustom: boolean }>;
  } {
    const status = getLocalCliStatus(id);
    const cfg = getLocalCliConfig(id);
    const seen = new Set<string>();
    const items: Array<LocalCliModelItem & { isCustom: boolean }> = [];
    for (const m of status.models) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      items.push({ ...m, isCustom: false });
    }
    for (const customId of cfg.customModels) {
      if (!customId.trim() || seen.has(customId)) continue;
      seen.add(customId);
      items.push({ id: customId, displayName: customId, isCustom: true });
    }
    return { items };
  }

  async function handleRefreshLocalCliList() {
    setRefreshingCliModels(true);
    try {
      await onRefreshEnv();
    } finally {
      setRefreshingCliModels(false);
    }
  }

  function handleAddCustomCliModel(id: LocalAiProviderId) {
    const trimmed = customCliModelDraft.trim();
    if (!trimmed) return;
    updateLocalCliConfig(id, (prev) => ({
      ...prev,
      customModels: prev.customModels.includes(trimmed)
        ? prev.customModels
        : [...prev.customModels, trimmed],
      chatModels: prev.chatModels.includes(trimmed)
        ? prev.chatModels
        : [...prev.chatModels, trimmed],
    }));
    setCustomCliModelDraft("");
  }

  function handleToggleCliChatModel(
    id: LocalAiProviderId,
    modelId: string,
    checked: boolean
  ) {
    updateLocalCliConfig(id, (prev) => ({
      ...prev,
      chatModels: checked
        ? Array.from(new Set([...prev.chatModels, modelId]))
        : prev.chatModels.filter((m) => m !== modelId),
    }));
  }

  function handleRemoveCustomCliModel(id: LocalAiProviderId, modelId: string) {
    updateLocalCliConfig(id, (prev) => ({
      ...prev,
      modelMode: prev.modelMode === modelId ? "auto" : prev.modelMode,
      customModels: prev.customModels.filter((m) => m !== modelId),
      chatModels: prev.chatModels.filter((m) => m !== modelId),
    }));
  }

  async function handleFetchLlmModelList() {
    setFetchingModels(true);
    try {
      const res = await fetch("/api/settings/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: viewedProviderId,
          baseUrl: viewedBaseUrl,
          apiKey: llmApiKeyDraft.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { models?: string[] };
      if (Array.isArray(data.models) && data.models.length > 0) {
        setFetchedModels(data.models);
      }
    } catch {
      setFetchedModels([activeLlmPreset.defaultModel]);
    } finally {
      setFetchingModels(false);
    }
  }

  function handleSelectLlmProvider(providerId: LlmProviderId) {
    const preset = getLlmPreset(providerId);
    setSelectedLlmProvider(providerId);
    setEditingLlmKey(false);
    setFetchedModels([]);
    setCustomCliModelDraft("");
    if (providerId === settings.llmProvider) {
      setApiDraftBaseUrl(null);
      setApiDraftModel(null);
    } else {
      setApiDraftBaseUrl(preset.baseUrl);
      setApiDraftModel(preset.defaultModel);
    }
  }

  function handleSetDefaultLlmProvider(providerId: LlmProviderId) {
    const preset = getLlmPreset(providerId);
    const nextModel = isLocalAiProviderId(providerId)
      ? getLocalCliConfig(providerId).modelMode
      : providerId === viewedProviderId
        ? viewedModel
        : preset.defaultModel;
    const nextBaseUrl =
      providerId === viewedProviderId ? viewedBaseUrl : preset.baseUrl;
    onUpdateSettings({
      llmProvider: preset.id,
      llmModel: nextModel,
      llmBaseUrl: nextBaseUrl,
    });
    setApiDraftBaseUrl(null);
    setApiDraftModel(null);
  }

  const TTS_SPEED_OPTIONS = [
    { value: "0.8", label: "0.8×" },
    { value: "0.9", label: "0.9×" },
    { value: "1", label: "1×" },
    { value: "1.1", label: "1.1×" },
    { value: "1.25", label: "1.25×" },
    { value: "1.5", label: "1.5×" },
  ];

  const recommendedLocalAsr =
    localModels.find((m) => m.id === "qwen3-asr-0.6b") ?? localModels[0];
  const otherLocalAsrModels = localModels.filter(
    (m) => m.id !== recommendedLocalAsr?.id
  );

  const previewZhPx = computeOverlayFontPx(settings.subtitleZhFontSize, "zh");
  const previewOrigPx = computeOverlayFontPx(
    settings.subtitleOrigFontSize,
    "orig"
  );
  const previewOverlayClass =
    settings.videoSubtitleStyle === "outline"
      ? "arbok-sub-overlay-outline"
      : settings.videoSubtitleStyle === "none"
        ? "arbok-sub-overlay-none"
        : "arbok-sub-overlay-translucent";

  const copy = getUiCopy(settings.uiLanguage);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        shortcut="mod+,"
        className="arbok-nav-button flex-1 justify-between"
      >
        <span className="inline-flex items-center gap-2">
          <SettingsIcon className="size-4" aria-hidden="true" />
          <span>{copy.navSettings}</span>
        </span>
        <DialogShortcut className="text-[11px] opacity-75" />
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="arbok-dialog-fullscreen">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--ui-border)] bg-[var(--arbok-surface)] px-7 py-4">
          <div>
            <DialogTitle className="text-base font-semibold text-[var(--ui-foreground)]">
              {copy.settingsTitle}
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
              {copy.settingsSubtitle}
            </DialogDescription>
          </div>
          <DialogClose aria-label="关闭偏好设置" className="gap-1.5 px-3">
            <XIcon className="size-4" aria-hidden="true" />
            <span className="text-xs">{copy.settingsClose}</span>
          </DialogClose>
        </div>

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(val) => {
            if (val) onActiveTabChange(val);
          }}
          className="arbok-settings-tabs"
        >
          <TabsList aria-label="设置分类">
            <TabsTab value="subtitles">
              <CaptionsIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabSubtitles}</span>
            </TabsTab>
            <TabsTab value="general">
              <SlidersHorizontalIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabGeneral}</span>
            </TabsTab>
            <TabsTab value="network">
              <GlobeIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabNetwork}</span>
            </TabsTab>
            <TabsTab value="bili">
              <TvIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabBili}</span>
            </TabsTab>
            <TabsTab value="llm">
              <SparklesIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabLlm}</span>
            </TabsTab>
            <TabsTab value="asr">
              <MicIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabAsr}</span>
            </TabsTab>
            <TabsTab value="tts">
              <Volume2Icon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabTts}</span>
            </TabsTab>
            <TabsTab value="env">
              <ShieldCheckIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabEnv}</span>
            </TabsTab>
            <TabsTab value="about">
              <InfoIcon className="arbok-tab-icon size-4 shrink-0" aria-hidden="true" />
              <span>{copy.tabAbout}</span>
            </TabsTab>
          </TabsList>

          <TabsPanel value="subtitles">
            <div className="flex flex-col gap-4">
              <div
                aria-label="字幕实时效果预览"
                className="flex min-h-[144px] flex-col items-center justify-center rounded-xl bg-gradient-to-br from-[#181b24] via-[#1f2432] to-[#11131a] px-5 py-5 text-center text-white"
              >
                <div
                  className={`max-w-full ${previewOverlayClass} ${
                    settings.subtitleFontFamily === "lxgw" ? "arbok-font-lxgw" : ""
                  }`}
                >
                  {settings.subtitleDisplayMode === "none" ? (
                    <div className="text-xs text-white/65">
                      已设为「无」，播放画面将不显示字幕
                    </div>
                  ) : (
                    <>
                      {settings.subtitleDisplayMode !== "orig" && previewZhPx > 0 && (
                        <div
                          className="font-semibold leading-[1.32] tracking-[0.015em] text-white antialiased"
                          style={{ fontSize: `${previewZhPx}px` }}
                        >
                          视频，立刻就能看到。
                        </div>
                      )}
                      {settings.subtitleDisplayMode !== "zh" && previewOrigPx > 0 && (
                        <div
                          className="mt-1 leading-[1.38] text-white/90 antialiased"
                          style={{ fontSize: `${previewOrigPx}px` }}
                        >
                          videos right away.
                        </div>
                      )}
                      {((settings.subtitleDisplayMode === "zh" && previewZhPx === 0) ||
                        (settings.subtitleDisplayMode === "orig" && previewOrigPx === 0) ||
                        (previewZhPx === 0 && previewOrigPx === 0)) && (
                        <div className="text-xs text-white/60">
                          当前字号为 0%，字幕文字已隐藏
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <Field className="arbok-field-row">
                <FieldLabel>显示内容</FieldLabel>
                <SegmentedControl
                  aria-label="默认字幕显示内容"
                  value={settings.subtitleDisplayMode}
                  onValueChange={(next) => {
                    if (
                      next === "none" ||
                      next === "bilingual" ||
                      next === "zh" ||
                      next === "orig"
                    ) {
                      onSubtitleModeChange(next);
                      onUpdateSettings({ subtitleDisplayMode: next });
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="none">无</SegmentedControlItem>
                  <SegmentedControlItem value="bilingual">双语</SegmentedControlItem>
                  <SegmentedControlItem value="zh">纯中文</SegmentedControlItem>
                  <SegmentedControlItem value="orig">纯原文</SegmentedControlItem>
                </SegmentedControl>
              </Field>

              <div className="flex flex-col gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-3.5">
                <div className="text-xs font-semibold text-[var(--ui-foreground)]">
                  字号调节（0% – 100%）
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-xs text-[var(--ui-muted-foreground)]">
                    中文
                  </span>
                  <div className="flex-1">
                    <Slider
                      className="arbok-compact-slider"
                      min={0}
                      max={100}
                      step={5}
                      value={settings.subtitleZhFontSize}
                      onValueChange={(next) => {
                        const val = Array.isArray(next) ? next[0] : next;
                        onUpdateSettings({ subtitleZhFontSize: val });
                      }}
                    >
                      <SliderControl>
                        <SliderTrack>
                          <SliderIndicator />
                          <SliderThumb aria-label="中文字幕字号" />
                        </SliderTrack>
                      </SliderControl>
                    </Slider>
                  </div>
                  <span className="tabular-nums w-10 text-right text-xs text-[var(--ui-muted-foreground)]">
                    {settings.subtitleZhFontSize}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-xs text-[var(--ui-muted-foreground)]">
                    原文
                  </span>
                  <div className="flex-1">
                    <Slider
                      className="arbok-compact-slider"
                      min={0}
                      max={100}
                      step={5}
                      value={settings.subtitleOrigFontSize}
                      onValueChange={(next) => {
                        const val = Array.isArray(next) ? next[0] : next;
                        onUpdateSettings({ subtitleOrigFontSize: val });
                      }}
                    >
                      <SliderControl>
                        <SliderTrack>
                          <SliderIndicator />
                          <SliderThumb aria-label="原文字幕字号" />
                        </SliderTrack>
                      </SliderControl>
                    </Slider>
                  </div>
                  <span className="tabular-nums w-10 text-right text-xs text-[var(--ui-muted-foreground)]">
                    {settings.subtitleOrigFontSize}%
                  </span>
                </div>
              </div>

              <Field className="arbok-field-row">
                <div className="flex flex-col gap-0.5">
                  <FieldLabel>字幕字体</FieldLabel>
                  <FieldDescription>字体同时应用于中文与原文两行</FieldDescription>
                </div>
                <SegmentedControl
                  aria-label="字幕字体选择"
                  value={settings.subtitleFontFamily}
                  onValueChange={(next) => {
                    if (next === "system" || next === "lxgw") {
                      onUpdateSettings({
                        subtitleFontFamily: next as SubtitleFontFamily,
                      });
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="system">系统字体</SegmentedControlItem>
                  <SegmentedControlItem value="lxgw">霞鹜文楷</SegmentedControlItem>
                </SegmentedControl>
              </Field>

              <Field className="arbok-field-row">
                <FieldLabel>视频上的字幕样式</FieldLabel>
                <SegmentedControl
                  aria-label="视频字幕样式"
                  value={settings.videoSubtitleStyle}
                  onValueChange={(next) => {
                    if (
                      next === "translucent" ||
                      next === "outline" ||
                      next === "none"
                    ) {
                      onUpdateSettings({
                        videoSubtitleStyle: next as VideoSubtitleStyle,
                      });
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="translucent">半透明底</SegmentedControlItem>
                  <SegmentedControlItem value="outline">描边</SegmentedControlItem>
                  <SegmentedControlItem value="none">无底</SegmentedControlItem>
                </SegmentedControl>
              </Field>

              <Field className="arbok-field-row rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-3.5">
                <div className="flex flex-col gap-0.5">
                  <FieldLabel>画面字幕位置</FieldLabel>
                  <FieldDescription>
                    在视频画面上按住字幕即可自由拖动位置，双击字幕或点击右侧按钮可恢复默认底部居中
                  </FieldDescription>
                </div>
                <Button
                  disabled={
                    (settings.subtitleOverlayX ?? 50) === 50 &&
                    (settings.subtitleOverlayY ?? 84) === 84
                  }
                  onClick={() =>
                    onUpdateSettings({
                      subtitleOverlayX: 50,
                      subtitleOverlayY: 84,
                    })
                  }
                >
                  重置字幕位置
                </Button>
              </Field>

              <Field className="arbok-field-row rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-3.5">
                <div className="flex flex-col gap-0.5">
                  <FieldLabel>音频节目提前显示下一句</FieldLabel>
                  <FieldDescription>
                    在纯音频播客与纯音频模式下，播放器下方同步预告下一句字幕
                  </FieldDescription>
                </div>
                <Switch
                  checked={settings.subtitleShowNextAudioLine}
                  onCheckedChange={(checked) =>
                    onUpdateSettings({ subtitleShowNextAudioLine: checked })
                  }
                >
                  <SwitchThumb />
                </Switch>
              </Field>
            </div>
          </TabsPanel>

          <TabsPanel value="general">
            <div className="flex flex-col gap-5">
              <Field>
                <FieldLabel>{copy.themeLabel}</FieldLabel>
                <SegmentedControl
                  value={settings.theme}
                  onValueChange={(next) => {
                    if (next === "system" || next === "light" || next === "dark") {
                      onUpdateSettings({ theme: next as ThemeMode });
                    }
                  }}
                >
                  <SegmentedControlIndicator />
                  <SegmentedControlItem value="system">{copy.themeSystem}</SegmentedControlItem>
                  <SegmentedControlItem value="light">{copy.themeLight}</SegmentedControlItem>
                  <SegmentedControlItem value="dark">{copy.themeDark}</SegmentedControlItem>
                </SegmentedControl>
              </Field>

              <div className="flex flex-col gap-3.5 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                <div className="text-sm font-semibold text-[var(--ui-foreground)]">
                  {copy.interfaceTitle}
                </div>

                <Field>
                  <FieldLabel className="text-xs text-[var(--ui-muted-foreground)]">
                    {copy.interfaceLangLabel}
                  </FieldLabel>
                  <Select
                    items={UI_LANGUAGE_OPTIONS}
                    value={settings.uiLanguage ?? "system"}
                    onValueChange={(next) => {
                      if (
                        next === "system" ||
                        next === "zh-CN" ||
                        next === "zh-TW" ||
                        next === "en" ||
                        next === "ja"
                      ) {
                        onUpdateSettings({ uiLanguage: next as UiLanguage });
                      }
                    }}
                  >
                    <SelectTrigger aria-label={copy.interfaceLangLabel} className="w-full">
                      <SelectValue />
                      <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                    </SelectTrigger>
                    <SelectContent>
                      {UI_LANGUAGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                          <SelectItemIndicator>
                            <CheckIcon className="size-3.5" aria-hidden="true" />
                          </SelectItemIndicator>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex flex-col gap-2.5 pt-0.5">
                  <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--ui-foreground)] select-none">
                    <Checkbox
                      checked={Boolean(settings.showYoutubeSubscribeButton)}
                      onCheckedChange={(next) =>
                        onUpdateSettings({
                          showYoutubeSubscribeButton: next === true,
                        })
                      }
                      className="arbok-cli-checkbox"
                    >
                      <CheckboxIndicator>
                        <CheckIcon className="size-3" aria-hidden="true" />
                      </CheckboxIndicator>
                    </Checkbox>
                    <span>{copy.showYtSubBtn}</span>
                  </label>

                  <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--ui-foreground)] select-none">
                    <Checkbox
                      checked={settings.showRecommendations ?? true}
                      onCheckedChange={(next) =>
                        onUpdateSettings({
                          showRecommendations: next === true,
                        })
                      }
                      className="arbok-cli-checkbox"
                    >
                      <CheckboxIndicator>
                        <CheckIcon className="size-3" aria-hidden="true" />
                      </CheckboxIndicator>
                    </Checkbox>
                    <span>{copy.showRecs}</span>
                  </label>

                  <div className="flex flex-col gap-1">
                    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-[var(--ui-foreground)] select-none">
                      <Checkbox
                        checked={Boolean(settings.keepOriginalShowNames)}
                        onCheckedChange={(next) =>
                          onUpdateSettings({
                            keepOriginalShowNames: next === true,
                          })
                        }
                        className="arbok-cli-checkbox"
                      >
                        <CheckboxIndicator>
                          <CheckIcon className="size-3" aria-hidden="true" />
                        </CheckboxIndicator>
                      </Checkbox>
                      <span>{copy.keepOrigNames}</span>
                    </label>
                    <p className="pl-6.5 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                      {copy.keepOrigNamesDesc}
                    </p>
                  </div>
                </div>
              </div>

              <Field className="arbok-field-row rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-3.5">
                <div className="flex flex-col gap-0.5">
                  <FieldLabel>{copy.autoPlayNext}</FieldLabel>
                  <FieldDescription>{copy.autoPlayNextDesc}</FieldDescription>
                </div>
                <Switch
                  checked={settings.autoPlayNext}
                  onCheckedChange={(checked) =>
                    onUpdateSettings({ autoPlayNext: checked })
                  }
                >
                  <SwitchThumb />
                </Switch>
              </Field>

              <div className="flex flex-col gap-4 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <Progress value={cachePercent} className="arbok-compact-progress">
                      <div className="flex items-center justify-between text-xs">
                        <ProgressLabel className="font-medium text-[var(--ui-foreground)]">
                          临时流媒体缓存（{cacheUsedMb} MB / {(settings.cacheLimitMb / 1024).toFixed(settings.cacheLimitMb % 1024 === 0 ? 0 : 1)} GB）
                        </ProgressLabel>
                        <ProgressValue className="tabular-nums text-[var(--ui-muted-foreground)]" />
                      </div>
                      <ProgressTrack>
                        <ProgressIndicator />
                      </ProgressTrack>
                    </Progress>
                    <p className="mt-2 text-xs text-[var(--ui-muted-foreground)]">
                      超上限自动按 LRU 清理临时缓存，不会删除手动「离线下载」或「本地导入」的单集文件。
                    </p>
                  </div>
                  <AlertDialog
                    onOpenChange={(next, details) => {
                      if (!next && details.returnValue === "confirm") {
                        onClearCache();
                      }
                    }}
                  >
                    <AlertDialogTrigger>清理临时缓存</AlertDialogTrigger>
                    <AlertDialogBackdrop />
                    <AlertDialogContent>
                      <AlertDialogTitle>确认清空临时缓存？</AlertDialogTitle>
                      <AlertDialogDescription>
                        将删除 {cacheUsedMb} MB 临时流媒体缓冲文件，手动离线下载的单集和笔记均会保留。
                      </AlertDialogDescription>
                      <div className="mt-4 flex justify-end gap-2">
                        <AlertDialogClose>暂不清理</AlertDialogClose>
                        <AlertDialogClose
                          value="confirm"
                          data-variant="solid"
                          data-agent-confirm="清空临时流媒体缓存文件（保留离线下载与笔记）"
                        >
                          确认清空缓存
                        </AlertDialogClose>
                      </div>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] pt-3">
                  <Field className="flex-row items-center gap-2.5">
                    <FieldLabel className="shrink-0 text-xs">临时缓存上限</FieldLabel>
                    <Select
                      items={CACHE_LIMIT_OPTIONS}
                      value={String(settings.cacheLimitMb)}
                      onValueChange={(next) => {
                        if (next) {
                          onUpdateSettings({ cacheLimitMb: Number(next) });
                        }
                      }}
                    >
                      <SelectTrigger className="w-[136px]">
                        <SelectValue />
                        <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                      </SelectTrigger>
                      <SelectContent>
                        {CACHE_LIMIT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                            <SelectItemIndicator>
                              <CheckIcon className="size-3.5" aria-hidden="true" />
                            </SelectItemIndicator>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ui-muted-foreground)]">
                    <span className="tabular-nums">
                      离线下载：{formatProtectedBytes(storageUsage?.offlineBytes)}（{storageUsage?.offlineCount ?? 0} 文件）
                    </span>
                    <span className="tabular-nums">
                      本地导入：{formatProtectedBytes(storageUsage?.localMediaBytes)}
                    </span>
                    {onEnforceCacheLru && (
                      <Button
                        className="h-7 px-2.5 text-xs"
                        onClick={onEnforceCacheLru}
                      >
                        按 LRU 治理缓存
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsPanel>

          <TabsPanel value="network">
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel>代理模式</FieldLabel>
                <Select
                  items={PROXY_MODES}
                  value={settings.proxyMode}
                  onValueChange={(next) => {
                    if (next === "system" || next === "custom" || next === "direct") {
                      onUpdateSettings({ proxyMode: next });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                    <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROXY_MODES.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                        <SelectItemIndicator>
                          <CheckIcon className="size-3.5" aria-hidden="true" />
                        </SelectItemIndicator>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  所有外部请求统一由服务端发出，绕开浏览器 CORS 并一致走代理
                </FieldDescription>
              </Field>

              <Field name="proxyUrl">
                <FieldLabel>自定义代理地址</FieldLabel>
                <Input
                  className="tabular-nums"
                  value={settings.proxyUrl}
                  onValueChange={(proxyUrl) => onUpdateSettings({ proxyUrl })}
                  placeholder="http://127.0.0.1:7890"
                />
              </Field>

              <div>
                <Button onClick={onTestProxy}>测试 YouTube 连通性</Button>
              </div>
            </div>
          </TabsPanel>

          <TabsPanel value="bili">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-4 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                <div className="flex size-32 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-[var(--ui-border)] bg-white p-1.5 text-[#141416]">
                  {settings.biliLoggedIn ? (
                    <div className="text-center">
                      <div className="text-sm font-semibold text-[#15803d]">已登录</div>
                      <div className="mt-1 text-[11px] text-[#52525b]">
                        Keychain 已托管
                      </div>
                    </div>
                  ) : biliQr?.qrSvg ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(biliQr.qrSvg)}`}
                      alt="B站登录二维码"
                      className="size-full object-contain"
                    />
                  ) : (
                    <QrCodeIcon className="size-20" aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--ui-foreground)]">
                    {settings.biliLoggedIn
                      ? "已登录 B站账号"
                      : "打开哔哩哔哩 App 扫一扫登录"}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                    {settings.biliLoggedIn
                      ? "已解锁 1080P+ 高清画质与 B站官方 AI 字幕（BCC）。登录凭证仅加密存于本机 macOS Keychain。"
                      : biliQr?.message ||
                        "解锁 1080P+ 高清画质与 B站官方 AI 字幕（BCC）。点击下方按钮获取实时登录二维码。"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {settings.biliLoggedIn ? (
                      <Button onClick={onLogoutBili}>退出 B站登录</Button>
                    ) : (
                      <Button
                        data-variant="solid"
                        pendingAnnouncement="正在获取 B站登录二维码"
                        onClick={onStartBiliQr}
                      >
                        {biliQr ? "刷新 B站二维码" : "获取 B站登录二维码"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Field name="biliCookie">
                <FieldLabel>备用方案：手动粘贴 B站 SESSDATA</FieldLabel>
                <PasswordInput
                  value={biliCookieDraft}
                  onValueChange={onBiliCookieDraftChange}
                >
                  <PasswordInputControl
                    placeholder={
                      keyStatus.biliCookieConfigured
                        ? "钥匙串已保存 SESSDATA（输入新值可覆盖）"
                        : "粘贴浏览器中的 SESSDATA 值..."
                    }
                  />
                  <PasswordInputToggle aria-label="显示或隐藏 B站 SESSDATA">
                    {(state) =>
                      state.visible ? (
                        <EyeOffIcon className="size-3.5" aria-hidden="true" />
                      ) : (
                        <EyeIcon className="size-3.5" aria-hidden="true" />
                      )
                    }
                  </PasswordInputToggle>
                </PasswordInput>
                <div className="mt-2">
                  <Button onClick={onSaveBiliCookie}>保存 B站 Cookie 到钥匙串</Button>
                </div>
              </Field>
            </div>
          </TabsPanel>

          <TabsPanel value="llm">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--arbok-accent-border)] bg-[var(--arbok-accent-soft)] px-4 py-2.5 text-xs">
                <span className="font-semibold text-[var(--ui-foreground)]">
                  当前：{defaultLlmPreset.shortName}
                </span>
                <span className="text-[var(--ui-muted-foreground)]">
                  · 管问答、导读和翻译
                </span>
              </div>

              <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] md:grid-cols-[232px_1fr]">
                <div className="flex flex-col gap-3 border-b border-[var(--ui-border)] bg-[var(--arbok-sidebar)]/70 p-3 md:border-r md:border-b-0">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between px-1">
                      <div>
                        <div className="text-[11.5px] font-semibold text-[var(--ui-foreground)]">
                          本机 AI
                        </div>
                        <div className="text-[10.5px] text-[var(--ui-muted-foreground)]">
                          用你已有的订阅，不需要 Key
                        </div>
                      </div>
                      <Button
                        aria-label="刷新本机 AI 状态"
                        className="size-6 border-transparent bg-transparent p-0"
                        onClick={handleRefreshLocalCliList}
                      >
                        <RefreshCwIcon
                          className={`size-3 ${refreshingCliModels ? "animate-spin" : ""}`}
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-1">
                      {localLlmPresets.map((p) => {
                        const viewing = viewedProviderId === p.id;
                        const isDefault = settings.llmProvider === p.id;
                        const cliStatus = isLocalAiProviderId(p.id)
                          ? getLocalCliStatus(p.id)
                          : null;
                        const available = cliStatus ? cliStatus.available : true;
                        return (
                          <Button
                            key={p.id}
                            aria-label={`选择 AI 服务商 ${p.shortName}`}
                            data-active={viewing ? "true" : "false"}
                            className="arbok-nav-button arbok-provider-row h-auto py-2"
                            onClick={() => handleSelectLlmProvider(p.id)}
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <ProviderIcon provider={p.id} size="md" />
                              <span className="flex min-w-0 flex-col text-left">
                                <span className="truncate text-xs font-medium text-[var(--ui-foreground)]">
                                  {p.shortName}
                                </span>
                                <span className="text-[10.5px] text-[var(--ui-muted-foreground)]">
                                  {isDefault ? "默认" : available ? "可用" : "未安装"}
                                </span>
                              </span>
                            </span>
                            <span
                              className={`size-2 shrink-0 rounded-full ${
                                available ? "bg-emerald-500" : "bg-[var(--ui-border)]"
                              }`}
                              aria-hidden="true"
                            />
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-[var(--ui-border)] pt-3">
                    <div className="mb-1.5 px-1">
                      <div className="text-[11.5px] font-semibold text-[var(--ui-foreground)]">
                        API 模型
                      </div>
                      <div className="text-[10.5px] text-[var(--ui-muted-foreground)]">
                        填 Key 使用，按量付费
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {featuredLlmPresets.map((p) => {
                        const viewing = viewedProviderId === p.id;
                        const isDefault = settings.llmProvider === p.id;
                        const configured = keyStatus.llmKeys[p.id]?.configured;
                        return (
                          <Button
                            key={p.id}
                            aria-label={`选择 AI 服务商 ${p.shortName}`}
                            data-active={viewing ? "true" : "false"}
                            className="arbok-nav-button arbok-provider-row h-auto py-2"
                            onClick={() => handleSelectLlmProvider(p.id)}
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <ProviderIcon provider={p.id} size="md" />
                              <span className="flex min-w-0 flex-col text-left">
                                <span className="truncate text-xs font-medium text-[var(--ui-foreground)]">
                                  {p.shortName}
                                </span>
                                <span className="text-[10.5px] text-[var(--ui-muted-foreground)]">
                                  {isDefault
                                    ? "默认"
                                    : configured
                                      ? "已配置"
                                      : "未设置"}
                                </span>
                              </span>
                            </span>
                            <span
                              className={`size-2 shrink-0 rounded-full ${
                                configured ? "bg-emerald-500" : "bg-[var(--ui-border)]"
                              }`}
                              aria-hidden="true"
                            />
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      className="mt-2 h-7 w-full justify-start gap-1 border-transparent bg-transparent px-1 text-[11px] text-[var(--ui-muted-foreground)]"
                      onClick={() => setShowMoreLlmProviders((v) => !v)}
                    >
                      {showMoreLlmProviders ? (
                        <ChevronUpIcon className="size-3" aria-hidden="true" />
                      ) : (
                        <ChevronDownIcon className="size-3" aria-hidden="true" />
                      )}
                      <span>{showMoreLlmProviders ? "收起更多服务商" : "展开更多服务商"}</span>
                    </Button>

                    {showMoreLlmProviders && (
                      <div className="mt-1.5 flex flex-col gap-2.5">
                        <div>
                          <div className="mb-1 px-1 text-[10.5px] text-[var(--ui-muted-foreground)]">
                            一个 Key 用多家模型
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {aggregatorLlmPresets.map((p) => {
                              const viewing = viewedProviderId === p.id;
                              const configured = keyStatus.llmKeys[p.id]?.configured;
                              return (
                                <Button
                                  key={p.id}
                                  aria-label={`选择 AI 服务商 ${p.shortName}`}
                                  data-active={viewing ? "true" : "false"}
                                  className="arbok-nav-button arbok-provider-row h-8 px-1.5"
                                  onClick={() => handleSelectLlmProvider(p.id)}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ProviderIcon provider={p.id} size="sm" />
                                    <span className="truncate text-xs">
                                      {p.shortName}
                                    </span>
                                  </span>
                                  {configured && (
                                    <span
                                      className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                                      aria-hidden="true"
                                    />
                                  )}
                                </Button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 px-1 text-[10.5px] text-[var(--ui-muted-foreground)]">
                            模型厂商
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {vendorLlmPresets.map((p) => {
                              const viewing = viewedProviderId === p.id;
                              const configured = keyStatus.llmKeys[p.id]?.configured;
                              return (
                                <Button
                                  key={p.id}
                                  aria-label={`选择 AI 服务商 ${p.shortName}`}
                                  data-active={viewing ? "true" : "false"}
                                  className="arbok-nav-button arbok-provider-row h-8 px-1.5"
                                  onClick={() => handleSelectLlmProvider(p.id)}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ProviderIcon provider={p.id} size="sm" />
                                    <span className="truncate text-xs">
                                      {p.shortName}
                                    </span>
                                  </span>
                                  {configured && (
                                    <span
                                      className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                                      aria-hidden="true"
                                    />
                                  )}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isLocalAiProviderId(viewedProviderId) ? (
                  (() => {
                    const cliId = viewedProviderId;
                    const meta = LOCAL_AI_CLI_METADATA[cliId];
                    const cliStatus = getLocalCliStatus(cliId);
                    const cliConfig = getLocalCliConfig(cliId);
                    const { items: cliModelItems } = getMergedCliModels(cliId);
                    const selectItems = [
                      { value: "auto", label: meta.followSettingLabel },
                      ...cliModelItems.map((m) => ({
                        value: m.id,
                        label:
                          m.displayName !== m.id
                            ? `${m.displayName} (${m.id})`
                            : m.id,
                      })),
                    ];

                    return (
                      <div className="flex flex-col gap-4 p-5">
                        <div className="flex items-start gap-3">
                          <ProviderIcon provider={cliId} size="lg" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-semibold text-[var(--ui-foreground)]">
                                {meta.name}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{
                                  background: cliStatus.available
                                    ? "var(--status-ok-bg)"
                                    : "var(--status-warn-bg)",
                                  color: cliStatus.available
                                    ? "var(--status-ok-fg)"
                                    : "var(--status-warn-fg)",
                                }}
                              >
                                {cliStatus.available ? "可用" : "未安装"}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
                              {cliStatus.vendor} · {cliStatus.version}
                            </p>
                          </div>
                        </div>

                        <p className="text-[13px] leading-relaxed text-[var(--ui-foreground)]/85">
                          {meta.subscriptionNote}
                        </p>

                        <div className="arbok-cli-action-bar">
                          <Button
                            className="arbok-cli-action-btn"
                            pendingAnnouncement={`正在测试 ${meta.name} 连接`}
                            onClick={() =>
                              onTestLlm({
                                provider: cliId,
                                model: cliConfig.modelMode,
                                baseUrl: activeLlmPreset.baseUrl,
                              })
                            }
                          >
                            测试连接
                          </Button>
                          <Button
                            className="arbok-cli-action-btn"
                            data-active={isViewingDefaultProvider ? "true" : "false"}
                            onClick={() => handleSetDefaultLlmProvider(cliId)}
                          >
                            {isViewingDefaultProvider ? "✓ 当前默认模型" : "设为默认模型"}
                          </Button>
                          <Button
                            className="arbok-cli-action-btn"
                            pendingAnnouncement={`正在保存 ${meta.name} 配置`}
                            onClick={() =>
                              onSaveLlmConfig({
                                provider: cliId,
                                model: cliConfig.modelMode,
                                baseUrl: activeLlmPreset.baseUrl,
                                localAiConfigs: {
                                  ...(settings.localAiConfigs ?? {}),
                                  [cliId]: cliConfig,
                                },
                              })
                            }
                          >
                            保存配置
                          </Button>
                        </div>

                        {llmTestResult && (
                          <div
                            role="status"
                            className="rounded-lg border px-3 py-2 text-xs leading-relaxed"
                            style={{
                              color: llmTestResult.ok
                                ? "var(--status-ok-fg)"
                                : "var(--ui-destructive)",
                              background: llmTestResult.ok
                                ? "var(--status-ok-bg)"
                                : "var(--status-warn-bg)",
                              borderColor: "var(--ui-border)",
                            }}
                          >
                            {llmTestResult.message}
                          </div>
                        )}

                        <p className="text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                          本机 AI 每次回答要先启动几秒，Arbok 会让它保持运行，后面会快一些。整集翻译比 API 慢。
                        </p>

                        <div className="flex flex-col gap-3 pt-1">
                          <div className="text-sm font-semibold text-[var(--ui-foreground)]">
                            模型
                          </div>

                          <Select
                            items={selectItems}
                            value={cliConfig.modelMode}
                            onValueChange={(next) => {
                              if (next) {
                                updateLocalCliConfig(cliId, (prev) => ({
                                  ...prev,
                                  modelMode: next,
                                }));
                              }
                            }}
                          >
                            <SelectTrigger
                              aria-label={`${meta.name} 模型选择`}
                              className="w-full max-w-[300px]"
                            >
                              <SelectValue />
                              <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                            </SelectTrigger>
                            <SelectContent>
                              {selectItems.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                  <SelectItemIndicator>
                                    <CheckIcon className="size-3.5" aria-hidden="true" />
                                  </SelectItemIndicator>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs text-[var(--ui-muted-foreground)]">
                              问答里可选的模型
                            </span>
                            <Button
                              className="h-7 gap-1.5 border-transparent bg-transparent px-1.5 text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                              disabled={refreshingCliModels}
                              onClick={handleRefreshLocalCliList}
                            >
                              <RefreshCwIcon
                                className={`size-3.5 ${refreshingCliModels ? "animate-spin" : ""}`}
                                aria-hidden="true"
                              />
                              <span>重新读取</span>
                            </Button>
                          </div>

                          <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-canvas)]/55 p-3.5">
                            {cliModelItems.map((item) => {
                              const checked = cliConfig.chatModels.includes(item.id);
                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 select-none">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(next) =>
                                        handleToggleCliChatModel(
                                          cliId,
                                          item.id,
                                          next === true
                                        )
                                      }
                                      className="arbok-cli-checkbox"
                                    >
                                      <CheckboxIndicator>
                                        <CheckIcon className="size-3" aria-hidden="true" />
                                      </CheckboxIndicator>
                                    </Checkbox>
                                    <span className="truncate text-[13px] font-medium text-[var(--ui-foreground)]">
                                      {item.displayName}
                                    </span>
                                    {item.displayName !== item.id && (
                                      <span className="tabular-nums truncate text-xs text-[var(--ui-muted-foreground)]">
                                        {item.id}
                                      </span>
                                    )}
                                  </label>
                                  {item.isCustom && (
                                    <Button
                                      aria-label={`移除自定义模型 ${item.id}`}
                                      className="size-6 shrink-0 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)]"
                                      onClick={() =>
                                        handleRemoveCustomCliModel(cliId, item.id)
                                      }
                                    >
                                      <XIcon className="size-3" aria-hidden="true" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              aria-label={`手动添加 ${meta.name} 模型名`}
                              className="flex-1"
                              value={customCliModelDraft}
                              onValueChange={setCustomCliModelDraft}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAddCustomCliModel(cliId);
                                }
                              }}
                              placeholder="手动添加模型名"
                            />
                            <Button
                              disabled={!customCliModelDraft.trim()}
                              onClick={() => handleAddCustomCliModel(cliId)}
                            >
                              添加
                            </Button>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <Button
                              pendingAnnouncement={`正在试一下 ${meta.name}`}
                              onClick={() =>
                                onTestLlm({
                                  provider: cliId,
                                  model: cliConfig.modelMode,
                                  baseUrl: activeLlmPreset.baseUrl,
                                })
                              }
                            >
                              试一下
                            </Button>
                            <a
                              href={meta.aboutUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                            >
                              {meta.aboutLabel}
                            </a>
                          </div>
                        </div>

                        <p className="border-t border-[var(--ui-border)] pt-3 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                          {meta.sandboxNote}
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-col gap-4 p-5">
                    <div className="flex items-start gap-3">
                      <ProviderIcon provider={activeLlmPreset.id} size="lg" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--ui-foreground)]">
                          {activeLlmPreset.shortName}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
                          {activeLlmPreset.requiresKey
                            ? "用你自己的 API Key，按用量付费给服务商。Key 只存在本机钥匙串。"
                            : "本机推理服务，数据完全不出本机，无需配置 API Key。"}
                        </p>
                      </div>
                    </div>

                    {activeLlmPreset.requiresKey && (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--ui-foreground)]">
                            API Key
                          </span>
                          {activeLlmPreset.applyUrl && (
                            <a
                              href={activeLlmPreset.applyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                            >
                              <span>去官网申请</span>
                              <ExternalLinkIcon className="size-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>

                        {activeLlmKeyInfo?.configured && !editingLlmKey ? (
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-[var(--status-ok-bg)] px-3 py-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--status-ok-fg)]">
                              <CheckIcon className="size-3.5" aria-hidden="true" />
                              <span>已保存</span>
                              <span className="tabular-nums opacity-85">
                                {activeLlmKeyInfo.masked}
                              </span>
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                className="h-7 px-2.5 text-xs"
                                onClick={() => setEditingLlmKey(true)}
                              >
                                更换
                              </Button>
                              {onDeleteLlmKey && (
                                <Button
                                  aria-label={`删除 ${activeLlmPreset.shortName} 的 API Key`}
                                  className="size-7 p-0 text-[var(--ui-muted-foreground)]"
                                  onClick={() => onDeleteLlmKey(viewedProviderId)}
                                >
                                  <Trash2Icon className="size-3.5" aria-hidden="true" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Field name="llmApiKey">
                                <FieldLabel className="sr-only">模型 API Key</FieldLabel>
                                <PasswordInput
                                  value={llmApiKeyDraft}
                                  onValueChange={onLlmApiKeyDraftChange}
                                >
                                  <PasswordInputControl placeholder="粘贴 API Key (sk-...)" />
                                  <PasswordInputToggle aria-label="显示或隐藏 API Key">
                                    {(state) =>
                                      state.visible ? (
                                        <EyeOffIcon className="size-3.5" aria-hidden="true" />
                                      ) : (
                                        <EyeIcon className="size-3.5" aria-hidden="true" />
                                      )
                                    }
                                  </PasswordInputToggle>
                                </PasswordInput>
                              </Field>
                            </div>
                            <Button
                              data-variant="solid"
                              pendingAnnouncement="正在保存模型配置"
                              onClick={async () => {
                                await onSaveLlmConfig({
                                  provider: viewedProviderId,
                                  model: viewedModel,
                                  baseUrl: viewedBaseUrl,
                                });
                                setEditingLlmKey(false);
                              }}
                            >
                              保存
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {isViewingDefaultProvider ? (
                      <div className="flex items-center gap-2 rounded-lg bg-[var(--arbok-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--arbok-accent-text)]">
                        <CheckIcon className="size-3.5" aria-hidden="true" />
                        <span>当前默认模型</span>
                      </div>
                    ) : (
                      <Button
                        data-variant="solid"
                        className="w-full"
                        onClick={() => handleSetDefaultLlmProvider(viewedProviderId)}
                      >
                        设为默认模型
                      </Button>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Button
                          pendingAnnouncement="正在测试模型连接"
                          onClick={() =>
                            onTestLlm({
                              provider: viewedProviderId,
                              model: viewedModel,
                              baseUrl: viewedBaseUrl,
                            })
                          }
                        >
                          测试连接
                        </Button>
                        {!activeLlmPreset.requiresKey && (
                          <Button
                            data-variant="solid"
                            pendingAnnouncement="正在保存模型配置"
                            onClick={() =>
                              onSaveLlmConfig({
                                provider: viewedProviderId,
                                model: viewedModel,
                                baseUrl: viewedBaseUrl,
                              })
                            }
                          >
                            保存配置
                          </Button>
                        )}
                      </div>
                      <Button
                        className="h-7 gap-1 border-transparent bg-transparent px-2 text-xs text-[var(--ui-muted-foreground)]"
                        onClick={() => setShowLlmAdvanced((v) => !v)}
                      >
                        {showLlmAdvanced ? (
                          <ChevronUpIcon className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                        )}
                        <span>高级设置</span>
                      </Button>
                    </div>

                    {llmTestResult && (
                      <div
                        role="status"
                        className="rounded-lg border px-3 py-2 text-xs leading-relaxed"
                        style={{
                          color: llmTestResult.ok
                            ? "var(--status-ok-fg)"
                            : "var(--ui-destructive)",
                          background: llmTestResult.ok
                            ? "var(--status-ok-bg)"
                            : "var(--status-warn-bg)",
                          borderColor: "var(--ui-border)",
                        }}
                      >
                        {llmTestResult.message}
                      </div>
                    )}

                    {showLlmAdvanced && (
                      <div className="flex flex-col gap-3 border-t border-[var(--ui-border)] pt-3.5">
                        <Field>
                          <FieldLabel>接口类型</FieldLabel>
                          <Input
                            readOnly
                            aria-label="接口类型"
                            value={
                              activeLlmPreset.protocol === "gemini"
                                ? "Google Gemini 原生"
                                : activeLlmPreset.protocol === "claude"
                                  ? "Anthropic Claude 原生"
                                  : "OpenAI 兼容"
                            }
                          />
                        </Field>

                        <Field name="llmBaseUrl">
                          <FieldLabel>接口地址</FieldLabel>
                          <Input
                            className="tabular-nums"
                            value={viewedBaseUrl}
                            onValueChange={(nextUrl) => {
                              if (isViewingDefaultProvider) {
                                onUpdateSettings({ llmBaseUrl: nextUrl });
                              } else {
                                setApiDraftBaseUrl(nextUrl);
                              }
                            }}
                            placeholder={activeLlmPreset.baseUrl}
                          />
                        </Field>

                        <Field name="llmModel">
                          <FieldLabel>模型</FieldLabel>
                          <Input
                            className="tabular-nums"
                            value={viewedModel}
                            onValueChange={(nextModel) => {
                              if (isViewingDefaultProvider) {
                                onUpdateSettings({ llmModel: nextModel });
                              } else {
                                setApiDraftModel(nextModel);
                              }
                            }}
                            placeholder={activeLlmPreset.defaultModel}
                          />
                        </Field>

                        <div className="flex flex-col gap-2">
                          <div>
                            <Button
                              className="h-7 gap-1.5 border-transparent bg-transparent px-1 text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                              disabled={fetchingModels}
                              onClick={handleFetchLlmModelList}
                            >
                              <RefreshCwIcon
                                className={`size-3.5 ${fetchingModels ? "animate-spin" : ""}`}
                                aria-hidden="true"
                              />
                              <span>
                                {fetchingModels ? "正在获取模型列表…" : "获取模型列表"}
                              </span>
                            </Button>
                          </div>
                          {fetchedModels.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {fetchedModels.slice(0, 12).map((modelName) => (
                                <Button
                                  key={modelName}
                                  data-variant={
                                    viewedModel === modelName ? "solid" : undefined
                                  }
                                  className="h-6 rounded-full px-2.5 text-[11px]"
                                  onClick={() => {
                                    if (isViewingDefaultProvider) {
                                      onUpdateSettings({ llmModel: modelName });
                                    } else {
                                      setApiDraftModel(modelName);
                                    }
                                  }}
                                >
                                  {modelName}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  className="h-7 w-fit gap-1 border-transparent bg-transparent px-1 text-xs text-[var(--ui-muted-foreground)]"
                  onClick={() => setShowPerTaskModels((v) => !v)}
                >
                  {showPerTaskModels ? (
                    <ChevronUpIcon className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                  )}
                  <span>问答和翻译分别用不同模型</span>
                </Button>

                {showPerTaskModels && (
                  <div className="flex flex-col gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                    <Field className="arbok-field-row">
                      <FieldLabel>问答和导读</FieldLabel>
                      <Select
                        items={taskProviderOptions}
                        value={settings.llmGuideProvider ?? "default"}
                        onValueChange={(next) => {
                          if (next) {
                            onUpdateSettings({
                              llmGuideProvider: next as LlmProviderId | "default",
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[210px]">
                          <SelectValue />
                          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                        </SelectTrigger>
                        <SelectContent>
                          {taskProviderOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                              <SelectItemIndicator>
                                <CheckIcon className="size-3.5" aria-hidden="true" />
                              </SelectItemIndicator>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field className="arbok-field-row">
                      <FieldLabel>字幕翻译</FieldLabel>
                      <Select
                        items={taskProviderOptions}
                        value={settings.llmTranslateProvider ?? "default"}
                        onValueChange={(next) => {
                          if (next) {
                            onUpdateSettings({
                              llmTranslateProvider: next as LlmProviderId | "default",
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[210px]">
                          <SelectValue />
                          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                        </SelectTrigger>
                        <SelectContent>
                          {taskProviderOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                              <SelectItemIndicator>
                                <CheckIcon className="size-3.5" aria-hidden="true" />
                              </SelectItemIndicator>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field className="arbok-field-row">
                      <div className="flex flex-col gap-0.5">
                        <FieldLabel>翻译方式</FieldLabel>
                        <FieldDescription>
                          {(settings.translationStyle ?? "fast") === "fast"
                            ? "一遍翻完，最快。"
                            : "结合上下文二次润色，译文更自然。"}
                        </FieldDescription>
                      </div>
                      <SegmentedControl
                        aria-label="翻译方式"
                        value={settings.translationStyle ?? "fast"}
                        onValueChange={(next) => {
                          if (next === "fast" || next === "refined") {
                            onUpdateSettings({ translationStyle: next });
                          }
                        }}
                      >
                        <SegmentedControlIndicator />
                        <SegmentedControlItem value="fast">快速</SegmentedControlItem>
                        <SegmentedControlItem value="refined">精翻</SegmentedControlItem>
                      </SegmentedControl>
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </TabsPanel>

          <TabsPanel value="asr">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ui-foreground)]">
                  如果没有字幕时
                </h3>
                <p className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
                  先查节目自带的官方字幕，都没有时才转写。
                </p>
              </div>

              <div
                role="group"
                aria-label="语音转写引擎"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <Button
                  aria-label="本机模型（免费，音频不出本机）"
                  aria-pressed={settings.asrEngine === "local"}
                  data-active={settings.asrEngine === "local" ? "true" : "false"}
                  className={`arbok-card-button h-auto flex-col items-start gap-1 rounded-xl border p-3.5 ${
                    settings.asrEngine === "local"
                      ? "border-[var(--ui-foreground)] bg-[var(--ui-muted)]"
                      : "border-[var(--ui-border)] bg-[var(--arbok-surface)]"
                  }`}
                  onClick={() => onUpdateSettings({ asrEngine: "local" as AsrEngine })}
                >
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--ui-foreground)]">
                    <CpuIcon className="size-4" aria-hidden="true" />
                    <span>本机模型</span>
                  </span>
                  <span className="text-[11.5px] text-[var(--ui-muted-foreground)]">
                    免费，音频不出本机
                  </span>
                </Button>

                <Button
                  aria-label="云端服务（更快，需要 Key，按量付费）"
                  aria-pressed={settings.asrEngine === "cloud"}
                  data-active={settings.asrEngine === "cloud" ? "true" : "false"}
                  className={`arbok-card-button h-auto flex-col items-start gap-1 rounded-xl border p-3.5 ${
                    settings.asrEngine === "cloud"
                      ? "border-[var(--ui-foreground)] bg-[var(--ui-muted)]"
                      : "border-[var(--ui-border)] bg-[var(--arbok-surface)]"
                  }`}
                  onClick={() => onUpdateSettings({ asrEngine: "cloud" as AsrEngine })}
                >
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--ui-foreground)]">
                    <CloudIcon className="size-4" aria-hidden="true" />
                    <span>云端服务</span>
                  </span>
                  <span className="text-[11.5px] text-[var(--ui-muted-foreground)]">
                    更快，需要 Key，按量付费
                  </span>
                </Button>
              </div>

              {settings.asrEngine === "local" ? (
                <div className="flex flex-col gap-3">
                  {recommendedLocalAsr &&
                    (() => {
                      const model = recommendedLocalAsr;
                      const isSelected = settings.localAsrModelId === model.id;
                      const dl = asrModelDownloads[model.id];
                      const isDownloading = dl?.status === "downloading";
                      const pct = isDownloading
                        ? Math.max(0, Math.min(100, dl.progress))
                        : 0;
                      const downloadedLabel =
                        isDownloading && dl.downloadedBytes > 0
                          ? `${formatProtectedBytes(dl.downloadedBytes)}${
                              dl.totalBytes > 0
                                ? ` / ${formatProtectedBytes(dl.totalBytes)}`
                                : ""
                            }`
                          : null;
                      return (
                        <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--ui-foreground)]/35 bg-[var(--ui-muted)]/60 p-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <Button
                              aria-label={`选择推荐本地模型 ${model.name}`}
                              className="arbok-card-button min-w-0 flex-1 items-start gap-2.5 border-transparent bg-transparent p-0 hover:bg-transparent"
                              onClick={() =>
                                onUpdateSettings({ localAsrModelId: model.id })
                              }
                            >
                              <span
                                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                                  isSelected
                                    ? "border-[var(--ui-foreground)] bg-[var(--ui-foreground)]"
                                    : "border-[var(--ui-input)]"
                                }`}
                                aria-hidden="true"
                              >
                                {isSelected && (
                                  <span className="size-1.5 rounded-full bg-[var(--ui-background)]" />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-semibold text-[var(--ui-foreground)]">
                                  {model.name}
                                </span>
                                <span className="mt-0.5 block text-[11.5px] text-[var(--ui-muted-foreground)]">
                                  {isDownloading
                                    ? `正在下载 ${pct}%${downloadedLabel ? `（${downloadedLabel}）` : ""}`
                                    : LOCAL_ASR_MODEL_DESCRIPTIONS[model.id] ??
                                      `${model.engine} · ${model.sizeLabel}`}
                                </span>
                              </span>
                            </Button>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {model.installed ? (
                                <>
                                  <span className="rounded-md bg-[var(--status-ok-bg)] px-2 py-1 text-[11px] font-medium text-[var(--status-ok-fg)]">
                                    已下载
                                  </span>
                                  <Button
                                    aria-label={`删除本地模型 ${model.name}`}
                                    className="size-7 p-0"
                                    onClick={() => onDeleteLocalModel(model.id)}
                                  >
                                    <Trash2Icon className="size-3.5" aria-hidden="true" />
                                  </Button>
                                </>
                              ) : isDownloading ? (
                                <Button
                                  disabled
                                  className="tabular-nums h-8 px-3 text-xs"
                                  aria-label={`正在下载 ${model.name}，进度 ${pct}%`}
                                >
                                  下载中 {pct}%
                                </Button>
                              ) : (
                                <Button
                                  className="h-8 px-3 text-xs"
                                  pendingAnnouncement={`正在启动下载 ${model.name}`}
                                  onClick={() => onDownloadLocalModel(model.id)}
                                >
                                  下载
                                </Button>
                              )}
                            </div>
                          </div>

                          {isDownloading && (
                            <Progress value={pct} className="arbok-compact-progress">
                              <div className="flex items-center justify-between text-[11px] text-[var(--ui-muted-foreground)]">
                                <ProgressLabel>
                                  {downloadedLabel ?? "正在连接模型源…"}
                                </ProgressLabel>
                                <ProgressValue className="tabular-nums font-medium text-[var(--arbok-accent-text)]" />
                              </div>
                              <ProgressTrack>
                                <ProgressIndicator />
                              </ProgressTrack>
                            </Progress>
                          )}
                        </div>
                      );
                    })()}

                  <Button
                    className="h-7 w-fit gap-1 border-transparent bg-transparent px-1 text-xs text-[var(--ui-muted-foreground)]"
                    onClick={() => setShowOtherLocalAsr((v) => !v)}
                  >
                    {showOtherLocalAsr ? (
                      <ChevronUpIcon className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                    )}
                    <span>其他模型</span>
                  </Button>

                  {showOtherLocalAsr && (
                    <div className="flex flex-col gap-2">
                      {otherLocalAsrModels.map((model) => {
                        const isSelected = settings.localAsrModelId === model.id;
                        const dl = asrModelDownloads[model.id];
                        const isDownloading = dl?.status === "downloading";
                        const pct = isDownloading
                          ? Math.max(0, Math.min(100, dl.progress))
                          : 0;
                        const downloadedLabel =
                          isDownloading && dl.downloadedBytes > 0
                            ? `${formatProtectedBytes(dl.downloadedBytes)}${
                                dl.totalBytes > 0
                                  ? ` / ${formatProtectedBytes(dl.totalBytes)}`
                                  : ""
                              }`
                            : null;
                        return (
                          <div
                            key={model.id}
                            className="flex flex-col gap-2 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-3.5 py-2.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <Button
                                aria-label={`选择本地模型 ${model.name}`}
                                className="arbok-card-button min-w-0 flex-1 items-start gap-2.5 border-transparent bg-transparent p-0 hover:bg-transparent"
                                onClick={() =>
                                  onUpdateSettings({ localAsrModelId: model.id })
                                }
                              >
                                <span
                                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                                    isSelected
                                      ? "border-[var(--ui-foreground)] bg-[var(--ui-foreground)]"
                                      : "border-[var(--ui-input)]"
                                  }`}
                                  aria-hidden="true"
                                >
                                  {isSelected && (
                                    <span className="size-1.5 rounded-full bg-[var(--ui-background)]" />
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[13px] font-semibold text-[var(--ui-foreground)]">
                                    {model.name}
                                  </span>
                                  <span className="mt-0.5 block text-[11.5px] text-[var(--ui-muted-foreground)]">
                                    {isDownloading
                                      ? `正在下载 ${pct}%${downloadedLabel ? `（${downloadedLabel}）` : ""}`
                                      : LOCAL_ASR_MODEL_DESCRIPTIONS[model.id] ??
                                        `${model.engine} · ${model.sizeLabel}`}
                                  </span>
                                </span>
                              </Button>

                              <div className="flex shrink-0 items-center gap-1.5">
                                {model.installed ? (
                                  <>
                                    <span className="rounded-md bg-[var(--status-ok-bg)] px-2 py-1 text-[11px] font-medium text-[var(--status-ok-fg)]">
                                      已下载
                                    </span>
                                    <Button
                                      aria-label={`删除本地模型 ${model.name}`}
                                      className="size-7 p-0"
                                      onClick={() => onDeleteLocalModel(model.id)}
                                    >
                                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                                    </Button>
                                  </>
                                ) : isDownloading ? (
                                  <Button
                                    disabled
                                    className="tabular-nums h-8 px-3 text-xs"
                                    aria-label={`正在下载 ${model.name}，进度 ${pct}%`}
                                  >
                                    下载中 {pct}%
                                  </Button>
                                ) : (
                                  <Button
                                    className="h-8 px-3 text-xs"
                                    pendingAnnouncement={`正在启动下载 ${model.name}`}
                                    onClick={() => onDownloadLocalModel(model.id)}
                                  >
                                    下载
                                  </Button>
                                )}
                              </div>
                            </div>
                            {isDownloading && (
                              <Progress value={pct} className="arbok-compact-progress">
                                <div className="flex items-center justify-between text-[11px] text-[var(--ui-muted-foreground)]">
                                  <ProgressLabel>
                                    {downloadedLabel ?? "正在连接模型源…"}
                                  </ProgressLabel>
                                  <ProgressValue className="tabular-nums font-medium text-[var(--arbok-accent-text)]" />
                                </div>
                                <ProgressTrack>
                                  <ProgressIndicator />
                                </ProgressTrack>
                              </Progress>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {onRefreshLocalModels && (
                    <div>
                      <Button
                        className="h-7 gap-1.5 border-transparent bg-transparent px-1 text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                        onClick={onRefreshLocalModels}
                      >
                        <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                        <span>重新查找本机已有的模型</span>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div
                    role="group"
                    aria-label="云端 ASR 服务商"
                    className="flex flex-wrap gap-2"
                  >
                    {CLOUD_ASR_PRESETS.map((preset) => {
                      const active = settings.cloudAsrProvider === preset.id;
                      return (
                        <Button
                          key={preset.id}
                          aria-pressed={active}
                          data-variant={active ? "solid" : undefined}
                          className="h-8 rounded-full px-3.5 text-xs"
                          onClick={() =>
                            onUpdateSettings({
                              cloudAsrProvider: preset.id,
                              cloudAsrBaseUrl: preset.endpoint,
                              cloudAsrModel: preset.defaultModel,
                            })
                          }
                        >
                          {preset.pillLabel}
                        </Button>
                      );
                    })}
                  </div>

                  <p className="text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                    {activeAsrPreset.description}
                  </p>

                  <div className="flex flex-col gap-3.5 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                    <Field name="cloudAsrBaseUrl">
                      <FieldLabel>接口地址</FieldLabel>
                      <Input
                        className="tabular-nums"
                        value={settings.cloudAsrBaseUrl || activeAsrPreset.endpoint}
                        onValueChange={(cloudAsrBaseUrl) =>
                          onUpdateSettings({ cloudAsrBaseUrl })
                        }
                        placeholder={activeAsrPreset.endpoint}
                      />
                    </Field>

                    <Field name="cloudAsrModel">
                      <FieldLabel>模型</FieldLabel>
                      <Input
                        className="tabular-nums"
                        value={settings.cloudAsrModel}
                        onValueChange={(cloudAsrModel) =>
                          onUpdateSettings({ cloudAsrModel })
                        }
                        placeholder={activeAsrPreset.defaultModel}
                      />
                    </Field>

                    <Field name="cloudAsrApiKey">
                      <div className="flex items-center justify-between">
                        <FieldLabel>API Key</FieldLabel>
                        {activeAsrPreset.applyUrl && (
                          <a
                            href={activeAsrPreset.applyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                          >
                            <ExternalLinkIcon className="size-3" aria-hidden="true" />
                            <span>获取 Key</span>
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <PasswordInput
                            value={asrApiKeyDraft}
                            onValueChange={onAsrApiKeyDraftChange}
                          >
                            <PasswordInputControl
                              placeholder={
                                activeAsrPreset.requiresKey === false
                                  ? "本机服务无需 Key（可留空）"
                                  : activeAsrKeyInfo?.configured
                                    ? `已保存 ${activeAsrKeyInfo.masked}（输入新值覆盖）`
                                    : "粘贴 API Key"
                              }
                            />
                            <PasswordInputToggle aria-label="显示或隐藏云端 ASR API Key">
                              {(state) =>
                                state.visible ? (
                                  <EyeOffIcon className="size-3.5" aria-hidden="true" />
                                ) : (
                                  <EyeIcon className="size-3.5" aria-hidden="true" />
                                )
                              }
                            </PasswordInputToggle>
                          </PasswordInput>
                        </div>
                        <Button
                          data-variant="solid"
                          pendingAnnouncement="正在保存 ASR 配置"
                          onClick={onSaveAsrConfig}
                        >
                          保存
                        </Button>
                      </div>
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </TabsPanel>

          <TabsPanel value="tts">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ui-foreground)]">
                  朗读引擎
                </h3>
                <p className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
                  用于精读和字幕中文翻译的朗读。
                </p>
              </div>

              <div
                role="group"
                aria-label="语音播报引擎"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <Button
                  aria-label="本地语音（系统增强语音，离线合成不出本机）"
                  aria-pressed={settings.ttsEngine === "local"}
                  data-active={settings.ttsEngine === "local" ? "true" : "false"}
                  className={`arbok-card-button h-auto flex-col items-start gap-1 rounded-xl border p-3.5 ${
                    settings.ttsEngine === "local"
                      ? "border-[var(--ui-foreground)] bg-[var(--ui-muted)]"
                      : "border-[var(--ui-border)] bg-[var(--arbok-surface)]"
                  }`}
                  onClick={() =>
                    onUpdateSettings({
                      ttsEngine: "local" as TtsEngine,
                      localTtsModelId: "system-enhanced",
                    })
                  }
                >
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--ui-foreground)]">
                    <LaptopIcon className="size-4" aria-hidden="true" />
                    <span>本地语音</span>
                  </span>
                  <span className="text-[11.5px] text-[var(--ui-muted-foreground)]">
                    优先系统增强语音，开箱即用不出本机
                  </span>
                </Button>

                <Button
                  aria-label="云端服务（豆包、DeepSeek、MiMo、通义、OpenAI、Edge 等）"
                  aria-pressed={settings.ttsEngine === "cloud"}
                  data-active={settings.ttsEngine === "cloud" ? "true" : "false"}
                  className={`arbok-card-button h-auto flex-col items-start gap-1 rounded-xl border p-3.5 ${
                    settings.ttsEngine === "cloud"
                      ? "border-[var(--ui-foreground)] bg-[var(--ui-muted)]"
                      : "border-[var(--ui-border)] bg-[var(--arbok-surface)]"
                  }`}
                  onClick={() => onUpdateSettings({ ttsEngine: "cloud" as TtsEngine })}
                >
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--ui-foreground)]">
                    <CloudIcon className="size-4" aria-hidden="true" />
                    <span>云端服务</span>
                  </span>
                  <span className="text-[11.5px] text-[var(--ui-muted-foreground)]">
                    豆包、通义、MiniMax、硅基流动、阶跃、ElevenLabs、Edge 等
                  </span>
                </Button>
              </div>

              {settings.ttsEngine === "local" ? (
                (() => {
                  const selectedLocalModelId =
                    settings.localTtsModelId || "system-enhanced";
                  const selectedLocalCatalog = localTtsModels.find(
                    (m) => m.id === selectedLocalModelId
                  );
                  const activeLocalVoices =
                    selectedLocalModelId === "system-enhanced"
                      ? SYSTEM_TTS_VOICES
                      : (selectedLocalCatalog?.voices ?? []);

                  return (
                    <div className="flex flex-col gap-4 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--ui-foreground)]">
                          本地语音模型（共 {localTtsModels.length + 1} 个）
                        </span>
                        <Button
                          className="h-7 gap-1 border-transparent bg-transparent px-2 text-xs"
                          pendingAnnouncement="正在合成试听语音"
                          onClick={onTestTts}
                        >
                          <Volume2Icon className="size-3.5" aria-hidden="true" />
                          <span>试听</span>
                        </Button>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          aria-label="选择本地语音模型 系统增强语音"
                          aria-pressed={selectedLocalModelId === "system-enhanced"}
                          className={`arbok-card-button h-auto w-full flex-col items-start gap-1 rounded-xl border p-3.5 text-left ${
                            selectedLocalModelId === "system-enhanced"
                              ? "border-[var(--ui-foreground)] bg-[var(--arbok-canvas)]"
                              : "border-[var(--ui-border)] bg-[var(--arbok-canvas)]/45"
                          }`}
                          onClick={() =>
                            onUpdateSettings({
                              localTtsModelId: "system-enhanced",
                              localTtsVoice:
                                SYSTEM_TTS_VOICES.some(
                                  (v) => v.value === settings.localTtsVoice
                                )
                                  ? settings.localTtsVoice
                                  : "Tingting",
                            })
                          }
                        >
                          <div className="flex w-full items-center justify-between gap-2">
                            <span className="text-[13px] font-semibold text-[var(--ui-foreground)]">
                              macOS 系统增强语音（内置 · 开箱即用）
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--status-ok-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-ok-fg)]">
                              <CheckIcon className="size-3" aria-hidden="true" />
                              <span>系统自带</span>
                            </span>
                          </div>
                          <span className="text-xs text-[var(--ui-muted-foreground)]">
                            零配置离线合成，支持普通话、台湾、粤语、英语、日语共 {SYSTEM_TTS_VOICES.length} 种系统音色
                          </span>
                        </Button>

                        {localTtsModels.map((model) => {
                          const isSelected = selectedLocalModelId === model.id;
                          return (
                            <div
                              key={model.id}
                              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                                isSelected
                                  ? "border-[var(--ui-foreground)] bg-[var(--arbok-canvas)]"
                                  : "border-[var(--ui-border)] bg-[var(--arbok-canvas)]/45"
                              }`}
                            >
                              <Button
                                aria-label={`选择本地语音模型 ${model.name}`}
                                className="arbok-card-button min-w-0 flex-1 items-start gap-2.5 border-transparent bg-transparent p-0 text-left hover:bg-transparent"
                                onClick={() =>
                                  onUpdateSettings({
                                    localTtsModelId: model.id,
                                    ...(model.defaultBaseUrl
                                      ? { localTtsBaseUrl: model.defaultBaseUrl }
                                      : {}),
                                    ...(model.voices?.[0]
                                      ? { localTtsVoice: model.voices[0].value }
                                      : {}),
                                  })
                                }
                              >
                                <span
                                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                                    isSelected
                                      ? "border-[var(--ui-foreground)] bg-[var(--ui-foreground)]"
                                      : "border-[var(--ui-input)]"
                                  }`}
                                  aria-hidden="true"
                                >
                                  {isSelected && (
                                    <span className="size-1.5 rounded-full bg-[var(--ui-background)]" />
                                  )}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate text-[13px] font-semibold text-[var(--ui-foreground)]">
                                    {model.name}
                                  </span>
                                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ui-muted-foreground)]">
                                    {model.description} · {model.sizeLabel}
                                  </span>
                                </span>
                              </Button>

                              <div className="flex shrink-0 items-center gap-1.5">
                                {model.installed ? (
                                  <>
                                    <span className="rounded-md bg-[var(--status-ok-bg)] px-2 py-1 text-[11px] font-medium text-[var(--status-ok-fg)]">
                                      已下载
                                    </span>
                                    <Button
                                      aria-label={`删除本地语音模型 ${model.name}`}
                                      className="size-7 p-0"
                                      onClick={() => onDeleteLocalTtsModel(model.id)}
                                    >
                                      <Trash2Icon className="size-3.5" aria-hidden="true" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    className="h-8 px-3 text-xs"
                                    pendingAnnouncement={`正在下载 ${model.name}`}
                                    onClick={() => onDownloadLocalTtsModel(model.id)}
                                  >
                                    下载
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {activeLocalVoices.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold text-[var(--ui-foreground)]">
                            音色
                          </span>
                          <div
                            role="group"
                            aria-label="本地语音音色"
                            className="flex flex-wrap gap-2"
                          >
                            {activeLocalVoices.map((voice) => {
                              const active =
                                (settings.localTtsVoice ||
                                  activeLocalVoices[0].value) === voice.value;
                              return (
                                <Button
                                  key={voice.value}
                                  aria-pressed={active}
                                  data-variant={active ? "solid" : undefined}
                                  className="h-8 rounded-full px-3.5 text-xs"
                                  onClick={() =>
                                    onUpdateSettings({
                                      localTtsVoice: voice.value,
                                    })
                                  }
                                >
                                  {voice.label}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selectedLocalModelId !== "system-enhanced" && (
                        <Field name="localTtsBaseUrl">
                          <FieldLabel>本地语音推理服务地址 (OpenAI 兼容)</FieldLabel>
                          <Input
                            className="tabular-nums"
                            value={
                              settings.localTtsBaseUrl ||
                              selectedLocalCatalog?.defaultBaseUrl ||
                              "http://127.0.0.1:8000/v1"
                            }
                            onValueChange={(localTtsBaseUrl) =>
                              onUpdateSettings({ localTtsBaseUrl })
                            }
                            placeholder={
                              selectedLocalCatalog?.defaultBaseUrl ||
                              "http://127.0.0.1:8000/v1"
                            }
                          />
                          <FieldDescription>
                            启动 Kokoro-FastAPI / CosyVoice / ChatTTS / Fish Speech / MiMo 本地服务后即可离线调用
                          </FieldDescription>
                        </Field>
                      )}

                      <p className="inline-flex items-center gap-1.5 text-xs text-[var(--ui-muted-foreground)]">
                        <LockIcon className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>完全在本机离线合成，文字不会离开你的电脑。</span>
                      </p>
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col gap-4">
                  <div
                    role="group"
                    aria-label="云端 TTS 服务商"
                    className="flex flex-wrap gap-2"
                  >
                    {CLOUD_TTS_PRESETS.map((preset) => {
                      const active = settings.cloudTtsProvider === preset.id;
                      return (
                        <Button
                          key={preset.id}
                          aria-pressed={active}
                          data-variant={active ? "solid" : undefined}
                          className="h-8 rounded-full px-3.5 text-xs"
                          onClick={() => {
                            setCustomTtsVoiceMode(false);
                            onUpdateSettings({
                              cloudTtsProvider: preset.id,
                              cloudTtsBaseUrl: preset.baseUrl,
                              cloudTtsModel: preset.defaultModel,
                              cloudTtsVoice: preset.voices[0].value,
                            });
                          }}
                        >
                          {preset.pillLabel}
                        </Button>
                      );
                    })}
                  </div>

                  <p className="text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                    {activeTtsPreset.description}
                  </p>

                  <div className="flex flex-col gap-4 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--ui-foreground)]">
                          音色
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            className="h-7 border-transparent bg-transparent px-2 text-xs text-[var(--ui-muted-foreground)]"
                            onClick={() => setCustomTtsVoiceMode((v) => !v)}
                          >
                            {customTtsVoiceMode ? "预设音色" : "自定义音色"}
                          </Button>
                          <Button
                            className="h-7 gap-1 border-transparent bg-transparent px-2 text-xs"
                            pendingAnnouncement="正在合成试听语音"
                            onClick={onTestTts}
                          >
                            <Volume2Icon className="size-3.5" aria-hidden="true" />
                            <span>试听</span>
                          </Button>
                        </div>
                      </div>

                      {customTtsVoiceMode ? (
                        <Field name="customCloudTtsVoice">
                          <FieldLabel className="sr-only">自定义音色 ID</FieldLabel>
                          <Input
                            value={settings.cloudTtsVoice}
                            onValueChange={(cloudTtsVoice) =>
                              onUpdateSettings({ cloudTtsVoice })
                            }
                            placeholder="输入自定义音色 ID 或名称"
                          />
                        </Field>
                      ) : (
                        <div
                          role="group"
                          aria-label="云端 TTS 音色"
                          className="flex flex-wrap gap-2"
                        >
                          {activeTtsPreset.voices.map((v) => {
                            const active = settings.cloudTtsVoice === v.value;
                            return (
                              <Button
                                key={v.value}
                                aria-pressed={active}
                                data-variant={active ? "solid" : undefined}
                                className="h-8 rounded-full px-3 text-xs"
                                onClick={() =>
                                  onUpdateSettings({ cloudTtsVoice: v.value })
                                }
                              >
                                {v.label}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {activeTtsPreset.requiresKey === false ? (
                      <div className="rounded-lg bg-[var(--status-ok-bg)] px-3 py-2 text-xs text-[var(--status-ok-fg)]">
                        免配置 API Key，可直接试听与朗读。
                      </div>
                    ) : (
                      <Field name="cloudTtsApiKey">
                        <div className="flex items-center justify-between">
                          <FieldLabel>API Key</FieldLabel>
                          {activeTtsPreset.applyUrl && (
                            <a
                              href={activeTtsPreset.applyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11.5px] text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                            >
                              <ExternalLinkIcon className="size-3" aria-hidden="true" />
                              <span>获取 Key</span>
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <PasswordInput
                              value={ttsApiKeyDraft}
                              onValueChange={onTtsApiKeyDraftChange}
                            >
                              <PasswordInputControl
                                placeholder={
                                  activeTtsKeyInfo?.configured
                                    ? `已保存 ${activeTtsKeyInfo.masked}（输入新值覆盖）`
                                    : settings.cloudTtsProvider === "doubao-tts"
                                      ? "填火山 API Key 或 AppID:AccessToken（已配豆包 ASR 可留空）"
                                      : settings.cloudTtsProvider === "qwen-tts"
                                        ? "填阿里云百炼 API Key（已配通义千问 AI 可留空）"
                                        : settings.cloudTtsProvider === "siliconflow-tts"
                                          ? "填硅基流动 API Key（已配硅基流动 AI 可留空）"
                                          : "粘贴 API Key"
                                }
                              />
                              <PasswordInputToggle aria-label="显示或隐藏云端 TTS API Key">
                                {(state) =>
                                  state.visible ? (
                                    <EyeOffIcon className="size-3.5" aria-hidden="true" />
                                  ) : (
                                    <EyeIcon className="size-3.5" aria-hidden="true" />
                                  )
                                }
                              </PasswordInputToggle>
                            </PasswordInput>
                          </div>
                          <Button
                            data-variant="solid"
                            pendingAnnouncement="正在保存 TTS 配置"
                            onClick={onSaveTtsConfig}
                          >
                            保存
                          </Button>
                        </div>
                      </Field>
                    )}

                    <div className="border-t border-[var(--ui-border)] pt-3">
                      <div className="flex justify-end">
                        <Button
                          className="h-7 gap-1 border-transparent bg-transparent px-2 text-xs text-[var(--ui-muted-foreground)]"
                          onClick={() => setShowCloudTtsAdvanced((v) => !v)}
                        >
                          {showCloudTtsAdvanced ? (
                            <ChevronUpIcon className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                          )}
                          <span>高级设置</span>
                        </Button>
                      </div>

                      {showCloudTtsAdvanced && (
                        <div className="mt-2 flex flex-col gap-3">
                          <Field name="cloudTtsBaseUrl">
                            <FieldLabel>接口地址</FieldLabel>
                            <Input
                              className="tabular-nums"
                              value={settings.cloudTtsBaseUrl}
                              onValueChange={(cloudTtsBaseUrl) =>
                                onUpdateSettings({ cloudTtsBaseUrl })
                              }
                              placeholder={activeTtsPreset.baseUrl}
                            />
                          </Field>

                          <Field name="cloudTtsModel">
                            <FieldLabel>模型</FieldLabel>
                            <Input
                              className="tabular-nums"
                              value={settings.cloudTtsModel}
                              onValueChange={(cloudTtsModel) =>
                                onUpdateSettings({ cloudTtsModel })
                              }
                              placeholder={activeTtsPreset.defaultModel}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Field>
                  <FieldLabel>朗读语速</FieldLabel>
                  <SegmentedControl
                    aria-label="朗读语速"
                    value={String(settings.ttsSpeed ?? 1)}
                    onValueChange={(next) => {
                      if (next) onUpdateSettings({ ttsSpeed: Number(next) });
                    }}
                  >
                    <SegmentedControlIndicator />
                    {TTS_SPEED_OPTIONS.map((opt) => (
                      <SegmentedControlItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SegmentedControlItem>
                    ))}
                  </SegmentedControl>
                  <FieldDescription>
                    朗读时也可以在播放器旁随时调整。
                  </FieldDescription>
                </Field>
              </div>
            </div>
          </TabsPanel>

          <TabsPanel value="env">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--ui-muted-foreground)]">
                  实时检测本机二进制工具、SQLite 与 macOS 钥匙串状态
                </span>
                <Button
                  pendingAnnouncement="正在刷新环境检测"
                  onClick={onRefreshEnv}
                >
                  <RefreshCwIcon className="size-3.5" aria-hidden="true" />
                  <span>重新检测环境</span>
                </Button>
              </div>
              {envDeps.map((dep) => (
                <div
                  key={dep.name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-[var(--ui-foreground)]">
                      {dep.name}
                    </div>
                    <div className="tabular-nums truncate text-xs text-[var(--ui-muted-foreground)]">
                      {dep.path} · {dep.version}
                    </div>
                    {!dep.available && dep.installHint && (
                      <div className="tabular-nums mt-1 text-[11px] text-[var(--status-warn-fg)]">
                        安装命令：{dep.installHint}
                      </div>
                    )}
                  </div>
                  <span
                    className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                    style={{
                      color: dep.available
                        ? "var(--status-ok-fg)"
                        : "var(--status-warn-fg)",
                      background: dep.available
                        ? "var(--status-ok-bg)"
                        : "var(--status-warn-bg)",
                    }}
                  >
                    {dep.available ? "正常" : "缺失"}
                  </span>
                </div>
              ))}
            </div>
          </TabsPanel>

          <TabsPanel value="about">
            {(() => {
              const repoSlug = (settings.otaRepo || "luqiming19820311/Arbok1").trim();
              const repoUrl = /^https?:\/\//i.test(repoSlug)
                ? repoSlug.replace(/\/+$/, "")
                : `https://github.com/${repoSlug}`;
              const ownerUrl = "https://github.com/luqiming19820311";
              const updateStatusColor =
                updateCheckResult?.status === "error"
                  ? "var(--ui-destructive)"
                  : updateCheckResult?.status === "update-available"
                    ? "var(--arbok-accent-text)"
                    : "var(--status-ok-fg)";
              const updateStatusText = checkingUpdate
                ? "正在检查 GitHub Releases 更新…"
                : updateCheckResult?.message ?? "已经是最新版本";

              return (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 rounded-2xl shadow-sm">
                      <ArbokLogo size={56} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2.5">
                        <span className="text-lg font-bold tracking-tight text-[var(--ui-foreground)]">
                          Arbok
                        </span>
                        <span className="tabular-nums text-xs text-[var(--ui-muted-foreground)]">
                          版本 V0.2.0
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                        支持 YouTube、哔哩哔哩、播客，配中文字幕、翻译和播报、AI 导读、AI 问答、笔记等功能。
                      </p>
                      <div
                        role="status"
                        className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium"
                        style={{ color: updateStatusColor }}
                      >
                        <span>{updateStatusText}</span>
                        {updateCheckResult?.status === "update-available" &&
                          updateCheckResult.downloadUrl && (
                            <a
                              href={updateCheckResult.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 underline underline-offset-2"
                            >
                              <span>下载 V{updateCheckResult.latestVersion}</span>
                              <ExternalLinkIcon className="size-3" aria-hidden="true" />
                            </a>
                          )}
                      </div>
                      <label className="mt-2.5 inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--ui-foreground)] select-none">
                        <Checkbox
                          checked={settings.autoDownloadUpdates ?? true}
                          onCheckedChange={(next) =>
                            onUpdateSettings({
                              autoDownloadUpdates: next === true,
                            })
                          }
                          className="arbok-cli-checkbox"
                        >
                          <CheckboxIndicator>
                            <CheckIcon className="size-3" aria-hidden="true" />
                          </CheckboxIndicator>
                        </Checkbox>
                        <span>自动下载新版本，重启后生效</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      disabled={checkingUpdate}
                      className="h-8 gap-1.5 rounded-lg bg-[var(--ui-muted)] px-3 text-xs"
                      onClick={() => void handleCheckUpdates()}
                    >
                      <RefreshCwIcon
                        className={`size-3.5 ${checkingUpdate ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      <span>检查更新</span>
                    </Button>
                    <a
                      href={`${repoUrl}/issues`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-muted)] px-3 text-xs font-medium text-[var(--ui-foreground)] transition-colors hover:bg-[var(--arbok-surface)]"
                    >
                      <MessageSquareIcon className="size-3.5" aria-hidden="true" />
                      <span>反馈问题</span>
                    </a>
                    <a
                      href={`${repoUrl}#readme`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-muted)] px-3 text-xs font-medium text-[var(--ui-foreground)] transition-colors hover:bg-[var(--arbok-surface)]"
                    >
                      <BookOpenIcon className="size-3.5" aria-hidden="true" />
                      <span>使用说明</span>
                    </a>
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-muted)] px-3 text-xs font-medium text-[var(--ui-foreground)] transition-colors hover:bg-[var(--arbok-surface)]"
                    >
                      <Code2Icon className="size-3.5" aria-hidden="true" />
                      <span>源代码</span>
                    </a>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <ArbokLogo size={38} />
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-[var(--ui-foreground)]">
                          GitHub OTA 自动升级源
                        </div>
                        <div className="tabular-nums mt-0.5 truncate text-xs text-[var(--ui-muted-foreground)]">
                          {repoUrl.replace(/^https?:\/\//i, "")} · SemVer 语义化版本（V0.1.0 起步）
                        </div>
                      </div>
                    </div>
                    <a
                      href={ownerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#e11d48] px-3.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      <span>GitHub 主页</span>
                      <ExternalLinkIcon className="size-3" aria-hidden="true" />
                    </a>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                      <div>
                        <div className="text-[13px] font-semibold text-[var(--ui-foreground)]">
                          OTA 仓库与版本规则
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                          遵循 SemVer（v主.次.修）：修复升修订号（V0.1.1），新功能升次版本（V0.2.0），正式发布升 V1.0.0。
                        </p>
                      </div>
                      <Field name="otaRepo">
                        <FieldLabel className="text-[11px] text-[var(--ui-muted-foreground)]">
                          GitHub Releases 仓库
                        </FieldLabel>
                        <Input
                          aria-label="GitHub OTA 仓库地址"
                          className="tabular-nums h-8 text-xs"
                          value={settings.otaRepo ?? "luqiming19820311/Arbok1"}
                          onValueChange={(next) =>
                            onUpdateSettings({ otaRepo: next })
                          }
                          placeholder="luqiming19820311/Arbok1"
                        />
                      </Field>
                    </div>

                    <div className="flex items-center gap-3.5 rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)] p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/wechat-qr.png"
                        alt="微信扫码赞赏与联系作者"
                        className="size-24 shrink-0 rounded-xl border border-[var(--ui-border)] bg-white p-1 object-contain"
                      />
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-[var(--ui-foreground)]">
                          请我喝杯咖啡
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--ui-muted-foreground)]">
                          微信扫码赞赏与反馈交流
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ui-border)] pt-3 text-[11px] text-[var(--ui-muted-foreground)]">
                    <span>Arbok V0.2.0 · 本地优先 · 数据与凭据均存本机</span>
                    <span>GitHub Releases OTA · luqiming19820311</span>
                  </div>
                </div>
              );
            })()}
          </TabsPanel>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
