# 产品需求文档（PRD）：全平台音视频知识播放器 — Arbok

> **文档版本**：v1.0  
> **目标平台**：macOS（基于 Tauri 2，架构天然保留跨平台扩展能力）  
> **技术栈**：Tauri 2 (Rust) + React + TypeScript + Vite + Tailwind CSS + shadcn/ui + SQLite  
> **开发协作模式**：AI 主导编码实现，产品负责人（用户）主导需求把控与里程碑验收  
> **参考对标**：[`joeseesun/subcast`](https://github.com/joeseesun/subcast)（吸收其本地优先、双语字幕与 AI 导读体验，原生补齐哔哩哔哩生态，剥离英语刷词/跟读模块，强化笔记与知识沉淀）

---

## 1. 产品概述与定位

### 1.1 一句话定位
一款面向 macOS 的**本地优先（Local-First）全平台长音视频知识消费器**，统一订阅与播放 **播客（Apple Podcasts / RSS / 小宇宙）、YouTube 与 哔哩哔哩（B站）**，通过「纯净无广告播放 + 毫秒级联动双语字幕 + AI 导读/问答 + Markdown 笔记导出」，把几小时的长音频/长视频变成可浏览、可跳读、可检索、可沉淀的知识资料。

### 1.2 核心痛点与价值主张
| 用户痛点 | 本产品解法 |
| :--- | :--- |
| 播客、YouTube、B站分散在不同 App/网页，进度难统一、切换繁琐 | **统一内容模型与单窗口三栏管理**：三平台订阅与单链接收敛到同一个收件箱和播放器 |
| 外语播客/YouTube 生肉门槛高；中文长视频信息密度低、找不到重点 | **官方字幕优先 + 双引擎 ASR 转写 + 双语对照 + AI 章节时间线/摘要**，先看导读再决定听哪段 |
| 听到好观点很难定位原处，记笔记要反复暂停切应用 | **点击任意字幕/AI 时间戳秒级跳转**，划句一键记笔记，一键导出适配 Obsidian/Notion 的 Markdown |
| 网页端广告多、代理难统一、B站高画质与 AI 字幕受限 | **Rust 后端统一代理 + 扫码登录存系统钥匙串 + 自研纯净播放器**（支持视频/纯音频一键切换） |

### 1.3 明确不做的范围（Non-Goals，v1 严格克制）
为防止功能膨胀导致项目失控，以下功能**明确排除在 v1 范围之外**：
* ❌ 英语学习套件（生词分级高亮、单词释义词卡、FSRS 记忆曲线复习、跟读发音打分）
* ❌ 社区/云端账号体系（共享字幕云端服务器、多端云同步）
* ❌ AI 精读长文改写 + TTS 朗读、金句分享海报生成（留作 v2 备选）
* ❌ 弹幕系统、评论区互动、B站/YouTube 点赞投币等社交功能
* ❌ 苹果付费开发者签名公证（首版面向个人主力自用与本地构建，后续开源时按需补齐）

---

## 2. 目标用户与核心用户路径（User Flows）

### 2.1 路径 A：添加内容与订阅
1. 用户点击左侧栏「`+ 添加`」按钮（或按 `⌘N`），弹出统一输入弹窗。
2. 用户执行以下任一操作：
   * **粘贴链接**：自动识别为「播客 RSS / 小宇宙单集或播客 / YouTube 频道·播放列表·单视频 / B站 UP主主页·单视频（BV/AV/b23.tv）」。
   * **关键词搜索播客**：实时调用 Apple Podcasts（iTunes Search API）返回中英文播客列表。
3. 若为频道/播客/UP主：点击「订阅」，立即拉取最近 N 期（默认 20 期）入库并展示在收件箱。
4. 若为单集/单视频：直接解析元数据并加入「单集/临时队列」，可直接点播，不强制订阅整个频道。

### 2.2 路径 B：沉浸观看 / 收听与字幕联动
1. 用户在收件箱或订阅列表点击任意单集，进入**左右 50/50 分栏沉浸播放页**。
2. Rust 后端检测本地缓存或实时调用解析器获取媒体流（YouTube 走配置代理，B站附带 Referer 与 Keychain 中的 Cookie），通过本地代理流服务稳定起播。
3. 播客自动展示大尺寸封面；YouTube/B站默认播视频，点击「纯音频」可立即切为音频模式省电/后台听。
4. 右侧字幕面板自动按优先级加载字幕：
   * **有官方字幕**：秒级加载展示；外语内容可一键触发「双语翻译」。
   * **无官方字幕**：展示清晰引导按钮「开始转写字幕」，调用已选的云端或本地 ASR 引擎后台转写（不阻塞播放）。
5. 播放期间当前句高亮并平滑滚动居中；点击任意句子立即跳转对应秒数；按 `C` 键在「双语 / 纯中文 / 纯原文」之间循环切换；按 `⌘F` 在全文稿内搜索定位。

### 2.3 路径 C：AI 导读、问答与笔记沉淀
1. 用户切至右侧「**AI 导读**」Tab，点击「生成导读」，AI 基于完整字幕流式输出：**一句话总结、带时间戳的章节时间线、核心观点清单、「先听这几段」精选片段**。点击任意时间戳直接跳播。
2. 用户切至「**AI 问答**」Tab，针对整期内容连续追问（如“嘉宾为什么反对这个架构？”），AI 回答附带 `[MM:SS]` 引用徽标，点击徽标直接跳到原声片段核对。
3. 用户在字幕区悬停或选中任意句子，点击「记笔记/收藏」可添加批注；点击右上角「**导出 Markdown**」，生成含元数据 Frontmatter、AI 导读、个人笔记与带时间戳摘录的 `.md` 文件，一键复制或保存至 Obsidian 文件夹。

---

## 3. 功能需求清单与分阶段里程碑

> 严格按 **Phase 1 → Phase 2 → Phase 3** 推进，每个阶段结束必须跑通对应**验收标准**后再进入下一阶段。

### Phase 1：MVP 闭环（统一订阅 + 纯净播放 + 官方字幕联动）

| 模块 | 优先级 | 功能描述 | 验收标准（DoD） |
| :--- | :---: | :--- | :--- |
| **内容解析与订阅** | P0 | 支持粘贴单链接并自动识别：Podcast RSS、Apple Podcasts 搜索、小宇宙单集/播客、YouTube 频道/播放列表/单视频、B站 UP主主页/单视频（含 b23.tv 短链） | 粘贴三平台合法链接 100% 正确识别平台类型，解析出标题、封面、时长、发布时间并入库 |
| **订阅刷新** | P0 | 手动全局/单频道刷新最新单集；支持取消订阅与分组筛选（全部 / 播客 / YouTube / B站） | 刷新不产生重复单集，新单集按发布时间倒序出现在「最新更新」 |
| **纯净统一播放器** | P0 | 自研统一播放控制条：播放/暂停、拖拽进度、快退/快进 15 秒、倍速（0.5x~3.0x）、音量、YouTube/B站「视频 ↔ 纯音频」一键切换 | 播客、YouTube、B站均可在 App 内无广告稳定起播、拖拽进度不卡死、切换纯音频不断流 |
| **进度记忆与迷你条** | P0 | 每 5 秒及暂停/退出时保存播放进度；切换列表页时底部常驻 64px 迷你播放条 | 关闭 App 重开后，点击上次播放的单集可精确续播；浏览列表时音频不中断 |
| **官方字幕联动** | P0 | 自动拉取 YouTube 官方/自动字幕、B站官方 CC/AI 字幕（BCC JSON）、Podcast RSS 字幕；右侧面板高亮跟随、点击句跳播、`⌘F` 文稿搜索 | 播放时当前句准确高亮居中；手动滚屏查看历史字幕时暂不抢焦点，提供「回到当前句」按钮 |
| **代理与 B站鉴权** | P0 | 设置页支持配置系统代理/自定义 HTTP·SOCKS5 代理（供 YouTube 使用）；B站支持**手机扫码登录** + **手动粘贴 Cookie** 备用，凭证存入 macOS Keychain | 填入代理后 YouTube 解析与播放正常；B站扫码登录后可拉取 1080P 画质及官方 AI 字幕，重启 App 登录态保持 |
| **环境检测** | P0 | 自动检测内置 sidecar 或本机 `yt-dlp` / `ffmpeg` 可用性，缺失时在设置页清晰提示路径或一键安装指引 | 环境检测页能准确反馈 `yt-dlp`、`ffmpeg` 版本与可用状态 |

### Phase 2：核心智能体验（双引擎 ASR + 双语字幕 + AI 导读/问答 + 笔记导出）

| 模块 | 优先级 | 功能描述 | 验收标准（DoD） |
| :--- | :---: | :--- | :--- |
| **云端 ASR 转写** | P0 | 无官方字幕时，支持调用云端 ASR API（预置硅基流动 SenseVoice/Whisper、Groq Whisper、OpenAI Whisper、豆包等，兼容 OpenAI Audio API），自动下载音频、切分并生成带精准时间戳字幕 | 对一条 30 分钟无字幕英文播客或中文播客，能后台完成转写并写入 SQLite，失败支持断点重试 |
| **本地离线 ASR** | P1 | 集成独立子进程本地 ASR 引擎（`whisper.cpp` 或 `Qwen3-ASR`），支持在设置页下载/管理模型并一键切换「云端 / 本地」引擎；子进程崩溃不影响主 App | 断网状态下可对本地已缓存音频完成离线转写；强杀 ASR 子进程时主 App 不闪退并正确报错 |
| **LLM BYOK 配置** | P0 | 统一 OpenAI-compatible + 主流原生适配器，预置 DeepSeek、Kimi、通义千问、智谱、OpenAI、Gemini、Claude、OpenRouter 及本地 Ollama / LM Studio；API Key 存 Keychain，支持连通性测试 | 配置任意预置服务商后点击「测试连接」返回延迟与成功状态，不把明文 Key 写入 SQLite |
| **双语字幕翻译** | P0 | 针对非中文内容，按语义分块+上下文窗口调用 LLM 批量翻译为中文；结果持久化到 SQLite；快捷键 `C` 在「双语 / 纯中文 / 纯原文」间切换 | 翻译过程中支持流式逐步显示已译段落；二次打开同一单集直接读缓存零 Token 消耗 |
| **AI 导读** | P0 | 一键生成结构化导读：一句话总结、章节时间线（带 `[MM:SS]`）、核心观点、推荐必听片段；支持自定义/切换提示词模板及重新生成 | 点击导读中的任意时间戳，播放器精准跳转并开始播放；导读结果持久化缓存 |
| **AI 问答** | P0 | 基于整期字幕上下文的多轮流式对话（超长文稿采用分段检索/压缩策略防超上下文）；预置 3~4 个快捷提问按钮；回答内 `[MM:SS]` 自动渲染为可点击跳转徽标 | 追问细节问题能准确引用原文时间点，点击徽标立即跳转原音频验证；聊天记录按单集保存 |
| **划句笔记与导出** | P0 | 字幕单句支持高亮标记 + 写个人批注；支持全局「收藏/笔记」汇总视图；单集一键导出标准 Markdown（含 YAML Frontmatter、原始链接、AI 导读、带时间戳的笔记与摘录） | 导出的 `.md` 文件拖入 Obsidian 或 Notion 格式完美渲染，保留原文链接与时间戳 |

### Phase 3：体验打磨与扩展（离线管理 + 本地文件 + 深度细节）

| 模块 | 优先级 | 功能描述 | 验收标准（DoD） |
| :--- | :---: | :--- | :--- |
| **离线下载与缓存治理** | P1 | 支持手动下载单集音视频离线播放（支持队列、暂停/取消）；设置页可查看缓存占用、设置缓存上限（如 5GB/10GB）并一键清理过期缓存 | 断网时已下载单集可流畅播放且字幕/AI导读完整可用；超上限自动按 LRU 清理临时缓存（不删手动离线下载项） |
| **本地音视频导入** | P2 | 支持拖拽本地 `.mp3 / .m4a / .wav / .mp4 / .mov` 文件入库，复用播放器、ASR 转写、AI 导读与笔记全套能力 | 拖入任意常见本地音视频文件后可立即播放并触发字幕转写与 AI 分析 |
| **macOS 桌面细节** | P2 | 完整快捷键速查表（`⌘/`）、macOS 原生媒体控制键（Play/Pause/Next）集成、单集自动连播队列（Play Next）、播放速度按频道记忆 | 锁屏或切到其他窗口时，Mac 键盘 F8 播放键与控制中心可控制播放暂停 |

---

## 4. 界面设计与交互规范（UI/UX Spec）

### 4.1 视觉基调（macOS 原生极简阅读风）
* **主题模式**：支持「浅色 / 深色 / 跟随系统（默认）」，禁止刺眼纯黑（`#000000`）与纯白高反差，采用苹果 HIG 风格的柔和层级灰。
  * 浅色模式参考：主背景 `#FFFFFF`、侧栏半透明磨砂 `#F5F5F7`、卡片/悬停 `#F2F2F7`、主文字 `#1D1D1F`、次文字 `#6E6E73`。
  * 深色模式参考：主背景 `#1C1C1E`、侧栏半透明磨砂 `#161618`、卡片/悬停 `#2C2C2E`、主文字 `#F5F5F7`、次文字 `#98989D`。
  * 品牌强调色：克制的冷蓝或靛蓝（如 `#0A84FF` / `#5E5CE6`），仅用于当前高亮句左侧指示条、主按钮与进度条；平台徽标使用极小色点或柔和徽章区分（播客紫 / YouTube 红 / B站粉）。
* **字体与排版**：
  * UI 与正文：优先系统字体 `-apple-system, BlinkMacSystemFont, "PingFang SC", "SF Pro Text", sans-serif`。
  * 时间戳与进度读数：等宽数字（`font-variant-numeric: tabular-nums`），防止数字跳动造成视觉抖动。
  * 字幕区行高宽松（1.6~1.7），双语模式下**译文与原文通过字重和明度拉开主次**，长时间阅读不疲劳。
* **窗口质感**：采用 macOS 隐形标题栏（`titleBarStyle: "Overlay"`），红绿灯按钮自然融入左侧半透明毛玻璃侧栏顶部。

### 4.2 页面布局线框图

#### 视图一：内容列表态（收件箱 / 订阅频道）
```text
┌──────────────────┬─────────────────────────────────────────────────────────┐
│ ● ● ●       [折叠]│  [全部] [播客] [YouTube] [B站]        🔍 全局搜索   [刷新] │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ [+ 添加链接/订阅] │ ┌─────────────────────────────────────────────────────┐ │
│                  │ │ [封面]  单集标题文本...                      [B站]    │ │
│ 📥 最新更新   12 │ │ 16:9   UP主名称 · 2小时前 · 48:20           [有字幕] │ │
│ ▶️ 继续播放    3 │ │        ████░░░░░░ 35%                       [AI导读] │ │
│ ⭐ 收藏与笔记    │ └─────────────────────────────────────────────────────┘ │
│ ⬇️ 离线下载      │ ┌─────────────────────────────────────────────────────┐ │
│                  │ │ [封面]  Lex Fridman #450 ...               [YouTube] │ │
│ ── 我的订阅 ──── │ │        Lex Fridman · 昨天 · 02:15:00        [双语]   │ │
│ 🟣 科技早知道    │ └─────────────────────────────────────────────────────┘ │
│ 🔴 Andrew Ng     │                                                         │
│ 🩷 影视飓风      │                                                         │
│                  │                                                         │
│ ⚙ 设置           │                                                         │
├──────────────────┴─────────────────────────────────────────────────────────┤
│ [小封面] 正在播放的单集标题...         ⏮15  ▶️  ⏭15   01:12:05 ━━━━●━━ 02:15 │
│          频道名                        1.25x  🔊   [展开沉浸页 ▲]            │
└────────────────────────────────────────────────────────────────────────────┘
```

#### 视图二：沉浸播放态（核心工作台，左右可拖拽 50/50 分栏）
```text
┌───────────────────────────┬────────────────────────────────────────────────┐
│ ← 返回列表   [B站] 影视飓风│  [ 字幕 ]  [ AI 导读 ]  [ AI 问答 ]  [ 笔记 ] │
├───────────────────────────┼────────────────────────────────────────────────┤
│                           │  [双语 ▾] [🔍 文稿搜索] [自动滚动:开] [导出 MD]  │
│  ┌─────────────────────┐  ├────────────────────────────────────────────────┤
│  │                     │  │  04:08  And when you look at the architecture  │
│  │    16:9 视频画面     │  │        当你观察这个系统架构时                 │
│  │  (播客模式为方形封面 │  │                                                │
│  │   + 柔和投影)       │  │▌ 04:12  the bottleneck is never the UI layer.  │
│  │                     │  │▌       瓶颈从来都不在界面层。  [⭐记笔记] [复制] │
│  └─────────────────────┘  │                                                │
│                           │  04:18  It's always how you stream & cache.    │
│  单集完整标题展示          │        问题总是出在流式传输和缓存策略上。       │
│  发布日期 · 时长 · 原链接  │                                                │
│                           │  04:25  ...                                    │
│  ━━━━━━━━━━●━━━━━━━━━━━━  │                                                │
│  04:12             48:20  │                                                │
│  ⏮15   ⏸   ⏭15   1.25x   │                                                │
│  [🎧 纯音频] [1080P ▾] [⬇]│                                [↓ 回到当前播放句] │
└───────────────────────────┴────────────────────────────────────────────────┘
```

### 4.3 键盘快捷键规范
| 快捷键 | 作用域 | 行为 |
| :--- | :--- | :--- |
| `Space` | 全局（非输入框） | 播放 / 暂停 |
| `←` / `→` | 全局（非输入框） | 快退 10 秒 / 快进 10 秒（`Shift`+方向键为 30 秒） |
| `[` / `]` | 全局 | 降低 / 提高播放倍速（步进 0.25x） |
| `C` | 沉浸播放页 | 循环切换字幕模式：双语 → 纯中文 → 纯原文 |
| `A` | 沉浸播放页 | YouTube/B站 切换「视频 / 纯音频」模式 |
| `⌘F` | 沉浸播放页 / 列表 | 聚焦当前文稿搜索框 / 全局搜索框 |
| `⌘N` | 全局 | 打开「添加链接 / 订阅」弹窗 |
| `⌘,` | 全局 | 打开设置页 |
| `Esc` | 弹窗 / 搜索 | 关闭弹窗或清空搜索 |

---

## 5. 技术架构与核心实现设计（面向 AI 开发指导）

### 5.1 工程目录规划
```text
arbok/
├── src/                          # React + TypeScript 前端
│   ├── components/               # shadcn/ui 基础组件 + 业务组件
│   │   ├── layout/               # Sidebar, MiniPlayer, SplitPane
│   │   ├── player/               # MediaPlayer, ControlBar, AudioCover
│   │   ├── transcript/           # VirtualTranscriptList, SubtitleRow, NotePopover
│   │   └── ai/                   # AiGuidePanel, AiChatPanel, MarkdownExport
│   ├── stores/                   # Zustand 全局状态 (playerStore, libraryStore, settingsStore)
│   ├── lib/                      # Tauri invoke 封装、时间格式化、Markdown 生成器
│   └── types/                    # 与 Rust 对齐的 TypeScript 类型定义
├── src-tauri/                    # Tauri 2 Rust 后端
│   ├── src/
│   │   ├── commands/             # Tauri IPC Command 入口 (source, media, subtitle, ai, auth, settings)
│   │   ├── adapters/             # 三平台统一适配层
│   │   │   ├── mod.rs            # SourceAdapter Trait 定义
│   │   │   ├── podcast.rs        # Apple Podcasts 搜索 + RSS 解析 + 小宇宙抓取
│   │   │   ├── youtube.rs        # yt-dlp / RSS / 字幕解析
│   │   │   └── bilibili.rs       # B站扫码登录 + 视频/UP主 API + DASH 流 + BCC 字幕
│   │   ├── proxy/                # Rust 本地 HTTP 流代理服务 (解决 Referer/CORS/DASH/Range)
│   │   ├── asr/                  # 云端 ASR 客户端 + 本地 ASR 子进程管理器
│   │   ├── llm/                  # 统一 LLM 流式客户端（翻译 / 导读 / 问答）
│   │   ├── db/                   # SQLite (rusqlite / sqlx) 连接池与 Migration
│   │   └── keychain.rs           # macOS Keychain 凭据读写封装 (keyring crate)
│   └── binaries/                 # 可选内置 sidecar (yt-dlp / ffmpeg)
└── PRD.md
```

### 5.2 核心技术攻坚设计

#### 1. Rust 本地流媒体代理（解决播放稳定性的核心）
* 前端 `<video>` / `<audio>` 不直接请求 YouTube 或 B站远程 URL，而是请求 Rust 后端启动的本地回环端口（如 `http://127.0.0.1:{random_port}/stream/{episode_id}?mode=video|audio&token={session_token}`）。
* **价值**：
  * 自动注入 B站必须的 `Referer: https://www.bilibili.com` 与 `User-Agent` / `Cookie`；
  * 自动走用户配置的 YouTube HTTP/SOCKS5 代理；
  * 完整透传 HTTP `Range` 请求头，保证拖拽进度秒级响应；
  * 对于 B站音视频分离的 DASH 流：纯音频模式直接代理音频流；视频模式可采用 `ffmpeg` 实时无损 remux（`-c copy -f mp4 -movflags frag_keyframe+empty_moov`）或前端 `dash.js` / `shaka-player` 消费本地代理的 MPD/分段流（优先评估 `dash.js` 消费本地代理以降低 CPU 开销并完美支持 Range 拖拽，必要时降级 remux）。
  * 检测上游返回 `403/410`（直链过期）时，后端自动重新拉取新直链并无缝重试。

#### 2. 三平台统一适配层（`SourceAdapter`）
* **Podcast**：
  * 搜索：`https://itunes.apple.com/search?media=podcast&term=...`
  * RSS 解析：Rust `feed-rs` 解析标准 RSS/Atom，提取 `<enclosure>` 音频地址、`<itunes:duration>`、章节与 `<podcast:transcript>`。
  * 小宇宙：解析单集/播客页面内嵌 JSON 数据（`__NEXT_DATA__`）提取真实音频流与节目元数据。
* **YouTube**：
  * 频道订阅刷新：优先抓取轻量 YouTube Channel RSS（`https://www.youtube.com/feeds/videos.xml?channel_id=...`）避免触发限流；单视频信息、流地址与字幕使用 `yt-dlp --dump-json` 统一获取。
* **Bilibili**：
  * 登录鉴权：调用 B站官方护照扫码接口生成二维码、轮询扫码状态，获取 `SESSDATA` / `bili_jct` / `DedeUserID` 存入 macOS Keychain。
  * 内容解析：支持 BV/AV/`b23.tv` 重定向还原、UP 主空间投稿列表（带 WBI 签名或通过 `yt-dlp` 辅助）、`x/player/wbi/v2` 拉取官方 AI 字幕（BCC JSON 转统一内部字幕段）。

#### 3. 字幕数据结构与虚拟滚动
* 2~3 小时播客往往包含 2000~4000 条字幕，前端必须使用虚拟列表（如 `@tanstack/react-virtual`）渲染，保证 60fps 流畅滚动与 `⌘F` 瞬时检索。
* 播放进度驱动字幕高亮采用二分查找（`O(log N)`），避免每秒遍历全量字幕。

#### 4. ASR 子进程隔离与大模型长文稿处理
* 本地 ASR（`whisper.cpp` / `Qwen3-ASR`）通过 `tokio::process::Command` 独立运行，实时解析 stdout 进度推送给前端（Tauri Event），支持用户随时取消任务。
* 翻译与 AI 导读对超长字幕（如超过 15,000 字）：
  * **翻译**：按每批 20~30 句 + 前后 2 句上下文滑动窗口并发翻译（限流 2~3 并发），按句写回数据库支持断点续译。
  * **AI 导读与问答**：优先利用现代长上下文模型（DeepSeek / Gemini / Claude / Qwen 128K+）直接传入带 `[MM:SS]` 时间戳的紧凑文稿；超出所选模型窗口时自动触发分段 Map-Reduce 摘要或关键词片段召回。

---

## 6. 核心 SQLite 数据模型设计

```sql
-- 1. 订阅源表（频道 / 播客 / UP主）
CREATE TABLE sources (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,           -- 'podcast' | 'xiaoyuzhou' | 'youtube' | 'bilibili' | 'local'
    external_id TEXT,                 -- RSS URL / YouTube channel_id / B站 mid
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    cover_url TEXT,
    source_url TEXT NOT NULL,
    playback_rate REAL DEFAULT 1.0,   -- 按频道记住默认倍速
    last_synced_at INTEGER,
    created_at INTEGER NOT NULL
);

-- 2. 单集 / 单视频表
CREATE TABLE episodes (
    id TEXT PRIMARY KEY,
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    platform TEXT NOT NULL,           -- 'podcast' | 'xiaoyuzhou' | 'youtube' | 'bilibili' | 'local'
    external_id TEXT,                 -- GUID / YouTube video_id / B站 bvid
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    page_url TEXT NOT NULL,           -- 原始网页链接
    duration_sec INTEGER DEFAULT 0,
    published_at INTEGER,
    play_position_sec REAL DEFAULT 0, -- 断点续播位置
    is_finished INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    media_type TEXT DEFAULT 'audio',  -- 'audio' | 'video'
    local_file_path TEXT,             -- 离线下载或本地导入路径
    download_status TEXT DEFAULT 'none', -- 'none' | 'downloading' | 'completed' | 'failed'
    subtitle_status TEXT DEFAULT 'none', -- 'none' | 'fetching' | 'transcribing' | 'ready' | 'failed'
    language TEXT,                    -- 原始语种 ('en' | 'zh' | 'ja' ...)
    created_at INTEGER NOT NULL
);

-- 3. 字幕段表（统一承载官方字幕 / ASR 字幕 / 双语译文）
CREATE TABLE transcript_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    seq_index INTEGER NOT NULL,
    start_sec REAL NOT NULL,
    end_sec REAL NOT NULL,
    text_original TEXT NOT NULL,
    text_translated TEXT,             -- 中文译文（可为空）
    speaker TEXT                      -- 可选说话人标识
);
CREATE INDEX idx_segments_episode ON transcript_segments(episode_id, seq_index);

-- 4. AI 导读缓存表
CREATE TABLE ai_guides (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    tldr TEXT,                        -- 一句话总结
    timeline_json TEXT,               -- JSON: [{start_sec, title, summary}]
    takeaways_json TEXT,              -- JSON: [string]
    highlights_json TEXT,             -- JSON: [{start_sec, end_sec, reason}]
    raw_markdown TEXT,
    created_at INTEGER NOT NULL
);

-- 5. AI 问答记录表
CREATE TABLE ai_messages (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    role TEXT NOT NULL,               -- 'user' | 'assistant'
    content TEXT NOT NULL,            -- 含 [MM:SS] 引用标记
    created_at INTEGER NOT NULL
);

-- 6. 单句笔记与高亮表
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    segment_id INTEGER REFERENCES transcript_segments(id) ON DELETE SET NULL,
    timestamp_sec REAL NOT NULL,
    quote_text TEXT NOT NULL,
    note_content TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

---

## 7. 异常场景与风险应对矩阵

| 风险 / 异常场景 | 应对策略 |
| :--- | :--- |
| **YouTube 网络不可达 / 429 限流** | Rust 侧全局代理支持 + 频道刷新走轻量 RSS 而非高频调 `yt-dlp`；报错时明确提示检查代理设置 |
| **B站视频/音频直链 403 过期** | 本地代理遇到 403 自动触发一次静默重解析，重新获取直链续播，用户无感知 |
| **B站 Cookie 失效 / 未登录** | 解析返回登录受限时，在播放页顶部给出非阻塞轻提示条「登录 B站解锁 1080P 与 AI 字幕」，一键弹扫码框 |
| **B站/YouTube 协议变动导致解析失效** | 依赖 `yt-dlp` 时在设置页提供「检测/更新 `yt-dlp`」入口，降低维护成本 |
| **ASR 转写长音频耗时或中断** | 后台异步任务队列（支持顶部状态栏显示进度百分比），切出页面不中断；音频分片缓存，失败可重试 |
| **未配置 LLM API Key** | 不阻断任何播放、订阅与官方字幕功能；仅在用户点击「翻译 / AI 导读 / 问答」时柔和引导前往设置页配置 Key 或本地 Ollama |

---

## 8. 建议的研发执行节奏（给 AI 编码的落地步骤）

1. **Step 0：交互原型验证（推荐先做，耗时短）**
   * 用静态 HTML/React 快速渲染「列表态 + 沉浸播放态 + 设置弹窗」的可点击界面，确认视觉美感与布局比例满意后再开工写后端。
2. **Step 1：搭建 Tauri 2 脚手架与基础层**
   * 初始化 Tauri 2 + React + Tailwind + shadcn/ui + SQLite Migration + macOS Keychain + 代理配置。
3. **Step 2：打通 Phase 1 核心闭环**
   * 依次实现 Podcast RSS / 小宇宙 → YouTube → B站（含扫码登录）三个 Adapter → Rust 本地流代理 → 统一播放器 + 官方字幕同步滚动 → 交付 **Phase 1 验收**。
4. **Step 3：打通 Phase 2 智能能力**
   * 接入云端 ASR → 接入 BYOK LLM（翻译 / 导读 / 问答）→ 笔记与 Markdown 导出 → 补齐本地离线 ASR 子进程 → 交付 **Phase 2 验收**。
5. **Step 4：完成 Phase 3 打磨**
   * 离线下载队列与缓存治理、本地文件导入、macOS 媒体键与快捷键微调 → 打包本地 `.dmg` 开始主力自用。
