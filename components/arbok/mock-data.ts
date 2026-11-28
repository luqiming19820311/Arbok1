import type {
  Episode,
  EpisodeNote,
  Platform,
  PodcastDirectoryItem,
  RecommendedShow,
  Subscription,
} from "./types";

export const INITIAL_SUBSCRIPTIONS: Subscription[] = [
  {
    id: "sub-karpathy",
    name: "Andrej Karpathy",
    platform: "youtube",
    description: "深度学习与大语言模型第一性原理课程，从零构建神经网络、Transformer 与本地 AI 智能体。",
    gradient: "linear-gradient(135deg, #1e293b, #312e81)",
    shortLabel: "AK",
  },
  {
    id: "sub-mediastorm",
    name: "影视飓风",
    platform: "bilibili",
    description: "无限进步！专注影视制作技术、数码影像评测与前沿创作工作流的深度分享。",
    gradient: "linear-gradient(135deg, #9d174d, #db2777)",
    shortLabel: "飓风",
  },
  {
    id: "sub-lex",
    name: "Lex Fridman 播客",
    platform: "podcast",
    description: "Conversations about the nature of intelligence, consciousness, love, and power.",
    gradient: "linear-gradient(135deg, #18181b, #3f3f46)",
    shortLabel: "LEX",
  },
  {
    id: "sub-yc",
    name: "Y Combinator",
    platform: "youtube",
    description: "Make something people want. 来自 YC 合伙人与一线创业者的 AI 时代实战复盘与创业洞察。",
    gradient: "linear-gradient(135deg, #c2410c, #ea580c)",
    shortLabel: "YC",
  },
  {
    id: "sub-xyz",
    name: "科技早知道",
    platform: "xiaoyuzhou",
    description: "声动活泼旗下科技商业播客，追踪全球前沿技术趋势、独立开发与硅谷动态。",
    gradient: "linear-gradient(135deg, #0369a1, #0284c7)",
    shortLabel: "早知",
  },
  {
    id: "sub-limu",
    name: "跟李沐学AI",
    platform: "bilibili",
    description: "硬核 AI 论文逐段精读与深度学习实战，覆盖大模型架构、推理优化与前沿研究。",
    gradient: "linear-gradient(135deg, #0f766e, #115e59)",
    shortLabel: "李沐",
  },
  {
    id: "sub-lenny",
    name: "Lenny 播客",
    platform: "podcast",
    description: "Interviews with world-class product leaders and growth experts to uncover concrete, actionable advice.",
    gradient: "linear-gradient(135deg, #d97706, #b45309)",
    shortLabel: "Lenny",
  },
  {
    id: "sub-latetalk",
    name: "晚点聊 LateTalk",
    platform: "xiaoyuzhou",
    description: "《晚点 LatePost》出品的深度对谈播客，对话科技与商业世界里最具洞察力的实践者。",
    gradient: "linear-gradient(135deg, #b91c1c, #dc2626)",
    shortLabel: "晚点",
  },
];

export const INITIAL_RECOMMENDED_SHOWS: RecommendedShow[] = [
  {
    id: "rec-42",
    name: "42章经",
    reason: "因为你在听「晚点聊 LateTalk」",
    platform: "xiaoyuzhou",
    sourceUrl: "https://www.xiaoyuzhoufm.com/podcast/648b0b641c48983391a63f98",
    gradient: "linear-gradient(135deg, #dc2626, #991b1b)",
    shortLabel: "42",
    subscribed: false,
  },
  {
    id: "rec-acquired",
    name: "Acquired",
    reason: "因为你在听「Lex Fridman 播客」",
    platform: "podcast",
    sourceUrl: "https://feeds.transistor.fm/acquired",
    gradient: "linear-gradient(135deg, #065f46, #047857)",
    shortLabel: "ACQ",
    subscribed: false,
  },
  {
    id: "rec-3b1b",
    name: "3Blue1Brown",
    reason: "因为你在看「Andrej Karpathy」",
    platform: "youtube",
    sourceUrl: "https://www.youtube.com/@3blue1brown/videos",
    gradient: "linear-gradient(135deg, #1d4ed8, #0f172a)",
    shortLabel: "3B1B",
    subscribed: false,
  },
  {
    id: "rec-he",
    name: "老师好我叫何同学",
    reason: "因为你在看「影视飓风」",
    platform: "bilibili",
    sourceUrl: "https://space.bilibili.com/163637592",
    gradient: "linear-gradient(135deg, #334155, #0f172a)",
    shortLabel: "何",
    subscribed: false,
  },
  {
    id: "rec-nopriors",
    name: "No Priors 无先验",
    reason: "因为你在看「Y Combinator」",
    platform: "podcast",
    sourceUrl: "https://feeds.megaphone.fm/nopriors",
    gradient: "linear-gradient(135deg, #6d28d9, #4c1d95)",
    shortLabel: "NP",
    subscribed: false,
  },
  {
    id: "rec-cogrev",
    name: "认知革命 Cognitive",
    reason: "因为你在听「科技早知道」",
    platform: "podcast",
    sourceUrl: "https://feeds.megaphone.fm/RINTP3108857801",
    gradient: "linear-gradient(135deg, #0284c7, #1e3a8a)",
    shortLabel: "CR",
    subscribed: false,
  },
];

export const INITIAL_EPISODES: Episode[] = [
  {
    id: "ep-yt-1",
    subId: "sub-karpathy",
    platform: "youtube",
    channel: "Andrej Karpathy",
    title: "深度拆解 2026 本地优先 AI 智能体与上下文工程",
    subtitle: "Deep Dive into Local-First AI Agents & Context Engineering (2026)",
    date: "2 小时前",
    durationSec: 2640,
    positionSec: 264,
    mediaType: "video",
    language: "en",
    hasOfficialSub: true,
    isBilingual: true,
    hasAiGuide: true,
    isOffline: false,
    gradient: "linear-gradient(135deg, #1e293b 0%, #312e81 55%, #0f172a 100%)",
    coverKicker: "§ 396",
    coverLabel: "LLM 2026",
    pageUrl: "https://www.youtube.com/watch?v=arbok_demo_1",
    transcript: [
      {
        id: 1,
        start: 0,
        end: 14,
        orig: "Welcome back everyone. Today we are going to peel back the curtain on how modern AI agents actually work under the hood.",
        zh: "欢迎大家回来。今天我们要揭开现代 AI 智能体底层运作机制的面纱。",
      },
      {
        id: 2,
        start: 14,
        end: 29,
        orig: "Most people still think prompt engineering is about clever phrasing, but the real game in 2026 is context engineering.",
        zh: "大多数人还以为提示词工程只是遣词造句的技巧，但 2026 年真正的决胜点是上下文工程。",
      },
      {
        id: 3,
        start: 29,
        end: 46,
        orig: "Think of the LLM context window as RAM in a traditional operating system, and your local SQLite database as the hard drive.",
        zh: "把大模型的上下文窗口想象成传统操作系统的内存，而你本地的 SQLite 数据库就是硬盘。",
      },
      {
        id: 4,
        start: 46,
        end: 64,
        orig: "When you feed a three-hour podcast transcript directly into a model, you want crisp timestamps so every claim stays verifiable.",
        zh: "当你把三小时的播客文稿直接喂给模型时，你需要精准的时间戳，让每一条结论都能回溯验证。",
      },
      {
        id: 5,
        start: 64,
        end: 84,
        orig: "And notice why local-first desktop apps are making a huge comeback: latency drops to zero and your personal notes never leave your Mac.",
        zh: "你也会发现为什么本地优先的桌面应用正在强势回归：延迟降为零，而且你的个人笔记永远不会离开你的 Mac。",
      },
      {
        id: 6,
        start: 84,
        end: 105,
        orig: "With Rust handling network proxying and lightweight local ASR models running in isolated subprocesses, one small binary replaces five web tabs.",
        zh: "用 Rust 处理网络代理，让轻量本地语音识别模型跑在独立子进程里，一个小巧的客户端就能替代五个浏览器标签页。",
      },
      {
        id: 7,
        start: 105,
        end: 128,
        orig: "Let's walk through a concrete benchmark comparing streaming dual-language subtitles with semantic chunk translation.",
        zh: "我们来实际看一组基准测试，对比流式双语字幕与语义分块翻译的效果差异。",
      },
      {
        id: 8,
        start: 128,
        end: 154,
        orig: "If you include just two sentences of surrounding context per batch, pronoun accuracy jumps from 74% to over 96%.",
        zh: "只要在每批翻译中附带前后两句上下文，代词指代的准确率就会从 74% 跃升到 96% 以上。",
      },
      {
        id: 9,
        start: 154,
        end: 184,
        orig: "That is the core insight: great AI tools feel calm, deterministic, and completely under the user's control.",
        zh: "这就是核心洞见：优秀的 AI 工具应该给人沉静、可控且完全由用户主导的体验。",
      },
    ],
    guide: {
      tldr: "Andrej Karpathy 系统阐述了 2026 年从「提示词工程」转向「上下文工程」的范式迁移，并指出本地优先桌面应用（SQLite + 精准时间戳 + 轻量离线模型）是个人知识消费的最佳形态。",
      timeline: [
        {
          start: 0,
          title: "为什么是上下文工程而非提示词技巧",
          summary: "将 LLM 上下文比作操作系统 RAM，强调信息编排的重要性。",
        },
        {
          start: 46,
          title: "长音频消费中的时间戳可验证性",
          summary: "AI 总结必须绑定毫秒级时间戳，消除幻觉焦虑。",
        },
        {
          start: 64,
          title: "Local-First 桌面应用的回归",
          summary: "零延迟、隐私可控，以及 Rust 子进程隔离的工程优势。",
        },
        {
          start: 105,
          title: "双语字幕翻译的上下文窗口技巧",
          summary: "滑动窗口携带前后两句上下文，将指代准确率从 74% 提升至 96%+。",
        },
      ],
      takeaways: [
        "把上下文窗口当成操作系统的「内存」，把本地 SQLite 当成「硬盘」，按需装配最高信噪比的上下文。",
        "处理长达数小时的音视频时，带时间戳的原文引用是建立用户信任的关键。",
        "双语字幕翻译采用 20~30 句分块 + 2 句上下文滑动窗口，能在极低成本下显著提升翻译自然度。",
      ],
      highlights: [
        {
          start: 29,
          end: 46,
          reason: "最形象的架构类比：LLM 上下文 = RAM，本地 SQLite = 硬盘",
        },
        {
          start: 128,
          end: 154,
          reason: "可直接落地的双语翻译准确率优化数据（74% → 96%）",
        },
      ],
    },
    chat: [
      {
        id: "msg-1",
        role: "user",
        content: "视频里提到的双语字幕翻译准确率是怎么提升的？",
      },
      {
        id: "msg-2",
        role: "assistant",
        content:
          "Karpathy 在 [01:45] 引入了语义分块翻译基准测试，并在 [02:08] 给出了核心技巧：在每一批待翻译字幕中附带前后 2 句上下文，这样可以让中文译文里的代词指代和术语连贯性准确率从 74% 提升到 96% 以上。",
      },
    ],
  },
  {
    id: "ep-bili-1",
    subId: "sub-mediastorm",
    platform: "bilibili",
    channel: "影视飓风",
    title: "耗时半年，我们把一套 8K 影视后期与音频工作流全部搬进了 Mac Studio",
    date: "5 小时前",
    durationSec: 1620,
    positionSec: 194,
    mediaType: "video",
    language: "zh",
    hasOfficialSub: true,
    isBilingual: false,
    hasAiGuide: true,
    isOffline: true,
    gradient: "linear-gradient(135deg, #9d174d 0%, #db2777 55%, #4c1d95 100%)",
    coverKicker: "B站 1080P+",
    coverLabel: "8K MAC",
    pageUrl: "https://www.bilibili.com/video/BV1Arbok8KMac",
    transcript: [
      {
        id: 101,
        start: 0,
        end: 18,
        orig: "大家好这里是影视飓风，今天我们要聊一个拖了半年的大工程：把公司主力剪辑台全面迁移到 Mac 生态。",
      },
      {
        id: 102,
        start: 18,
        end: 39,
        orig: "很多同学关心，B 站高码率视频在自建播放器里为什么经常遇到音画不同步或者加载慢？核心其实是 DASH 音视频分离流的处理方式。",
      },
      {
        id: 103,
        start: 39,
        end: 62,
        orig: "在实测中我们发现，Apple Silicon 的统一内存架构在同时跑 8K 解码和本地语音转写时，风扇甚至几乎没有转起来。",
      },
      {
        id: 104,
        start: 62,
        end: 88,
        orig: "更夸张的是离线字幕工作流：以前一小时的素材上传云端要等十几分钟，现在用本地模型两分钟就能出带时间轴的精准文稿。",
      },
      {
        id: 105,
        start: 88,
        end: 118,
        orig: "当然坑也不少，比如万兆 NAS 的 SMB 缓存策略、以及外接雷雳硬盘休眠掉盘的问题，我们在视频后半段都整理了完整避坑清单。",
      },
      {
        id: 106,
        start: 118,
        end: 160,
        orig: "如果你也是重度 Mac 用户，希望这期实测能帮你省下几万块的试错成本，记得把关键节点收藏进你的笔记库。",
      },
    ],
    guide: {
      tldr: "影视飓风分享了半年内将 8K 影视与音频后期工作流迁移至 Mac Studio 的全流程实测，重点肯定了 Apple Silicon 统一内存与本地语音转写效率，并给出 NAS 与雷雳存储避坑建议。",
      timeline: [
        {
          start: 0,
          title: "半年迁移背景与核心挑战",
          summary: "团队主力工作站从传统 PC 转向 Mac Studio 的起因。",
        },
        {
          start: 18,
          title: "DASH 流处理与统一内存实测",
          summary: "解析高码率媒体流处理，以及 8K 解码叠加本地 ASR 的静音表现。",
        },
        {
          start: 62,
          title: "离线字幕工作流效率对比",
          summary: "本地模型将 1 小时素材的转写耗时压缩至 2 分钟以内。",
        },
        {
          start: 88,
          title: "万兆 NAS 与雷雳外接盘避坑",
          summary: "SMB 缓存配置与硬盘休眠掉盘的实操解决方案。",
        },
      ],
      takeaways: [
        "Apple Silicon 统一内存在「高码率视频解码 + 本地 AI 语音识别」并发场景下功耗与噪音优势显著。",
        "本地离线 ASR 将长视频粗剪与文稿定位效率提升了一个数量级。",
        "构建 Mac 桌面影音工具时，合理处理 DASH 分离流与本地缓存是流畅拖拽的关键。",
      ],
      highlights: [
        {
          start: 39,
          end: 62,
          reason: "8K 解码 + 本地语音转写实测静音表现",
        },
        {
          start: 62,
          end: 88,
          reason: "本地离线字幕 vs 云端上传的真实耗时对比",
        },
      ],
    },
    chat: [
      {
        id: "msg-b1",
        role: "user",
        content: "这期视频提到了哪些需要避坑的地方？",
      },
      {
        id: "msg-b2",
        role: "assistant",
        content:
          "在 [01:28] 处主要提到了两个硬件与网络协作上的坑：第一是万兆 NAS 的 SMB 缓存策略配置不当会导致拖动卡顿；第二是外接雷雳硬盘休眠掉盘问题，需要在系统电源设置中针对性调整。",
      },
    ],
  },
  {
    id: "ep-pod-1",
    subId: "sub-lex",
    platform: "podcast",
    channel: "Lex Fridman 播客",
    title: "#462 — 设计尊重人类注意力的安静软件与个人知识库",
    subtitle: "Designing Calm Software That Respects Human Attention",
    date: "昨天",
    durationSec: 5100,
    positionSec: 1530,
    mediaType: "audio",
    language: "en",
    hasOfficialSub: true,
    isBilingual: true,
    hasAiGuide: true,
    isOffline: true,
    gradient: "linear-gradient(135deg, #27272a 0%, #3f3f46 55%, #09090b 100%)",
    coverKicker: "PODCAST",
    coverLabel: "LEX #462",
    pageUrl: "https://lexfridman.com/podcast/462",
    transcript: [
      {
        id: 201,
        start: 0,
        end: 22,
        orig: "The following is a conversation about craft, minimalism, and why the best tools feel like a quiet library rather than a casino.",
        zh: "接下来是一场关于匠心、极简主义的对话，探讨为什么最好的工具应该像安静的图书馆，而不是喧闹的赌场。",
      },
      {
        id: 202,
        start: 22,
        end: 48,
        orig: "When you open a media platform today, algorithms fight for every millisecond of your attention with red badges and autoplay feeds.",
        zh: "如今打开大多数内容平台，算法都在用小红点和自动播放信息流争夺你每一毫秒的注意力。",
      },
      {
        id: 203,
        start: 48,
        end: 76,
        orig: "Pulling your favorite podcasts, YouTube channels, and independent creators into one calm local reader completely flips the power dynamic.",
        zh: "把你喜欢的播客、YouTube 频道和独立创作者拉进一个安静的本地阅读器，会彻底扭转注意力的主导权。",
      },
      {
        id: 204,
        start: 76,
        end: 108,
        orig: "Suddenly you are no longer scrolling endlessly; you choose what matters, skim the chapter timeline, listen deeply, and keep permanent notes.",
        zh: "突然之间，你不再无休止地刷屏；你主动挑选重要内容，扫一眼章节时间线，深度聆听，并留下属于自己的永久笔记。",
      },
      {
        id: 205,
        start: 108,
        end: 150,
        orig: "Great desktop software honors keyboard shortcuts, fast search, and plain Markdown files that you will still be able to read thirty years from now.",
        zh: "伟大的桌面软件尊重键盘快捷键、瞬时搜索，以及三十年后你依然能打开阅读的纯文本 Markdown 文件。",
      },
    ],
    guide: {
      tldr: "本期播客围绕「安静软件（Calm Software）」设计哲学展开，讨论如何通过本地聚合、无算法干扰的订阅流和纯文本 Markdown 沉淀，夺回个人注意力主权。",
      timeline: [
        {
          start: 0,
          title: "安静的图书馆 vs 喧闹的赌场",
          summary: "对比好工具与注意力收割型平台的本质区别。",
        },
        {
          start: 48,
          title: "用本地聚合器扭转主导权",
          summary: "跨平台收敛优质订阅源，脱离推荐流绑架。",
        },
        {
          start: 108,
          title: "三十年后依然可读的知识资产",
          summary: "键盘优先、本地搜索与 Markdown 开放格式的重要性。",
        },
      ],
      takeaways: [
        "好的阅读与收听工具应该克制视觉噪音，把画布还给内容本身。",
        "先看时间线再决定深听，能把长播客的信息获取效率提升 3 倍以上。",
        "笔记导出为标准 Markdown，确保个人知识库不受任何单一软件锁定。",
      ],
      highlights: [
        {
          start: 48,
          end: 76,
          reason: "关于「本地聚合器如何夺回注意力主权」的核心论述",
        },
      ],
    },
    chat: [],
  },
  {
    id: "ep-lenny-1",
    subId: "sub-lenny",
    platform: "podcast",
    channel: "Lenny 播客",
    title: "为什么 PM 突然又变得有价值了 | Tulsee Doshi（Gemini 产品主管）",
    subtitle: "Why AI Product Management Is Entering a New Golden Era",
    date: "昨天",
    durationSec: 3540,
    positionSec: 354,
    mediaType: "video",
    language: "en",
    hasOfficialSub: true,
    isBilingual: true,
    hasAiGuide: true,
    isOffline: false,
    gradient: "linear-gradient(135deg, #c2410c 0%, #ea580c 50%, #7c2d12 100%)",
    coverKicker: "LENNY'S",
    coverLabel: "PMs ARE BACK",
    pageUrl: "https://www.youtube.com/watch?v=arbok_lenny_1",
    transcript: [
      {
        id: 401,
        start: 0,
        end: 24,
        orig: "When implementation speed increases tenfold, taste and problem framing become the ultimate bottleneck.",
        zh: "当代码实现速度提升十倍后，审美品味与问题定义能力就成了真正的瓶颈。",
      },
      {
        id: 402,
        start: 24,
        end: 55,
        orig: "The best product builders prototype live in code with users every single week instead of writing static decks.",
        zh: "最优秀的产品构建者每周都在代码里做活原型给用户测，而不是写静态 PPT。",
      },
    ],
    guide: {
      tldr: "Gemini 产品主管探讨了 AI 编码加速背景下，产品经理为何从「写文档协调者」进化为「用交互原型定义品味与评测标准的构建者」。",
      timeline: [
        {
          start: 0,
          title: "实现成本趋零后的新瓶颈",
          summary: "品味、问题定义与评估指标成为核心护城河。",
        },
        {
          start: 24,
          title: "每周用可交互原型替代静态文档",
          summary: "团队如何在两天内完成从想法到真实界面验证。",
        },
      ],
      takeaways: [
        "AI 写代码越快，前期清晰克制的 PRD 与高保真交互原型越值钱。",
        "用真实用户高频痛点驱动评测集，胜过空谈模型参数。",
      ],
      highlights: [
        {
          start: 0,
          end: 24,
          reason: "关于「实现加速 10 倍后，品味成为最终瓶颈」的金句",
        },
      ],
    },
    chat: [],
  },
  {
    id: "ep-yc-1",
    subId: "sub-yc",
    platform: "youtube",
    channel: "Y Combinator",
    title: "人工智能同事的崛起：小团队如何用 Agent 跑出 100 倍人效",
    subtitle: "How Small Teams Build 100x Leverage With AI Agents",
    date: "昨天",
    durationSec: 2280,
    positionSec: 110,
    mediaType: "video",
    language: "en",
    hasOfficialSub: true,
    isBilingual: true,
    hasAiGuide: true,
    isOffline: false,
    gradient: "linear-gradient(135deg, #ea580c 0%, #f97316 48%, #431407 100%)",
    coverKicker: "Y COMBINATOR",
    coverLabel: "AI AGENTS",
    pageUrl: "https://www.youtube.com/watch?v=arbok_yc_1",
    transcript: [
      {
        id: 451,
        start: 0,
        end: 28,
        orig: "Across the latest YC batch, three-person teams are shipping desktop and web products that used to require thirty engineers.",
        zh: "在最新一期 YC 孵化团队中，三人小团队正在交付过去需要三十名工程师才能做出来的桌面与网页产品。",
      },
    ],
    guide: null,
    chat: [],
  },
  {
    id: "ep-xyz-1",
    subId: "sub-xyz",
    platform: "xiaoyuzhou",
    channel: "科技早知道",
    title: "S10E14 | 用 AI 写一个属于自己的 Mac 软件：从 PRD 到独立发布",
    date: "2 天前",
    durationSec: 2700,
    positionSec: 0,
    mediaType: "audio",
    language: "zh",
    hasOfficialSub: true,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: false,
    gradient: "linear-gradient(135deg, #0369a1 0%, #0284c7 55%, #0c4a6e 100%)",
    coverKicker: "小宇宙",
    coverLabel: "早知道",
    pageUrl: "https://www.xiaoyuzhoufm.com/episode/arbok_demo",
    transcript: [
      {
        id: 301,
        start: 0,
        end: 25,
        orig: "欢迎收听科技早知道。今天我们来聊聊「个人定制软件」的新时代：当 AI 承担了大部分编码工作，产品负责人真正该抓什么？",
      },
      {
        id: 302,
        start: 25,
        end: 60,
        orig: "第一是克制范围，把 MVP 验收标准写得足够具体；第二是先用可交互原型把界面手感定下来，再让 AI 按模块实现后端。",
      },
      {
        id: 303,
        start: 60,
        end: 98,
        orig: "在技术选型上，Tauri 2 结合 React 已经成为独立开发者做 Mac 工具的新宠，安装包只有十几兆，内存占用比 Electron 低得多。",
      },
      {
        id: 304,
        start: 98,
        end: 135,
        orig: "最重要的是，先做一款你自己每天都离不开的工具，真实的高频使用本身就是最好的产品打磨。",
      },
    ],
    guide: null,
    chat: [],
  },
  {
    id: "ep-latetalk-1",
    subId: "sub-latetalk",
    platform: "xiaoyuzhou",
    channel: "晚点聊 LateTalk",
    title: "对话顾全全：预训练有点「无聊」了，但用 Scaling 改变端侧交互才刚开始",
    date: "2 天前",
    durationSec: 4680,
    positionSec: 0,
    mediaType: "audio",
    language: "zh",
    hasOfficialSub: true,
    isBilingual: false,
    hasAiGuide: true,
    isOffline: false,
    gradient: "linear-gradient(135deg, #991b1b 0%, #dc2626 55%, #450a0a 100%)",
    coverKicker: "晚点聊",
    coverLabel: "LATE TALK",
    pageUrl: "https://www.xiaoyuzhoufm.com/episode/arbok_latetalk",
    transcript: [
      {
        id: 601,
        start: 0,
        end: 30,
        orig: "大家好，欢迎回到晚点聊。今天我们聊聊端侧小模型与个人桌面工作台结合的新拐点。",
      },
    ],
    guide: null,
    chat: [],
  },
  {
    id: "ep-bili-2",
    subId: "sub-limu",
    platform: "bilibili",
    channel: "跟李沐学AI",
    title: "论文精读：长上下文大模型的 KV Cache 压缩与检索架构演进",
    date: "3 天前",
    durationSec: 3600,
    positionSec: 0,
    mediaType: "video",
    language: "zh",
    hasOfficialSub: false,
    isBilingual: false,
    hasAiGuide: false,
    isOffline: false,
    gradient: "linear-gradient(135deg, #1e293b 0%, #0f766e 60%, #134e4a 100%)",
    coverKicker: "B站 · 论文",
    coverLabel: "KV CACHE",
    pageUrl: "https://www.bilibili.com/video/BV1ArbokLimu",
    transcript: [],
    guide: null,
    chat: [],
  },
  {
    id: "ep-yc-2",
    subId: "sub-yc",
    platform: "youtube",
    channel: "Y Combinator",
    title: "Ramp 押注 100 倍员工效率：AI 原生工作流实战复盘",
    subtitle: "How Ramp Is Using AI Agents Across Engineering & Product",
    date: "4 天前",
    durationSec: 1980,
    positionSec: 0,
    mediaType: "video",
    language: "en",
    hasOfficialSub: true,
    isBilingual: true,
    hasAiGuide: true,
    isOffline: false,
    gradient: "linear-gradient(135deg, #14532d 0%, #15803d 55%, #052e16 100%)",
    coverKicker: "CASE STUDY",
    coverLabel: "RAMP × AI",
    pageUrl: "https://www.youtube.com/watch?v=arbok_yc_2",
    transcript: [
      {
        id: 701,
        start: 0,
        end: 25,
        orig: "Every single workflow at Ramp now starts with an agent draft reviewed by a human owner.",
        zh: "如今 Ramp 内部的每一条工作流，都是先由 Agent 生成初稿，再由人类负责人把关验收。",
      },
    ],
    guide: null,
    chat: [],
  },
];

export const INITIAL_NOTES: EpisodeNote[] = [
  {
    id: "note-1",
    epId: "ep-yt-1",
    segId: 3,
    ts: 29,
    quote:
      "把大模型的上下文窗口想象成传统操作系统的内存，而你本地的 SQLite 数据库就是硬盘。",
    body: "Arbok 的 AI 问答模块正好可以借鉴这个架构：全量字幕存 SQLite，提问时精准装配相关片段进上下文。",
  },
];

export const INITIAL_PODCAST_DIRECTORY: PodcastDirectoryItem[] = [
  {
    id: "dir-acquired",
    name: "Acquired",
    author: "Ben Gilbert & David Rosenthal",
    desc: "深度剖析伟大科技公司的商业史诗",
    feedUrl: "https://feeds.transistor.fm/acquired",
    subscribed: false,
  },
  {
    id: "dir-lex",
    name: "Lex Fridman Podcast",
    author: "Lex Fridman",
    desc: "AI、科学与人类本性的长对话访谈",
    feedUrl: "https://lexfridman.com/feed/podcast/",
    subscribed: false,
  },
  {
    id: "dir-huberman",
    name: "Huberman Lab",
    author: "Andrew Huberman",
    desc: "神经科学与可落地的日常健康工具",
    feedUrl: "https://feeds.megaphone.fm/hubermanlab",
    subscribed: false,
  },
  {
    id: "dir-sv101",
    name: "硅谷101",
    author: "泓君 Jane",
    desc: "一线硅谷科技趋势与深度人物访谈",
    feedUrl: "https://feeds.fireside.fm/sv101/rss",
    subscribed: false,
  },
];

export function formatTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatRemainingMinutes(
  durationSec: number,
  positionSec: number
): string {
  const remainMin = Math.max(1, Math.ceil((durationSec - positionSec) / 60));
  return `还剩 ${remainMin} 分钟`;
}

export function getPlatformMeta(platform: Platform) {
  switch (platform) {
    case "youtube":
      return {
        label: "YouTube",
        fg: "var(--plat-youtube-fg)",
        bg: "var(--plat-youtube-bg)",
        dot: "#ea580c",
      };
    case "bilibili":
      return {
        label: "B站",
        fg: "var(--plat-bilibili-fg)",
        bg: "var(--plat-bilibili-bg)",
        dot: "#db2777",
      };
    case "xiaoyuzhou":
      return {
        label: "小宇宙",
        fg: "var(--plat-xiaoyuzhou-fg)",
        bg: "var(--plat-xiaoyuzhou-bg)",
        dot: "#0284c7",
      };
    case "local":
      return {
        label: "本地文件",
        fg: "#0f766e",
        bg: "rgba(13, 148, 136, 0.14)",
        dot: "#0d9488",
      };
    default:
      return {
        label: "播客",
        fg: "var(--plat-podcast-fg)",
        bg: "var(--plat-podcast-bg)",
        dot: "#7c3aed",
      };
  }
}

export function detectPlatformFromUrl(url: string): Platform | null {
  const value = url.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("youtube.com") || value.includes("youtu.be")) {
    return "youtube";
  }
  if (
    value.includes("bilibili.com") ||
    value.includes("b23.tv") ||
    value.includes("bilibili/user/video/")
  ) {
    return "bilibili";
  }
  if (value.includes("xiaoyuzhoufm.com")) {
    return "xiaoyuzhou";
  }
  if (value.includes("rss") || value.includes("feed") || value.includes(".xml")) {
    return "podcast";
  }
  return null;
}

export function buildEpisodeMarkdown(
  ep: Episode,
  notes: EpisodeNote[]
): string {
  const meta = getPlatformMeta(ep.platform);
  const lines = [
    "---",
    `title: "${ep.title}"`,
    `source: ${meta.label}`,
    `channel: "${ep.channel}"`,
    `url: ${ep.pageUrl}`,
    `duration: "${formatTime(ep.durationSec)}"`,
    `tags: [Arbok, ${meta.label}]`,
    "---",
    "",
    `# ${ep.title}`,
    "",
  ];

  if (ep.guide) {
    lines.push("## 一句话总结", `> ${ep.guide.tldr}`, "", "## 章节时间线");
    for (const item of ep.guide.timeline) {
      lines.push(`- **[${formatTime(item.start)}] ${item.title}**：${item.summary}`);
    }
    lines.push("", "## 核心观点");
    for (const point of ep.guide.takeaways) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  if (notes.length > 0) {
    lines.push("## 个人笔记与摘录");
    for (const note of notes) {
      lines.push(
        `### [${formatTime(note.ts)}]`,
        `> ${note.quote}`,
        "",
        note.body,
        ""
      );
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
