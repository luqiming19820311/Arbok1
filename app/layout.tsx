import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arbok — 全平台音视频知识播放器",
  description:
    "本地优先的 macOS 播客、YouTube 与哔哩哔哩统一播放器，支持双语字幕联动、AI 导读与问答、Markdown 笔记导出。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      data-theme="light"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/style.min.css"
        />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
