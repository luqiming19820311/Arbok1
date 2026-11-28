"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { KeyboardIcon, XIcon } from "lucide-react";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUT_GROUPS: Array<{
  title: string;
  items: Array<{ keys: string[]; label: string }>;
}> = [
  {
    title: "播放控制",
    items: [
      { keys: ["Space"], label: "播放 / 暂停当前单集" },
      { keys: ["←", "→"], label: "快退 10 秒 / 快进 10 秒" },
      { keys: ["Shift", "← / →"], label: "快退 30 秒 / 快进 30 秒" },
      { keys: ["[", "]"], label: "降低 / 提高播放倍速（按频道自动记忆）" },
      { keys: ["F8 / 媒体键"], label: "macOS 键盘媒体键与控制中心联动控制" },
    ],
  },
  {
    title: "沉浸播放页",
    items: [
      { keys: ["C"], label: "循环切换字幕模式（双语 → 纯中文 → 纯原文）" },
      { keys: ["A"], label: "YouTube / B站 / 本地视频切换「视频 / 纯音频」" },
      { keys: ["P"], label: "开启 / 退出视频画中画（支持中英字幕浮窗）" },
      { keys: ["⌘", "F"], label: "聚焦当前文稿内搜索框" },
    ],
  },
  {
    title: "全局效率",
    items: [
      { keys: ["⌘", "N"], label: "打开「添加链接 / 订阅 / 本地文件」弹窗" },
      { keys: ["⌘", ","], label: "打开 Arbok 偏好设置" },
      { keys: ["⌘", "/"], label: "打开 / 关闭快捷键速查表" },
      { keys: ["⌘", "F"], label: "列表页聚焦全局搜索（支持单集、字幕与笔记）" },
      { keys: ["Esc"], label: "关闭当前弹窗或浮层" },
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        shortcut="mod+/"
        aria-label="快捷键速查表"
        className="size-8 shrink-0 border-transparent bg-transparent"
      >
        <KeyboardIcon className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="arbok-dialog-standard">
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-3.5">
          <div>
            <DialogTitle className="text-[15px] font-semibold text-[var(--ui-foreground)]">
              键盘快捷键速查表
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
              支持全局快捷键与 macOS 硬件媒体键（F8 播放暂停 / 系统控制中心）
            </DialogDescription>
          </div>
          <DialogClose aria-label="关闭快捷键速查表">
            <XIcon className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="flex max-h-[68vh] flex-col gap-5 overflow-y-auto p-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-[var(--ui-muted-foreground)]">
                {group.title}
              </h3>
              <div className="flex flex-col divide-y divide-[var(--ui-border)] rounded-xl border border-[var(--ui-border)] bg-[var(--arbok-surface)]">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-xs"
                  >
                    <span className="text-[var(--ui-foreground)]">
                      {item.label}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded border border-[var(--ui-border)] bg-[var(--ui-muted)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ui-foreground)]"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
