"use client";

import { Button } from "@ui-sdk/react/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { CopyIcon, DownloadIcon, XIcon } from "lucide-react";

interface ExportMarkdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  markdown: string;
  onCopy: () => void;
  onDownload: () => void;
}

export function ExportMarkdownDialog({
  open,
  onOpenChange,
  title,
  markdown,
  onCopy,
  onDownload,
}: ExportMarkdownDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop />
      <DialogContent keepMounted className="arbok-dialog-wide">
        <div className="flex items-center justify-between border-b border-[var(--ui-border)] px-5 py-3.5">
          <div>
            <DialogTitle className="text-[15px] font-semibold text-[var(--ui-foreground)]">
              导出 Markdown 笔记
            </DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-[var(--ui-muted-foreground)]">
              已按 Obsidian / Notion 兼容格式生成 Frontmatter、导读与带时间戳笔记（{title}）
            </DialogDescription>
          </div>
          <DialogClose aria-label="关闭导出预览">
            <XIcon className="size-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <div className="p-5">
          <pre className="tabular-nums max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--ui-border)] bg-[var(--ui-muted)] p-4 text-xs leading-relaxed text-[var(--ui-foreground)] select-text">
            {markdown}
          </pre>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--ui-border)] px-5 py-3">
          <DialogClose>关闭预览</DialogClose>
          <Button onClick={onDownload}>
            <DownloadIcon className="size-3.5" aria-hidden="true" />
            保存 .md 文件
          </Button>
          <Button data-variant="solid" onClick={onCopy}>
            <CopyIcon className="size-3.5" aria-hidden="true" />
            一键复制全文
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
