"use client";

import { Button } from "@ui-sdk/react/button";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { FileAudioIcon, PlusIcon, SearchIcon, UploadIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { detectPlatformFromUrl, getPlatformMeta } from "./mock-data";
import type { PodcastDirectoryItem } from "./types";

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: PodcastDirectoryItem[];
  onAddUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
  onToggleDirectorySubscribe: (item: PodcastDirectoryItem) => Promise<void>;
  onImportLocalFile?: (
    file: File,
    title?: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

const ACCEPTED_LOCAL_EXTS = [".mp3", ".m4a", ".wav", ".mp4", ".mov"];

const DEMO_URLS = [
  { label: "填入播客 RSS 示例", url: "https://feeds.transistor.fm/acquired" },
  { label: "填入 B站示例", url: "https://www.bilibili.com/video/BV1GJ411x7h7" },
  { label: "填入 YouTube 示例", url: "https://www.youtube.com/watch?v=zjkBMFhNj_g" },
  { label: "填入小宇宙示例", url: "https://www.xiaoyuzhoufm.com/podcast/6021f949a789fca4eff4492c" },
];

export function AddSourceDialog({
  open,
  onOpenChange,
  directory,
  onAddUrl,
  onToggleDirectorySubscribe,
  onImportLocalFile,
}: AddSourceDialogProps) {
  const [urlValue, setUrlValue] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [submittingUrl, setSubmittingUrl] = useState(false);

  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localTitle, setLocalTitle] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [importingLocal, setImportingLocal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const localFileInputRef = useRef<HTMLInputElement | null>(null);

  const [podcastQuery, setPodcastQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<PodcastDirectoryItem[] | null>(
    null
  );
  const [searchingPodcasts, setSearchingPodcasts] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingSubId, setPendingSubId] = useState<string | null>(null);

  const detected = detectPlatformFromUrl(urlValue);
  const detectedMeta = detected ? getPlatformMeta(detected) : null;

  useEffect(() => {
    const q = podcastQuery.trim();
    if (!q || q.length < 2 || process.env.NODE_ENV === "test") {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingPodcasts(true);
      setSearchError(null);
      void fetch(`/api/podcasts/search?term=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = (await res.json()) as {
            results?: PodcastDirectoryItem[];
            error?: string;
          };
          if (!res.ok) {
            throw new Error(data.error ?? "搜索 Apple 播客失败");
          }
          setRemoteResults(data.results ?? []);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setSearchError(err instanceof Error ? err.message : "搜索失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchingPodcasts(false);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [podcastQuery]);

  function handlePodcastQueryChange(next: string) {
    setPodcastQuery(next);
    if (next.trim().length < 2) {
      setRemoteResults(null);
      setSearchError(null);
      setSearchingPodcasts(false);
    }
  }

  const displayedDirectory = remoteResults
    ? remoteResults.map((item) => {
        const localMatch = directory.find(
          (d) =>
            (item.feedUrl && d.feedUrl === item.feedUrl) ||
            d.name.toLowerCase() === item.name.toLowerCase()
        );
        return localMatch ? { ...item, subscribed: localMatch.subscribed } : item;
      })
    : directory.filter((item) => {
        const q = podcastQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          item.author.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q)
        );
      });

  async function handleUrlSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = urlValue.trim();
    if (!trimmed) {
      setUrlError("请输入或粘贴有效的播客、YouTube 或 B站链接。");
      return;
    }
    setUrlError(null);
    setSubmittingUrl(true);
    try {
      const result = await onAddUrl(trimmed);
      if (result.ok) {
        setUrlValue("");
        onOpenChange(false);
      } else {
        setUrlError(result.error ?? "链接解析失败，请检查链接或网络后重试。");
      }
    } finally {
      setSubmittingUrl(false);
    }
  }

  async function handleSubscribeClick(item: PodcastDirectoryItem) {
    setPendingSubId(item.id);
    try {
      await onToggleDirectorySubscribe(item);
      if (remoteResults) {
        setRemoteResults((prev) =>
          prev
            ? prev.map((r) =>
                r.id === item.id ? { ...r, subscribed: !r.subscribed } : r
              )
            : null
        );
      }
    } finally {
      setPendingSubId(null);
    }
  }

  function selectLocalFile(file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const ok = ACCEPTED_LOCAL_EXTS.some((ext) => lower.endsWith(ext));
    if (!ok) {
      setLocalError(
        `暂不支持该格式，请选择 ${ACCEPTED_LOCAL_EXTS.join(" / ")} 文件。`
      );
      setLocalFile(null);
      return;
    }
    setLocalError(null);
    setLocalFile(file);
    setLocalTitle(file.name.replace(/\.[^.]+$/, ""));
  }

  async function handleLocalImportSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!localFile) {
      setLocalError("请先拖入或选择本地音视频文件。");
      return;
    }
    if (!onImportLocalFile) return;
    setLocalError(null);
    setImportingLocal(true);
    try {
      const res = await onImportLocalFile(localFile, localTitle.trim() || undefined);
      if (res.ok) {
        setLocalFile(null);
        setLocalTitle("");
        onOpenChange(false);
      } else {
        setLocalError(res.error ?? "导入本地文件失败");
      }
    } finally {
      setImportingLocal(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        shortcut="mod+n"
        data-variant="solid"
        className="w-full justify-center gap-1.5 font-medium"
      >
        <PlusIcon className="size-3.5" aria-hidden="true" />
        <span>添加链接 / 订阅</span>
        <DialogShortcut className="ml-1 opacity-80" />
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="arbok-dialog-standard">
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-3.5">
          <div>
            <DialogTitle className="text-[15px] font-semibold text-[var(--ui-foreground)]">
              添加内容或订阅
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
              自动识别播客 RSS、小宇宙、YouTube 与哔哩哔哩链接
            </DialogDescription>
          </div>
          <DialogClose aria-label="关闭添加弹窗">
            <XIcon className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="p-5">
          <Tabs defaultValue="url">
            <TabsList aria-label="添加方式" className="mb-4">
              <TabsTab value="url">粘贴链接</TabsTab>
              <TabsTab value="search">搜索 Apple 播客</TabsTab>
              <TabsTab value="local">本地文件</TabsTab>
            </TabsList>

            <TabsPanel value="url">
              <form className="flex flex-col gap-4" onSubmit={handleUrlSubmit} noValidate>
                <Field name="sourceUrl" invalid={urlError ? true : undefined}>
                  <FieldLabel>内容或频道链接</FieldLabel>
                  <InputGroup>
                    <Input
                      type="text"
                      inputMode="url"
                      required
                      value={urlValue}
                      placeholder="https://space.bilibili.com/615957867 或 BV视频 / YouTube / RSS"
                      onValueChange={(next) => {
                        setUrlValue(next);
                        if (urlError) setUrlError(null);
                      }}
                    />
                    <InputClear aria-label="清空链接">
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </InputClear>
                  </InputGroup>
                  <FieldDescription>
                    {detectedMeta ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{ color: detectedMeta.fg, background: detectedMeta.bg }}
                        >
                          已识别：{detectedMeta.label}
                        </span>
                        <span>将自动提取真实元数据、媒体流地址与官方字幕</span>
                      </span>
                    ) : (
                      "支持单集/单视频直连播放，或粘贴 RSS / 频道 / UP 主主页直接订阅"
                    )}
                  </FieldDescription>
                  {urlError && <FieldError match>{urlError}</FieldError>}
                </Field>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-[var(--ui-muted-foreground)]">快速示例：</span>
                  {DEMO_URLS.map((demo) => (
                    <Button
                      key={demo.url}
                      className="h-7 rounded-full px-2.5 text-xs"
                      onClick={() => {
                        setUrlValue(demo.url);
                        setUrlError(null);
                      }}
                    >
                      {demo.label}
                    </Button>
                  ))}
                </div>

                <div className="flex justify-end gap-2 border-t border-[var(--ui-border)] pt-3.5">
                  <DialogClose>取消添加</DialogClose>
                  <Button
                    type="submit"
                    data-variant="solid"
                    disabled={submittingUrl}
                  >
                    {submittingUrl ? "正在解析…" : "解析并加入"}
                  </Button>
                </div>
              </form>
            </TabsPanel>

            <TabsPanel value="search">
              <div className="flex flex-col gap-3">
                <Field name="applePodcastSearch">
                  <FieldLabel>搜索全球 Apple 播客</FieldLabel>
                  <InputGroup>
                    <SearchIcon
                      className="ml-2.5 size-3.5 text-[var(--ui-muted-foreground)]"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      value={podcastQuery}
                      placeholder="输入中英文播客名称，如 Lex Fridman / Acquired / 硅谷101..."
                      onValueChange={handlePodcastQueryChange}
                    />
                    <InputClear aria-label="清空播客搜索">
                      <XIcon className="size-3.5" aria-hidden="true" />
                    </InputClear>
                  </InputGroup>
                  <FieldDescription>
                    {searchingPodcasts
                      ? "正在实时检索 Apple Podcasts 目录…"
                      : searchError
                        ? searchError
                        : "点击订阅将实时拉取 RSS 并导入最新可播放单集"}
                  </FieldDescription>
                </Field>

                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                  {displayedDirectory.length === 0 && !searchingPodcasts ? (
                    <div className="rounded-lg border border-dashed border-[var(--ui-border)] px-4 py-6 text-center text-xs text-[var(--ui-muted-foreground)]">
                      未找到匹配的播客，试试更换关键词或直接粘贴 RSS 地址。
                    </div>
                  ) : (
                    displayedDirectory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ui-border)] bg-[var(--arbok-surface)] px-3.5 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          {item.coverUrl && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={item.coverUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="size-10 shrink-0 rounded-md object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-[var(--ui-foreground)]">
                              {item.name}
                              <span className="ml-1.5 font-normal text-[var(--ui-muted-foreground)]">
                                · {item.author}
                              </span>
                            </div>
                            <div className="truncate text-xs text-[var(--ui-muted-foreground)]">
                              {item.desc}
                            </div>
                          </div>
                        </div>
                        <Button
                          data-variant={item.subscribed ? undefined : "solid"}
                          className="shrink-0"
                          disabled={pendingSubId === item.id}
                          onClick={() => handleSubscribeClick(item)}
                        >
                          {pendingSubId === item.id
                            ? `处理中 ${item.name}`
                            : item.subscribed
                              ? `退订 ${item.name}`
                              : `订阅 ${item.name}`}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </TabsPanel>

            <TabsPanel value="local">
              <form
                className="flex flex-col gap-4"
                onSubmit={handleLocalImportSubmit}
                noValidate
              >
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragActive(false);
                    selectLocalFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-5 py-7 text-center transition-colors ${
                    dragActive
                      ? "border-[var(--arbok-accent)] bg-[var(--arbok-accent-soft)]"
                      : "border-[var(--ui-input)] bg-[var(--arbok-surface)]"
                  }`}
                >
                  <input
                    ref={localFileInputRef}
                    type="file"
                    aria-label="选择本地音视频文件"
                    accept=".mp3,.m4a,.wav,.mp4,.mov,audio/*,video/*"
                    className="sr-only"
                    onChange={(e) => {
                      selectLocalFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                  {localFile ? (
                    <>
                      <FileAudioIcon
                        className="size-7 text-[var(--arbok-accent-text)]"
                        aria-hidden="true"
                      />
                      <div className="max-w-full truncate text-xs font-semibold text-[var(--ui-foreground)]">
                        {localFile.name}
                      </div>
                      <div className="text-[11px] text-[var(--ui-muted-foreground)]">
                        {(localFile.size / (1024 * 1024)).toFixed(2)} MB · 已就绪
                      </div>
                      <Button
                        type="button"
                        className="mt-1 h-7 px-3 text-xs"
                        onClick={() => localFileInputRef.current?.click()}
                      >
                        重新选择文件
                      </Button>
                    </>
                  ) : (
                    <>
                      <UploadIcon
                        className="size-6 text-[var(--ui-muted-foreground)]"
                        aria-hidden="true"
                      />
                      <div className="text-xs font-medium text-[var(--ui-foreground)]">
                        拖拽本地音视频文件到这里，或点击选择
                      </div>
                      <div className="text-[11px] text-[var(--ui-muted-foreground)]">
                        支持 .mp3 / .m4a / .wav / .mp4 / .mov，入库后可直接播放、ASR 转写与 AI 导读
                      </div>
                      <Button
                        type="button"
                        className="mt-1 h-8 px-3 text-xs"
                        onClick={() => localFileInputRef.current?.click()}
                      >
                        选择本地文件
                      </Button>
                    </>
                  )}
                </div>

                <Field name="localTitle" invalid={localError ? true : undefined}>
                  <FieldLabel>单集标题（可选）</FieldLabel>
                  <Input
                    value={localTitle}
                    placeholder="默认使用文件名"
                    onValueChange={setLocalTitle}
                  />
                  {localError && <FieldError match>{localError}</FieldError>}
                </Field>

                <div className="flex justify-end gap-2 border-t border-[var(--ui-border)] pt-3.5">
                  <DialogClose>取消导入</DialogClose>
                  <Button
                    type="submit"
                    data-variant="solid"
                    disabled={importingLocal}
                  >
                    {importingLocal ? "正在导入…" : "导入并开始播放"}
                  </Button>
                </div>
              </form>
            </TabsPanel>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
