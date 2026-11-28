import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { expect, test, vi } from "vitest";
import { ArbokApp } from "./arbok-app";
import { disableYouTubeCaptions, type YtPlayerInstance } from "./youtube-hd-player";

let approveConfirm = false;
const agent = createAgent({
  allow: (step) => !step.confirm || approveConfirm,
});

test("an agent can inspect every control across home, player, and Phase 2 AI/ASR settings", async () => {
  render(<ArbokApp />);

  expect(screen.getByText("接下来听")).toBeTruthy();
  expect(screen.getByText("最新单集")).toBeTruthy();
  expect(screen.getByText("为你推荐")).toBeTruthy();
  expect(screen.getByText("订阅节目")).toBeTruthy();

  const listSnapshot = agent
    .snapshot()
    .filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of listSnapshot) {
    expect(
      entry.label,
      `${entry.component} ${entry.ref} has no name`
    ).toBeTruthy();
  }

  const listLabels = listSnapshot.map((entry) => entry.label);
  for (const required of [
    "添加链接 / 订阅",
    "按平台筛选",
    "搜索单集或频道",
    "继续播放",
    "订阅推荐 42章经",
    "偏好设置",
    "展开沉浸页",
  ]) {
    expect(listLabels, `${required} is missing from snapshot`).toContain(
      required
    );
  }

  const subRecResult = await agent.act({
    steps: [{ ref: "订阅推荐 42章经", action: "press" }],
  });
  expect(subRecResult.ok, subRecResult.error?.message).toBe(true);
  expect(screen.getByRole("button", { name: "退订推荐 42章经" })).toBeTruthy();

  const filterResult = await agent.act({
    steps: [{ ref: "按平台筛选", action: "setValue", args: ["B站"] }],
  });
  expect(filterResult.ok, filterResult.error?.message).toBe(true);
  expect(
    screen.getByRole("button", { name: /耗时半年，我们把一套 8K/ })
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /设计尊重人类注意力的安静软件/ })
  ).toBeNull();

  const openPlayerResult = await agent.act({
    steps: [
      { ref: "按平台筛选", action: "setValue", args: ["全部"] },
      { ref: "继续播放", action: "press" },
    ],
  });
  expect(openPlayerResult.ok, openPlayerResult.error?.message).toBe(true);

  const playerSnapshot = agent
    .snapshot()
    .filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of playerSnapshot) {
    expect(
      entry.label,
      `${entry.component} ${entry.ref} in player has no name`
    ).toBeTruthy();
  }

  const playerActions = await agent.act({
    steps: [
      { ref: "视频清晰度", action: "setValue", args: ["4K"] },
      { ref: "视频清晰度", action: "setValue", args: ["2K"] },
      { ref: "缩小视频画面", action: "press" },
      { ref: "放大视频画面", action: "press" },
      { ref: "谷歌翻译", action: "press" },
      { ref: "原文", action: "press" },
      { ref: "播报 TTS", action: "toggle" },
      { ref: "播报 TTS", action: "toggle" },
      { ref: "纯音频模式", action: "toggle" },
      { ref: "字幕显示语言", action: "setValue", args: ["无"] },
      { ref: "字幕显示语言", action: "setValue", args: ["纯中文"] },
      { ref: "翻译语言方向", action: "setValue", args: ["德文 → 中文"] },
      { ref: "翻译语言方向", action: "setValue", args: ["关闭"] },
      { ref: "翻译语言方向", action: "setValue", args: ["日文 → 中文"] },
      { ref: "重新翻译字幕", action: "press" },
      { ref: "单集阅读工作台", action: "select", args: ["AI 导读"] },
      { ref: "AI 导读模板", action: "setValue", args: ["技术与论文拆解"] },
      { ref: "重新生成导读", action: "press" },
    ],
  });
  expect(playerActions.ok, playerActions.error?.message).toBe(true);
  expect(screen.getByText("一句话总结")).toBeTruthy();

  const chatActions = await agent.act({
    steps: [
      { ref: "单集阅读工作台", action: "select", args: ["AI 问答"] },
      { ref: "AI 问答模型", action: "setValue", args: ["DeepSeek · deepseek-chat"] },
    ],
  });
  expect(chatActions.ok, chatActions.error?.message).toBe(true);

  const settingsResult = await agent.act({
    steps: [
      { ref: "偏好设置", action: "press" },
      { ref: "设置分类", action: "select", args: ["字幕"] },
      { ref: "显示内容", action: "setValue", args: ["无"] },
      { ref: "显示内容", action: "setValue", args: ["双语"] },
      { ref: "字幕字体", action: "setValue", args: ["霞鹜文楷"] },
      { ref: "视频上的字幕样式", action: "setValue", args: ["描边"] },
      { ref: "视频上的字幕样式", action: "setValue", args: ["无底"] },
      { ref: "音频节目提前显示下一句", action: "toggle" },
      { ref: "设置分类", action: "select", args: ["常规与存储"] },
      { ref: "外观主题", action: "setValue", args: ["深色模式"] },
      { ref: "设置分类", action: "select", args: ["AI 翻译"] },
      { ref: "选择 AI 服务商 Codex", action: "press" },
      { ref: "测试连接", action: "press" },
      { ref: "选择 AI 服务商 Claude Code", action: "press" },
      { ref: "选择 AI 服务商 Antigravity", action: "press" },
      { ref: "选择 AI 服务商 Google Gemini", action: "press" },
      { ref: "测试连接", action: "press" },
      { ref: "翻译方式", action: "setValue", args: ["精翻"] },
      { ref: "设置分类", action: "select", args: ["语音转写 (ASR)"] },
      { ref: "云端服务（更快，需要 Key，按量付费）", action: "press" },
      { ref: "本机模型（免费，音频不出本机）", action: "press" },
      { ref: "设置分类", action: "select", args: ["语音播报 (TTS)"] },
      { ref: "试听", action: "press" },
      { ref: "云端服务（豆包、DeepSeek、MiMo、通义、OpenAI、Edge 等）", action: "press" },
      { ref: "朗读语速", action: "setValue", args: ["1.25×"] },
      { ref: "设置分类", action: "select", args: ["常规与存储"] },
    ],
  });
  expect(settingsResult.ok, settingsResult.error?.message).toBe(true);
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

  approveConfirm = false;
  const blockedClear = await agent.act({
    steps: [
      { ref: "清理临时缓存", action: "press", args: ["确认清空缓存"] },
    ],
  });
  expect(blockedClear.ok).toBe(false);
  expect(screen.getByText(/412 MB/)).toBeTruthy();

  approveConfirm = true;
  const approvedClear = await agent.act({
    steps: [
      { ref: "清理临时缓存", action: "press", args: ["确认清空缓存"] },
    ],
  });
  expect(approvedClear.ok, approvedClear.error?.message).toBe(true);
  expect(screen.getByText(/0 MB/)).toBeTruthy();
}, 15_000);

test("supports URL import validation, ASR transcription, and inline note export", async () => {
  const user = userEvent.setup();
  render(<ArbokApp />);

  await user.click(screen.getByRole("button", { name: /添加链接 \/ 订阅/ }));
  await user.click(screen.getByRole("button", { name: "解析并加入" }));
  expect(
    screen.getByText("请输入或粘贴有效的播客、YouTube 或 B站链接。")
  ).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "填入 B站示例" }));
  expect(screen.getByText("已识别：B站")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "解析并加入" }));

  expect(screen.getByRole("tab", { name: "字幕" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: /B站单集/ })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "返回列表" }));
  const limuButtons = screen.getAllByRole("button", {
    name: /论文精读：长上下文大模型的 KV Cache 压缩与检索架构演进/,
  });
  await user.click(limuButtons[0]);
  expect(screen.getByText("该单集暂无官方字幕")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /开始转写字幕/ }));
  await waitFor(() => {
    expect(
      screen.getAllByText(/长上下文大模型 KV Cache 压缩的核心论文/).length
    ).toBeGreaterThan(0);
  });

  const regenBtn = screen.getByRole("button", { name: "重新生成" });
  expect(regenBtn).toBeTruthy();
  await user.click(regenBtn);
  await waitFor(() => {
    expect(screen.getByText("已重新生成带时间戳字幕")).toBeTruthy();
  });

  await user.click(screen.getByRole("button", { name: "为 00:00 记笔记" }));
  const noteBox = screen.getByLabelText("单句笔记（00:00）");
  await user.type(noteBox, "重点复盘 KV Cache 显存占比");
  await user.click(screen.getByRole("button", { name: "保存单句笔记" }));
  expect(
    screen.getAllByText(/重点复盘 KV Cache 显存占比/).length
  ).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "导出 MD" }));
  expect(
    screen.getByRole("dialog", { name: "导出 Markdown 笔记" }).textContent
  ).toContain("重点复盘 KV Cache 显存占比");
});

test("settings switch toggles via Space and dialog returns focus on close", async () => {
  const user = userEvent.setup();
  render(<ArbokApp />);

  const settingsTrigger = screen.getByRole("button", { name: /偏好设置/ });
  await user.click(settingsTrigger);

  const autoPlaySwitch = screen.getByRole("switch", {
    name: "自动连播下一集",
  });
  expect(autoPlaySwitch.getAttribute("aria-checked")).toBe("true");
  autoPlaySwitch.focus();
  await user.keyboard(" ");
  expect(autoPlaySwitch.getAttribute("aria-checked")).toBe("false");

  await user.click(screen.getByRole("button", { name: "关闭偏好设置" }));
  expect(document.activeElement).toBe(settingsTrigger);
});

test("manage subscriptions dialog supports custom folders, moving channels, and sidebar grouping", async () => {
  const user = userEvent.setup();
  render(<ArbokApp />);

  await user.click(screen.getByRole("button", { name: "管理订阅" }));
  expect(screen.getByRole("heading", { name: "管理订阅" })).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "新建文件夹" }));
  const folderInput = screen.getByLabelText("新文件夹名称");
  await user.type(folderInput, "科技类");
  await user.click(screen.getByRole("button", { name: "创建" }));

  expect(screen.getAllByText(/科技类/).length).toBeGreaterThan(0);

  const subCheckboxes = screen.getAllByRole("checkbox", {
    name: /选择订阅/,
  });
  await user.click(subCheckboxes[0]);
  await user.click(screen.getByRole("button", { name: "移动到分类" }));

  await user.click(screen.getByRole("button", { name: "关闭管理订阅" }));
  expect(screen.getByRole("button", { name: "收起分类 科技类" })).toBeTruthy();
});

test("supports Follow System theme mode and About tab with V0.2.1 OTA panel without OTA rules card", async () => {
  const user = userEvent.setup();
  render(<ArbokApp />);

  await user.click(screen.getByRole("button", { name: /偏好设置/ }));

  const followSystemBtn = screen.getByRole("radio", { name: "跟随系统" });
  expect(followSystemBtn).toBeTruthy();
  await user.click(followSystemBtn);
  expect(followSystemBtn.getAttribute("aria-checked")).toBe("true");

  await user.click(screen.getByRole("tab", { name: "关于" }));
  expect(screen.getByText(/版本 V0\.2\.1/)).toBeTruthy();
  expect(
    screen.getByText(
      /支持 YouTube、哔哩哔哩、播客，配中文字幕、翻译和播报、AI 导读、AI 问答、笔记等功能。/
    )
  ).toBeTruthy();
  expect(screen.getByText(/自动下载新版本，重启后生效/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /检查更新/ })).toBeTruthy();
  expect(screen.queryByText("OTA 仓库与版本规则")).toBeNull();
  const qrImg = screen.getByAltText("微信扫码赞赏与联系作者");
  expect(qrImg.getAttribute("src")).toBe("/wechat-qr.png");
});

test("hides built-in YouTube captions via unloadModule and track reset", () => {
  const unloadModule = vi.fn();
  const setOption = vi.fn();
  const mockPlayer = {
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    setPlaybackRate: vi.fn(),
    setVolume: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 100),
    getPlaybackQuality: vi.fn(() => "hd1080"),
    unloadModule,
    setOption,
    destroy: vi.fn(),
  } satisfies YtPlayerInstance;

  disableYouTubeCaptions(mockPlayer);
  expect(setOption).toHaveBeenCalledWith("captions", "track", {});
  expect(setOption).toHaveBeenCalledWith("cc", "track", {});
  expect(unloadModule).toHaveBeenCalledWith("captions");
  expect(unloadModule).toHaveBeenCalledWith("cc");
});

test("supports episode favorites (star, play all, unfavorite), collapsible subtitle panel, position memory, and Picture-in-Picture", async () => {
  const user = userEvent.setup();
  render(<ArbokApp />);

  // Home header integrates 收藏 seamlessly inside the platform segmented control
  const favTab = screen.getByRole("radio", { name: /收藏/ });
  expect(favTab).toBeTruthy();

  // Open current video episode (initial positionSec = 264 -> 04:24)
  await user.click(screen.getByRole("button", { name: "继续播放" }));
  expect(screen.getByText("04:24")).toBeTruthy();

  // Collapse and expand right subtitle panel via the button next to 导出 MD
  const collapseRightBtn = screen.getByRole("button", { name: "收起右侧字幕栏" });
  expect(collapseRightBtn).toBeTruthy();
  await user.click(collapseRightBtn);
  const expandRightBtn = await screen.findByRole("button", {
    name: "展开右侧字幕栏",
  });
  await user.click(expandRightBtn);
  expect(screen.getByRole("button", { name: "收起右侧字幕栏" })).toBeTruthy();

  const starToggle = screen.getByRole("button", { name: "收藏单集" });
  expect(starToggle).toBeTruthy();
  await user.click(starToggle);
  expect(screen.getByRole("button", { name: "取消收藏" })).toBeTruthy();

  // Toggle Picture-in-Picture and confirm live subtitle overlay stays rendered
  await user.click(screen.getByRole("button", { name: "画中画播放" }));
  expect(screen.getByTestId("pip-stage")).toBeTruthy();
  expect(screen.getByTestId("video-subtitle-overlay")).toBeTruthy();

  // Exit PiP via exit button
  const exitButtons = screen.getAllByRole("button", { name: "退出画中画" });
  await user.click(exitButtons[0]);
  expect(screen.queryByTestId("pip-stage")).toBeNull();
  expect(screen.getByTestId("video-stage")).toBeTruthy();

  // Return to home: MiniPlayer must retain the remembered position (04:24), never reset to 00:00
  await user.click(screen.getByRole("button", { name: "返回列表" }));
  expect(screen.getByText("04:24")).toBeTruthy();

  await user.click(screen.getByRole("radio", { name: /收藏/ }));

  expect(screen.getByRole("button", { name: /全部播放（1 集）/ })).toBeTruthy();
  expect(
    screen.getAllByRole("button", {
      name: /深度拆解 2026 本地优先 AI 智能体与上下文工程/,
    }).length
  ).toBeGreaterThanOrEqual(2);

  // Play all from favorites opens player and remembers position
  await user.click(screen.getByRole("button", { name: /全部播放（1 集）/ }));
  expect(screen.getByRole("tab", { name: "字幕" })).toBeTruthy();
  expect(screen.getByText("04:24")).toBeTruthy();

  // Back to favorites and unfavorite directly from the list
  await user.click(screen.getByRole("button", { name: "返回列表" }));
  const unstarBtn = screen.getByRole("button", {
    name: /取消收藏 深度拆解 2026 本地优先 AI 智能体与上下文工程/,
  });
  await user.click(unstarBtn);
  expect(screen.getByText("还没有收藏的单集")).toBeTruthy();
});

test("desktop OTA updater supports Stable/Beta channel switching, auto-download, and quitAndInstall inside About tab", async () => {
  const user = userEvent.setup();
  const quitAndInstall = vi.fn(async () => ({ ok: true }));
  const setAutoDownload = vi.fn(async (enabled: boolean) => enabled);
  const setUpdateChannel = vi.fn(async (channel: "stable" | "beta") => channel);
  const checkForUpdates = vi.fn(
    async (opts?: string | { repo?: string; channel?: "stable" | "beta" }) => {
      const channel =
        typeof opts === "object" && opts?.channel === "beta" ? "beta" : "stable";
      return channel === "beta"
        ? {
            status: "downloaded" as const,
            currentVersion: "0.2.1",
            latestVersion: "0.3.0-beta.1",
            channel: "beta" as const,
            isPrerelease: true,
            percent: 100,
            message: "新版本 V0.3.0-beta.1 已下载完成，重启后即可生效",
          }
        : {
            status: "downloaded" as const,
            currentVersion: "0.2.1",
            latestVersion: "0.2.2",
            channel: "stable" as const,
            isPrerelease: false,
            percent: 100,
            message: "新版本 V0.2.2 已下载完成，重启后即可生效",
          };
    }
  );

  const prevDesktop = (window as unknown as { arbokDesktop?: unknown }).arbokDesktop;
  (window as unknown as { arbokDesktop?: unknown }).arbokDesktop = {
    isDesktop: true,
    getUpdateState: vi.fn(async () => ({ status: "idle" })),
    checkForUpdates,
    setAutoDownload,
    setUpdateChannel,
    quitAndInstall,
    onUpdateEvent: vi.fn(() => () => {}),
  };

  try {
    render(<ArbokApp />);
    await user.click(screen.getByRole("button", { name: /偏好设置/ }));
    await user.click(screen.getByRole("tab", { name: "关于" }));

    const betaCheckbox = screen.getByRole("checkbox", {
      name: "接收测试版更新（Beta）",
    });
    expect(betaCheckbox.getAttribute("aria-checked")).toBe("false");
    await user.click(betaCheckbox);
    expect(betaCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(setUpdateChannel).toHaveBeenCalledWith("beta");

    await user.click(screen.getByRole("button", { name: /检查更新/ }));

    expect(checkForUpdates).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "beta" })
    );
    const installBtn = await screen.findByRole("button", {
      name: /立即重启并安装 V0\.3\.0-beta\.1/,
    });
    await user.click(installBtn);
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  } finally {
    (window as unknown as { arbokDesktop?: unknown }).arbokDesktop = prevDesktop;
  }
});
