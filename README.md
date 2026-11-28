# Arbok

支持 **YouTube、哔哩哔哩、播客（RSS / 小宇宙 / Apple 播客）与本地音视频**，提供中文字幕、翻译和播报、AI 导读、AI 问答、笔记管理与离线缓存等功能。本地优先架构，凭据仅存本机 macOS Keychain，业务数据持久化至本地 SQLite。

## 核心功能

- **多平台订阅与内容解析**：支持 YouTube、哔哩哔哩、小宇宙、Apple 播客、通用 RSS 与本地文件导入，支持自定义频道分类与批量订阅管理。
- **实时字幕与本地/云端 ASR**：优先拉取官方与 RSS 字幕；无字幕时支持本地离线 Whisper / 云端 ASR 自动分片转写，支持边转边看与「重新生成」字幕。
- **双语翻译与语音播报（TTS）**：支持流式上下文双语翻译、无/双语/纯中文/纯原文切换、可拖拽视频字幕浮层及多引擎语音播报。
- **AI 导读、AI 问答与时间轴笔记**：支持本机 CLI AI（Claude Code / Codex / Antigravity）及主流 API 模型，支持单句时间轴笔记与 Markdown 导出。
- **GitHub Releases 双通道 OTA 自动升级**：内置 SemVer 版本比对，支持 **正式版（Stable）** 与 **测试版（Beta / Pre-release）** 双通道自动检查、后台静默下载与重启替换安装。

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

## 版本管理与双通道 OTA 发布流程

### 分支与版本规则

- **`main` 分支（正式版 Stable）**：对应正式 Tag（如 `v0.2.2`、`v0.3.0`、`v1.0.0`），发布为 GitHub Official Release（`Latest`），所有默认用户通过 OTA 自动获取。
- **`beta` 分支（测试版 Beta）**：对应预发布 Tag（如 `v0.3.0-beta.1`、`v0.3.0-beta.2`），GitHub Actions 自动标记为 **Pre-release**，**不会**推送给正式版用户；仅在应用「偏好设置 → 关于」中勾选 **「接收测试版更新（Beta）」** 的测试机才会收到。

版本号遵循 SemVer 语义化版本规范：

- `v0.2.x`：Bug 修复、解析适配与体验优化（Patch）
- `v0.3.0-beta.1`：新功能测试版（Pre-release）
- `v0.3.0`：测试验证通过后转正发布（Minor）
- `v1.0.0`：正式里程碑版本（Major）

### 一键升级版本号并发布

使用内置脚本自动同步 `package.json`、`package-lock.json` 与 `lib/arbok/version.ts`：

```bash
# 1. 发布测试版（在 beta 分支操作）
git checkout beta
npm run release:bump -- beta-minor   # 例如 0.2.1 -> 0.3.0-beta.1（后续迭代用 -- beta）
git add package.json package-lock.json lib/arbok/version.ts
git commit -m "chore(release): bump version to v0.3.0-beta.1"
git tag v0.3.0-beta.1
git push origin beta v0.3.0-beta.1

# 2. 测试无误后，合并回 main 并转正发布正式版 OTA
git checkout main
git merge beta
npm run release:bump -- promote      # 0.3.0-beta.1 -> 0.3.0（独立修 Bug 可直接用 -- patch）
git add package.json package-lock.json lib/arbok/version.ts
git commit -m "chore(release): release v0.3.0"
git tag v0.3.0
git push origin main v0.3.0
```

推送 Tag 后，GitHub Actions（`.github/workflows/release.yml`）会自动：
1. 校验 Git Tag、`package.json` 与 `lib/arbok/version.ts` 的版本一致性；
2. 执行 `next typegen`、`lint`、`tsc --noEmit` 与全量 Vitest 测试；
3. 打包 macOS arm64 `.dmg` 与 `.zip` 并生成 `latest.json`（Beta 版同步生成 `beta.json`）；
4. 自动按 Tag 是否包含 `-` 决定发布为 **Pre-release（Beta 通道）** 或 **Latest Official Release（Stable 通道）**。
