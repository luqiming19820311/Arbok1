# Arbok

支持 **YouTube、哔哩哔哩、播客（RSS / 小宇宙 / Apple 播客）与本地音视频**，提供中文字幕、翻译和播报、AI 导读、AI 问答、笔记管理与离线缓存等功能。本地优先架构，凭据仅存本机 macOS Keychain，业务数据持久化至本地 SQLite。

## 核心功能

- **多平台订阅与内容解析**：支持 YouTube、哔哩哔哩、小宇宙、Apple 播客、通用 RSS 与本地文件导入，支持自定义频道分类与批量订阅管理。
- **实时字幕与本地/云端 ASR**：优先拉取官方与 RSS 字幕；无字幕时支持本地离线 Whisper / 云端 ASR 自动分片转写，支持边转边看与「重新生成」字幕。
- **双语翻译与语音播报（TTS）**：支持流式上下文双语翻译、无/双语/纯中文/纯原文切换、可拖拽视频字幕浮层及多引擎语音播报。
- **AI 导读、AI 问答与时间轴笔记**：支持本机 CLI AI（Claude Code / Codex / Antigravity）及主流 API 模型，支持单句时间轴笔记与 Markdown 导出。
- **GitHub Releases OTA 自动升级检测**：内置 SemVer 版本比对，遵循 `V主版本.次版本.修订号` 升级规范（自 `V0.1.0` 起步）。

## 本地开发运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

运行质量检查与全量测试：

```bash
npm run lint && npx tsc --noEmit && npm test
```

## 版本命名与 OTA 发布流程

版本号遵循 SemVer 语义化版本规范：

- `v0.1.0`：首个可用内测版本
- `v0.1.1`：Bug 修复、解析适配与体验优化（Patch）
- `v0.2.0`：新增功能特性（Minor）
- `v1.0.0`：正式里程碑版本（Major）

发布新版本步骤：

1. 同步更新 `package.json` 的 `"version"` 与 `lib/server/updates.ts` 的 `APP_VERSION`。
2. 提交代码并打上对应 Tag 推送：
   ```bash
   git tag v0.1.1
   git push origin main --tags
   ```
3. GitHub Actions（`.github/workflows/release.yml`）将自动校验版本一致性、执行测试并发布 GitHub Release（含 `latest.json` OTA 元数据；后续封装桌面端后将同步挂载 `.dmg` / `.zip` / `latest-mac.yml` 安装包）。
