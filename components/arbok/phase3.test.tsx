import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { expect, test } from "vitest";
import { ArbokApp } from "./arbok-app";
import { detectPlatformFromUrl } from "./mock-data";

const agent = createAgent();

test("Phase 3 UI: shortcuts cheat sheet, local media import, play queue, per-channel speed, offline view, and global transcript search", async () => {
  const user = userEvent.setup();
  render(<ArbokApp />);

  await user.click(screen.getByRole("button", { name: "快捷键速查表" }));
  expect(screen.getByText("键盘快捷键速查表")).toBeTruthy();
  expect(screen.getByText(/macOS 键盘媒体键与控制中心/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "关闭快捷键速查表" }));

  const searchInput = screen.getByRole("searchbox", { name: "搜索单集或频道" });
  await user.type(searchInput, "Markdown");
  expect(screen.getByText(/跨全库字幕与笔记命中/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "清空列表搜索" }));

  await user.click(screen.getByRole("button", { name: /待播队列（0 期）/ }));
  expect(screen.getByText("接下来播放（Play Next）")).toBeTruthy();
  const quickAddBtns = screen.getAllByRole("button", { name: /加入待播队列/ });
  expect(quickAddBtns.length).toBeGreaterThan(0);
  await user.click(quickAddBtns[0]);
  expect(screen.getByRole("button", { name: /待播队列（1 期）/ })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "清空待播队列" }));
  await user.click(screen.getByRole("button", { name: "关闭待播队列" }));

  await user.click(screen.getByRole("button", { name: /添加链接 \/ 订阅/ }));
  await user.click(screen.getByRole("tab", { name: "本地文件" }));
  const fileInput = screen.getByLabelText("选择本地音视频文件");
  const badFile = new File(["hello"], "doc.txt", { type: "text/plain" });
  fireEvent.change(fileInput, { target: { files: [badFile] } });
  expect(screen.getByText(/暂不支持该格式/)).toBeTruthy();

  const goodFile = new File(["ID3-AUDIO"], "podcast-recording.mp3", {
    type: "audio/mpeg",
  });
  fireEvent.change(fileInput, { target: { files: [goodFile] } });
  await user.click(screen.getByRole("button", { name: "导入并开始播放" }));
  expect(
    screen.getByRole("heading", { name: "podcast-recording" })
  ).toBeTruthy();
  expect(screen.getByText("本地离线")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "返回列表" }));
  const firstChannelBtn = screen.getAllByRole("button", {
    name: /深度拆解 2026 本地优先 AI 智能体与上下文工程/,
  })[0];
  await user.click(firstChannelBtn);
  const speedRes = await agent.act({
    steps: [{ ref: "播放倍速", action: "setValue", args: ["1.5x"] }],
  });
  expect(speedRes.ok, speedRes.error?.message).toBe(true);

  await user.click(screen.getByRole("button", { name: "返回列表" }));
  const otherBtn = screen.getAllByRole("button", {
    name: /耗时半年，我们把一套 8K/,
  })[0];
  await user.click(otherBtn);
  expect(screen.getByText("1.0x")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "返回列表" }));
  const backToFirstBtn = screen.getAllByRole("button", {
    name: /深度拆解 2026 本地优先 AI 智能体与上下文工程/,
  })[0];
  await user.click(backToFirstBtn);
  expect(screen.getByText("1.5x")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "返回列表" }));
  await user.click(screen.getByRole("button", { name: /离线下载/ }));
  expect(screen.getByText("离线媒体与本地文件（断网可用）")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "管理缓存上限" }));
  const settingsDialog = screen.getByRole("dialog", { name: "Arbok 偏好设置" });
  expect(settingsDialog.className).toContain("arbok-dialog-fullscreen");
  const limitRes = await agent.act({
    steps: [{ ref: "临时缓存上限", action: "setValue", args: ["10 GB"] }],
  });
  expect(limitRes.ok, limitRes.error?.message).toBe(true);
  expect(screen.getByText(/\/ 10 GB/)).toBeTruthy();

  expect(detectPlatformFromUrl("rsshub://bilibili/user/video/520819684")).toBe(
    "bilibili"
  );
  expect(detectPlatformFromUrl("https://space.bilibili.com/615957867?")).toBe(
    "bilibili"
  );
});
