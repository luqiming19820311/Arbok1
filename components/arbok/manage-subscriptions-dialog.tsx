"use client";

import { Button } from "@ui-sdk/react/button";
import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input";
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
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderInputIcon,
  FolderPlusIcon,
  PencilIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getPlatformMeta } from "./mock-data";
import type { Episode, Subscription, SubscriptionFolder } from "./types";

const QUICK_FOLDER_SUGGESTIONS = ["科技类", "数码类", "播客类", "YouTube 类"];
const UNCAT_VALUE = "__uncategorized__";

interface ManageSubscriptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptions: Subscription[];
  episodes: Episode[];
  folders: SubscriptionFolder[];
  keepOriginalShowNames: boolean;
  onKeepOriginalShowNamesChange: (checked: boolean) => void;
  onCreateFolder: (name: string) => SubscriptionFolder | null;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onMoveSubscriptionsToFolder: (
    subIds: string[],
    folderId: string | null
  ) => Promise<void>;
  onRenameSubscription: (subId: string, name: string) => Promise<void>;
  onUnsubscribeMany: (subIds: string[]) => Promise<void>;
}

type ManagePlatformTab = "all" | "podcast" | "youtube" | "bilibili";

export function ManageSubscriptionsDialog({
  open,
  onOpenChange,
  subscriptions,
  episodes,
  folders,
  keepOriginalShowNames,
  onKeepOriginalShowNamesChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSubscriptionsToFolder,
  onRenameSubscription,
  onUnsubscribeMany,
}: ManageSubscriptionsDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [platformTab, setPlatformTab] = useState<ManagePlatformTab>("all");
  const [activeFolderFilter, setActiveFolderFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchTargetFolder, setBatchTargetFolder] =
    useState<string>(UNCAT_VALUE);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderDraft, setEditingFolderDraft] = useState("");

  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubDraft, setEditingSubDraft] = useState("");

  const folderNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of folders) m.set(f.id, f.name);
    return m;
  }, [folders]);

  const effectiveFolderFilter =
    activeFolderFilter !== "all" &&
    activeFolderFilter !== UNCAT_VALUE &&
    !folderNameMap.has(activeFolderFilter)
      ? "all"
      : activeFolderFilter;

  const filteredSubs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subscriptions.filter((sub) => {
      if (platformTab === "podcast") {
        if (sub.platform !== "podcast" && sub.platform !== "xiaoyuzhou") {
          return false;
        }
      } else if (platformTab !== "all" && sub.platform !== platformTab) {
        return false;
      }

      if (effectiveFolderFilter === UNCAT_VALUE) {
        if (sub.folderId && folderNameMap.has(sub.folderId)) return false;
      } else if (effectiveFolderFilter !== "all") {
        if (sub.folderId !== effectiveFolderFilter) return false;
      }

      if (q && !sub.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [subscriptions, platformTab, effectiveFolderFilter, folderNameMap, searchQuery]);

  const activeSelectedIds = useMemo(() => {
    const validSet = new Set(subscriptions.map((s) => s.id));
    return selectedIds.filter((id) => validSet.has(id));
  }, [selectedIds, subscriptions]);

  const allVisibleSelected =
    filteredSubs.length > 0 &&
    filteredSubs.every((s) => activeSelectedIds.includes(s.id));

  const folderSelectItems = useMemo(
    () => [
      { value: UNCAT_VALUE, label: "未分类" },
      ...folders.map((f) => ({ value: f.id, label: f.name })),
    ],
    [folders]
  );

  const effectiveBatchTarget =
    batchTargetFolder !== UNCAT_VALUE && !folderNameMap.has(batchTargetFolder)
      ? folders[0]?.id ?? UNCAT_VALUE
      : batchTargetFolder;

  const uncategorizedCount = useMemo(
    () =>
      subscriptions.filter((s) => !s.folderId || !folderNameMap.has(s.folderId))
        .length,
    [subscriptions, folderNameMap]
  );

  function handleToggleSelectAll() {
    if (allVisibleSelected) {
      const visibleSet = new Set(filteredSubs.map((s) => s.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...filteredSubs.map((s) => s.id)]))
      );
    }
  }

  function handleToggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    );
  }

  function handleSubmitNewFolder(customName?: string) {
    const name = (customName ?? newFolderName).trim();
    if (!name) return;
    const created = onCreateFolder(name);
    if (created) {
      setBatchTargetFolder(created.id);
      setNewFolderName("");
      setCreatingFolder(false);
    }
  }

  function handleCommitFolderRename(folderId: string) {
    const trimmed = editingFolderDraft.trim();
    if (trimmed) {
      onRenameFolder(folderId, trimmed);
    }
    setEditingFolderId(null);
    setEditingFolderDraft("");
  }

  async function handleCommitSubRename(subId: string) {
    const trimmed = editingSubDraft.trim();
    if (trimmed) {
      await onRenameSubscription(subId, trimmed);
    }
    setEditingSubId(null);
    setEditingSubDraft("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop />
      <DialogContent className="arbok-dialog-wide flex max-h-[86dvh] flex-col">
        <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
          <div>
            <DialogTitle className="text-base font-semibold text-[var(--ui-foreground)]">
              管理订阅
            </DialogTitle>
            <DialogDescription className="sr-only">
              按自定义分类文件夹整理频道、重命名或批量取消订阅
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="关闭管理订阅"
            className="size-7 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
          >
            <XIcon className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--ui-muted-foreground)]">
              共 {subscriptions.length} 个订阅
              {activeSelectedIds.length > 0 && (
                <span className="ml-1.5 font-medium text-[var(--arbok-accent-text)]">
                  · 已选 {activeSelectedIds.length} 项
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                className="h-7 gap-1.5 px-2.5 text-xs"
                onClick={() => setCreatingFolder((v) => !v)}
              >
                <FolderPlusIcon className="size-3.5" aria-hidden="true" />
                <span>新建文件夹</span>
              </Button>
              <Button
                className="h-7 border-transparent bg-transparent px-2 text-xs text-[var(--ui-foreground)]"
                onClick={handleToggleSelectAll}
              >
                {allVisibleSelected ? "取消全选" : "全选"}
              </Button>
            </div>
          </div>

          {creatingFolder && (
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--arbok-accent-border)] bg-[var(--arbok-accent-soft)]/50 p-3">
              <div className="flex items-center gap-2">
                <Input
                  aria-label="新文件夹名称"
                  className="flex-1 bg-[var(--ui-background)]"
                  value={newFolderName}
                  onValueChange={setNewFolderName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmitNewFolder();
                    }
                  }}
                  placeholder="输入分类名称，如：科技类、数码类、播客类、YouTube 类"
                />
                <Button
                  data-variant="solid"
                  disabled={!newFolderName.trim()}
                  onClick={() => handleSubmitNewFolder()}
                >
                  创建
                </Button>
                <Button
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }}
                >
                  取消
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ui-muted-foreground)]">
                <span>快捷分类：</span>
                {QUICK_FOLDER_SUGGESTIONS.filter(
                  (name) => !folders.some((f) => f.name === name)
                ).map((preset) => (
                  <Button
                    key={preset}
                    className="h-6 rounded-full px-2.5 text-[11px]"
                    onClick={() => handleSubmitNewFolder(preset)}
                  >
                    + {preset}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {folders.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                data-variant={effectiveFolderFilter === "all" ? "solid" : undefined}
                className="h-7 rounded-full px-2.5 text-xs"
                onClick={() => setActiveFolderFilter("all")}
              >
                全部分类 ({subscriptions.length})
              </Button>
              <Button
                data-variant={
                  effectiveFolderFilter === UNCAT_VALUE ? "solid" : undefined
                }
                className="h-7 rounded-full px-2.5 text-xs"
                onClick={() => setActiveFolderFilter(UNCAT_VALUE)}
              >
                未分类 ({uncategorizedCount})
              </Button>
              {folders.map((folder) => {
                const count = subscriptions.filter(
                  (s) => s.folderId === folder.id
                ).length;
                const isEditing = editingFolderId === folder.id;
                if (isEditing) {
                  return (
                    <div
                      key={folder.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--arbok-accent-border)] bg-[var(--arbok-surface)] px-2 py-0.5"
                    >
                      <Input
                        aria-label={`编辑文件夹 ${folder.name}`}
                        className="h-6 w-24 px-1.5 text-xs"
                        value={editingFolderDraft}
                        onValueChange={setEditingFolderDraft}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCommitFolderRename(folder.id);
                          } else if (e.key === "Escape") {
                            setEditingFolderId(null);
                          }
                        }}
                      />
                      <Button
                        aria-label="保存文件夹名称"
                        className="size-5 border-transparent bg-transparent p-0"
                        onClick={() => handleCommitFolderRename(folder.id)}
                      >
                        <CheckIcon className="size-3" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                }
                const active = effectiveFolderFilter === folder.id;
                return (
                  <div
                    key={folder.id}
                    className={`inline-flex items-center rounded-full border pl-2.5 pr-1 text-xs transition-colors ${
                      active
                        ? "border-[var(--arbok-accent-border)] bg-[var(--arbok-accent-soft)] font-medium text-[var(--arbok-accent-text)]"
                        : "border-[var(--ui-border)] bg-[var(--arbok-surface)] text-[var(--ui-foreground)]"
                    }`}
                  >
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1.5 pr-1 text-xs"
                      onClick={() => setActiveFolderFilter(folder.id)}
                    >
                      <FolderIcon className="size-3 opacity-80" aria-hidden="true" />
                      <span>{folder.name}</span>
                      <span className="tabular-nums opacity-70">({count})</span>
                    </button>
                    <Button
                      aria-label={`重命名文件夹 ${folder.name}`}
                      className="size-5 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                      onClick={() => {
                        setEditingFolderId(folder.id);
                        setEditingFolderDraft(folder.name);
                      }}
                    >
                      <PencilIcon className="size-2.5" aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`删除文件夹 ${folder.name}`}
                      className="size-5 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:text-[var(--ui-destructive)]"
                      onClick={() => {
                        if (activeFolderFilter === folder.id) {
                          setActiveFolderFilter("all");
                        }
                        onDeleteFolder(folder.id);
                      }}
                    >
                      <XIcon className="size-3" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <InputGroup className="min-w-[180px] flex-1">
              <SearchIcon
                className="ml-2.5 size-3.5 text-[var(--ui-muted-foreground)]"
                aria-hidden="true"
              />
              <Input
                aria-label="按名字筛选订阅"
                value={searchQuery}
                onValueChange={setSearchQuery}
                placeholder="按名字筛选"
              />
              <InputClear aria-label="清空订阅筛选">
                <XIcon className="size-3.5" aria-hidden="true" />
              </InputClear>
            </InputGroup>

            <SegmentedControl
              aria-label="按平台筛选订阅"
              value={platformTab}
              onValueChange={(next) => {
                if (
                  next === "all" ||
                  next === "podcast" ||
                  next === "youtube" ||
                  next === "bilibili"
                ) {
                  setPlatformTab(next);
                }
              }}
            >
              <SegmentedControlIndicator />
              <SegmentedControlItem value="all">全部</SegmentedControlItem>
              <SegmentedControlItem value="podcast">播客</SegmentedControlItem>
              <SegmentedControlItem value="youtube">YouTube</SegmentedControlItem>
              <SegmentedControlItem value="bilibili">B站</SegmentedControlItem>
            </SegmentedControl>
          </div>

          {activeSelectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--arbok-accent-border)] bg-[var(--arbok-accent-soft)] px-3.5 py-2 text-xs">
              <span className="font-medium text-[var(--ui-foreground)]">
                已选中 {activeSelectedIds.length} 个频道
              </span>
              <div className="flex items-center gap-2">
                <Select
                  items={folderSelectItems}
                  value={effectiveBatchTarget}
                  onValueChange={(next) => {
                    if (next) setBatchTargetFolder(next);
                  }}
                >
                  <SelectTrigger
                    aria-label="选择批量移动目标分类"
                    className="h-7 w-[144px] bg-[var(--ui-background)] text-xs"
                  >
                    <SelectValue />
                    <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                  </SelectTrigger>
                  <SelectContent>
                    {folderSelectItems.map((opt) => (
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
                  data-variant="solid"
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={async () => {
                    const targetId =
                      effectiveBatchTarget === UNCAT_VALUE
                        ? null
                        : effectiveBatchTarget;
                    await onMoveSubscriptionsToFolder(activeSelectedIds, targetId);
                    setSelectedIds([]);
                  }}
                >
                  <FolderInputIcon className="size-3.5" aria-hidden="true" />
                  <span>移动到分类</span>
                </Button>
              </div>
            </div>
          )}

          <div className="min-h-[220px] flex-1 overflow-y-auto rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)]">
            {filteredSubs.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-1 text-xs text-[var(--ui-muted-foreground)]">
                <span>当前筛选条件下没有订阅频道</span>
              </div>
            ) : (
              <div className="divide-y divide-[var(--ui-border)]">
                {filteredSubs.map((sub) => {
                  const checked = activeSelectedIds.includes(sub.id);
                  const meta = getPlatformMeta(sub.platform);
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
                  const currentFolderName = sub.folderId
                    ? folderNameMap.get(sub.folderId)
                    : undefined;
                  const isEditingThis = editingSubId === sub.id;

                  return (
                    <div
                      key={sub.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--ui-muted)]/45"
                    >
                      <Checkbox
                        aria-label={`选择订阅 ${sub.name}`}
                        checked={checked}
                        onCheckedChange={(next) =>
                          handleToggleOne(sub.id, next === true)
                        }
                        className="arbok-cli-checkbox"
                      >
                        <CheckboxIndicator>
                          <CheckIcon className="size-3" aria-hidden="true" />
                        </CheckboxIndicator>
                      </Checkbox>

                      <span
                        className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[10px] font-bold text-white shadow-xs"
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

                      <div className="min-w-0 flex-1">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              aria-label={`编辑频道名称 ${sub.name}`}
                              className="h-7 flex-1 text-xs"
                              value={editingSubDraft}
                              onValueChange={setEditingSubDraft}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleCommitSubRename(sub.id);
                                } else if (e.key === "Escape") {
                                  setEditingSubId(null);
                                }
                              }}
                            />
                            <Button
                              className="h-7 px-2 text-xs"
                              onClick={() => void handleCommitSubRename(sub.id)}
                            >
                              保存
                            </Button>
                            <Button
                              className="h-7 px-2 text-xs"
                              onClick={() => setEditingSubId(null)}
                            >
                              取消
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="truncate text-[13.5px] font-medium text-[var(--ui-foreground)]">
                              {sub.name}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-[var(--ui-muted-foreground)]">
                              <span>{platformSubLabel}</span>
                              {currentFolderName && (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1 rounded bg-[var(--arbok-accent-soft)] px-1.5 py-0.2 text-[10.5px] font-medium text-[var(--arbok-accent-text)]">
                                    <FolderIcon
                                      className="size-2.5"
                                      aria-hidden="true"
                                    />
                                    {currentFolderName}
                                  </span>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Select
                          items={folderSelectItems}
                          value={
                            sub.folderId && folderNameMap.has(sub.folderId)
                              ? sub.folderId
                              : UNCAT_VALUE
                          }
                          onValueChange={(next) => {
                            if (!next) return;
                            const folderId = next === UNCAT_VALUE ? null : next;
                            void onMoveSubscriptionsToFolder([sub.id], folderId);
                          }}
                        >
                          <SelectTrigger
                            aria-label={`移动 ${sub.name} 到分类`}
                            className="h-7 w-[112px] text-xs"
                          >
                            <SelectValue />
                            <ChevronDownIcon
                              className="size-3"
                              aria-hidden="true"
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {folderSelectItems.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                                <SelectItemIndicator>
                                  <CheckIcon
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                </SelectItemIndicator>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          aria-label={`重命名订阅 ${sub.name}`}
                          className="size-7 border-transparent bg-transparent p-0 text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]"
                          onClick={() => {
                            setEditingSubId(sub.id);
                            setEditingSubDraft(sub.name);
                          }}
                        >
                          <PencilIcon className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--ui-border)] bg-[var(--arbok-surface)] px-6 py-3.5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--ui-muted-foreground)] select-none">
            <Checkbox
              checked={keepOriginalShowNames}
              onCheckedChange={(next) =>
                onKeepOriginalShowNamesChange(next === true)
              }
              className="arbok-cli-checkbox"
            >
              <CheckboxIndicator>
                <CheckIcon className="size-3" aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            <span>外文节目名不翻译</span>
          </label>

          <div className="flex items-center gap-2">
            <DialogClose className="border-transparent bg-transparent text-xs text-[var(--ui-muted-foreground)] hover:text-[var(--ui-foreground)]">
              关闭
            </DialogClose>
            <Button
              disabled={activeSelectedIds.length === 0}
              className="h-8 rounded-lg border-transparent px-4 text-xs font-medium text-white disabled:opacity-55"
              style={{
                background:
                  activeSelectedIds.length > 0
                    ? "var(--ui-destructive)"
                    : "light-dark(#d99b96, #7f3d39)",
              }}
              onClick={async () => {
                await onUnsubscribeMany(activeSelectedIds);
                setSelectedIds([]);
              }}
            >
              取消订阅
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
