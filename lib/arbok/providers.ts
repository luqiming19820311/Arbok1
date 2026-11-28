import type {
  AppSettings,
  CloudAsrProviderId,
  CloudTtsProviderId,
  GuideTemplateId,
  LlmProviderId,
  LocalAiCliConfig,
  LocalAiProviderId,
  LocalAsrModel,
  LocalCliModelItem,
  LocalTtsModel,
  TranslationPairId,
} from "@/components/arbok/types";

export interface LocalAiCliMetadata {
  id: LocalAiProviderId;
  name: string;
  vendor: string;
  defaultVersionLabel: string;
  subscriptionNote: string;
  followSettingLabel: string;
  sandboxNote: string;
  aboutLabel: string;
  aboutUrl: string;
  defaultModels: LocalCliModelItem[];
  defaultCheckedModels: string[];
}

export const LOCAL_AI_CLI_METADATA: Record<LocalAiProviderId, LocalAiCliMetadata> = {
  codex: {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    defaultVersionLabel: "codex-cli",
    subscriptionNote: "用你自己的 ChatGPT 订阅，不需要 API Key。用量计入你的订阅额度。",
    followSettingLabel: "跟随 Codex 的设置（推荐）",
    sandboxNote:
      "字幕和你的问题会交给本机的 Codex，由它连接 OpenAI 的服务。它在一个空文件夹里运行，不能读写你的文件，也不能执行命令。",
    aboutLabel: "关于 Codex",
    aboutUrl: "https://github.com/openai/codex",
    defaultModels: [
      { id: "gpt-6-astra", displayName: "GPT-6-Astra" },
      { id: "gpt-5.6-sol", displayName: "GPT-5.6-Sol" },
      { id: "gpt-5.6-terra", displayName: "GPT-5.6-Terra" },
      { id: "gpt-5.6-luna", displayName: "GPT-5.6-Luna" },
    ],
    defaultCheckedModels: ["gpt-5.6-sol"],
  },
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    vendor: "Anthropic",
    defaultVersionLabel: "claude-code",
    subscriptionNote: "用你自己的 Claude 订阅，不需要 API Key。用量计入你的订阅额度。",
    followSettingLabel: "跟随 Claude Code 的设置（推荐）",
    sandboxNote:
      "字幕和你的问题会交给本机的 Claude Code，由它连接 Anthropic 的服务。它在一个空文件夹里运行，不能读写你的文件，也不能执行命令。",
    aboutLabel: "关于 Claude Code",
    aboutUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    defaultModels: [
      { id: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-1", displayName: "Claude Opus 4.1" },
      { id: "claude-haiku-3-5", displayName: "Claude Haiku 3.5" },
    ],
    defaultCheckedModels: ["claude-sonnet-4-5"],
  },
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    vendor: "Google",
    defaultVersionLabel: "antigravity-cli",
    subscriptionNote:
      "用你自己的 Google Antigravity 订阅，不需要 API Key。用量计入你的订阅额度。",
    followSettingLabel: "跟随 Antigravity 的设置（推荐）",
    sandboxNote:
      "字幕和你的问题会交给本机的 Antigravity，由它连接 Google 的服务。它在一个空文件夹里运行，不能读写你的文件，也不能执行命令。",
    aboutLabel: "关于 Antigravity",
    aboutUrl: "https://antigravity.google/",
    defaultModels: [
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { id: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5" },
    ],
    defaultCheckedModels: ["gemini-2.5-pro"],
  },
};

export function isLocalAiProviderId(id: LlmProviderId): id is LocalAiProviderId {
  return id === "claude-code" || id === "codex" || id === "antigravity";
}

export function getDefaultLocalAiCliConfig(id: LocalAiProviderId): LocalAiCliConfig {
  const meta = LOCAL_AI_CLI_METADATA[id];
  return {
    modelMode: "auto",
    chatModels: [...meta.defaultCheckedModels],
    customModels: [],
  };
}

export interface LlmProviderPreset {
  id: LlmProviderId;
  label: string;
  shortName: string;
  badge: string;
  category: "local" | "featured" | "aggregator" | "vendor" | "legacy";
  protocol: "openai" | "gemini" | "claude" | "cli";
  baseUrl: string;
  defaultModel: string;
  requiresKey: boolean;
  applyUrl?: string;
}

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: "claude-code",
    label: "Claude Code (本机订阅)",
    shortName: "Claude Code",
    badge: "CC",
    category: "local",
    protocol: "cli",
    baseUrl: "cli://claude",
    defaultModel: "claude-sonnet-4-5",
    requiresKey: false,
  },
  {
    id: "codex",
    label: "Codex (本机订阅)",
    shortName: "Codex",
    badge: "CX",
    category: "local",
    protocol: "cli",
    baseUrl: "cli://codex",
    defaultModel: "gpt-5-codex",
    requiresKey: false,
  },
  {
    id: "antigravity",
    label: "Antigravity (本机订阅)",
    shortName: "Antigravity",
    badge: "AG",
    category: "local",
    protocol: "cli",
    baseUrl: "cli://agy",
    defaultModel: "gemini-2.5-pro",
    requiresKey: false,
  },
  {
    id: "ollama",
    label: "本地 Ollama (无需 Key)",
    shortName: "Ollama",
    badge: "OL",
    category: "legacy",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5:7b",
    requiresKey: false,
  },
  {
    id: "lmstudio",
    label: "本地 LM Studio (无需 Key)",
    shortName: "LM Studio",
    badge: "LM",
    category: "legacy",
    protocol: "openai",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    requiresKey: false,
  },
  {
    id: "xiaomi-mimo",
    label: "小米 MiMo (mimo-v2.6-flash)",
    shortName: "小米 MiMo",
    badge: "Mi",
    category: "featured",
    protocol: "openai",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.6-flash",
    requiresKey: true,
    applyUrl: "https://platform.xiaomimimo.com/",
  },
  {
    id: "deepseek",
    label: "DeepSeek (deepseek-chat / V3)",
    shortName: "DeepSeek",
    badge: "DS",
    category: "featured",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    requiresKey: true,
    applyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "siliconflow",
    label: "硅基流动 (SiliconFlow)",
    shortName: "硅基流动",
    badge: "SF",
    category: "featured",
    protocol: "openai",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V3",
    requiresKey: true,
    applyUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  {
    id: "custom",
    label: "其他 (OpenAI 兼容)",
    shortName: "其他 (OpenAI 兼容)",
    badge: "AI",
    category: "featured",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresKey: true,
  },
  {
    id: "tokendance",
    label: "TokenDance 聚合路由",
    shortName: "TokenDance",
    badge: "TD",
    category: "aggregator",
    protocol: "openai",
    baseUrl: "https://api.tokendance.ai/v1",
    defaultModel: "deepseek-chat",
    requiresKey: true,
    applyUrl: "https://tokendance.ai/",
  },
  {
    id: "openrouter",
    label: "OpenRouter 聚合路由",
    shortName: "OpenRouter",
    badge: "OR",
    category: "aggregator",
    protocol: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "deepseek/deepseek-chat",
    requiresKey: true,
    applyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "opencode-go",
    label: "OpenCode Go 聚合路由",
    shortName: "OpenCode Go",
    badge: "OC",
    category: "aggregator",
    protocol: "openai",
    baseUrl: "https://api.opencode.ai/v1",
    defaultModel: "gpt-4o-mini",
    requiresKey: true,
  },
  {
    id: "claude",
    label: "Claude (Anthropic)",
    shortName: "Claude (Anthropic)",
    badge: "CL",
    category: "vendor",
    protocol: "claude",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    requiresKey: true,
    applyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai",
    label: "OpenAI (gpt-4o-mini)",
    shortName: "OpenAI",
    badge: "OA",
    category: "vendor",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    requiresKey: true,
    applyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    label: "Google Gemini (gemini-2.5-flash)",
    shortName: "Google Gemini",
    badge: "GM",
    category: "vendor",
    protocol: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    requiresKey: true,
    applyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "kimi",
    label: "Kimi 月之暗面 (moonshot-v1)",
    shortName: "Kimi 月之暗面",
    badge: "KM",
    category: "vendor",
    protocol: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-32k",
    requiresKey: true,
    applyUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "qwen",
    label: "通义千问 Qwen (DashScope)",
    shortName: "通义千问 Qwen",
    badge: "QW",
    category: "vendor",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    requiresKey: true,
    applyUrl: "https://bailian.console.aliyun.com/",
  },
  {
    id: "zhipu",
    label: "智谱清言 (GLM-4)",
    shortName: "智谱清言",
    badge: "ZP",
    category: "vendor",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
    requiresKey: true,
    applyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
];

export interface CloudAsrPreset {
  id: CloudAsrProviderId;
  label: string;
  pillLabel: string;
  endpoint: string;
  defaultModel: string;
  description: string;
  requiresKey?: boolean;
  applyUrl?: string;
}

export const CLOUD_ASR_PRESETS: CloudAsrPreset[] = [
  {
    id: "doubao",
    label: "豆包语音（极速版）",
    pillLabel: "豆包语音（极速版）",
    endpoint: "https://openspeech.bytedance.com/api/v3",
    defaultModel: "bigmodel",
    description: "中文极准，5 分钟一段，速度极快。识别时音频会发送到豆包语音（极速版）。",
    requiresKey: true,
    applyUrl: "https://console.volcengine.com/speech/app",
  },
  {
    id: "deepseek-asr",
    label: "DeepSeek 兼容转写",
    pillLabel: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1/audio/transcriptions",
    defaultModel: "whisper-1",
    description: "兼容 OpenAI Audio 转写协议，可自定义网关地址。",
    requiresKey: true,
    applyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "siliconflow",
    label: "硅基流动 SenseVoiceSmall",
    pillLabel: "硅基流动",
    endpoint: "https://api.siliconflow.cn/v1/audio/transcriptions",
    defaultModel: "FunAudioLLM/SenseVoiceSmall",
    description: "中文/中英混合精度极高，1 小时音频仅需数秒。",
    requiresKey: true,
    applyUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  {
    id: "groq",
    label: "Groq Whisper Large v3 Turbo",
    pillLabel: "Groq",
    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    defaultModel: "whisper-large-v3-turbo",
    description: "极速 Whisper 推理，适合海外英文播客与 YouTube。",
    requiresKey: true,
    applyUrl: "https://console.groq.com/keys",
  },
  {
    id: "openai",
    label: "OpenAI Whisper-1",
    pillLabel: "OpenAI",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    defaultModel: "whisper-1",
    description: "标准 OpenAI Audio 转写接口，返回精准句级时间戳。",
    requiresKey: true,
    applyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "zhipu-asr",
    label: "智谱 GLM-ASR",
    pillLabel: "智谱 GLM-ASR",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions",
    defaultModel: "glm-asr",
    description: "智谱中文与多语种语音识别，断句与标点自然。",
    requiresKey: true,
    applyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    id: "stepfun-asr",
    label: "阶跃星辰 Step-ASR",
    pillLabel: "阶跃星辰",
    endpoint: "https://api.stepfun.com/v1/audio/transcriptions",
    defaultModel: "step-asr",
    description: "中文口语与长音频播客转写优化。",
    requiresKey: true,
    applyUrl: "https://platform.stepfun.com/interface-key",
  },
  {
    id: "local-asr-service",
    label: "本机识别服务 (OpenAI 兼容)",
    pillLabel: "本机识别服务",
    endpoint: "http://127.0.0.1:8000/v1/audio/transcriptions",
    defaultModel: "whisper-1",
    description: "连接你本机或局域网自建的 Faster-Whisper / FunASR 兼容接口，无需云端 Key。",
    requiresKey: false,
  },
];

export const LOCAL_ASR_MODEL_CATALOG: Omit<
  LocalAsrModel,
  "installed" | "localPath"
>[] = [
  {
    id: "qwen3-asr-0.6b",
    name: "Qwen3-ASR 0.6B（推荐）",
    engine: "qwen3-asr",
    sizeLabel: "767 MB",
    filename: "Qwen3-ASR-0.6B-Q8_0.gguf",
    downloadUrl:
      "https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF/resolve/main/Qwen3-ASR-0.6B-Q8_0.gguf",
  },
  {
    id: "whisper-large-v3-turbo",
    name: "Whisper large-v3-turbo",
    engine: "whisper.cpp",
    sizeLabel: "547 MB",
    filename: "ggml-large-v3-turbo-q5_0.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
  },
  {
    id: "whisper-small",
    name: "Whisper small",
    engine: "whisper.cpp",
    sizeLabel: "466 MB",
    filename: "ggml-small.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
  },
  {
    id: "whisper-base",
    name: "Whisper base",
    engine: "whisper.cpp",
    sizeLabel: "142 MB",
    filename: "ggml-base.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
  },
  {
    id: "whisper-tiny",
    name: "Whisper tiny",
    engine: "whisper.cpp",
    sizeLabel: "75 MB",
    filename: "ggml-tiny.bin",
    downloadUrl:
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
  },
];

export const LOCAL_ASR_MODEL_DESCRIPTIONS: Record<string, string> = {
  "qwen3-asr-0.6b": "中英文精准，自带标点，专有名词识别好 · 767 MB",
  "whisper-large-v3-turbo": "支持语言最多，Apple 芯片上 1 小时音频约 3–5 分钟 · 547 MB",
  "whisper-small": "体积适中、中英均衡，适合日常播客与视频 · 466 MB",
  "whisper-base": "轻量快速，适合快速试听与浏览 · 142 MB",
  "whisper-tiny": "最快，适合快速测试验证 · 75 MB",
};

export interface GuideTemplatePreset {
  id: GuideTemplateId;
  label: string;
  instruction: string;
}

export const GUIDE_TEMPLATE_PRESETS: GuideTemplatePreset[] = [
  {
    id: "deep",
    label: "深度导读（默认）",
    instruction:
      "提炼高信息密度的一句话总结、按话题推进划分的带时间戳章节时间线、3-5 条核心洞见，以及最值得先听的 2-3 个精彩片段。",
  },
  {
    id: "brief",
    label: "极速速览（3 分钟读完）",
    instruction:
      "用最精炼的商业与产品语言，快速给出结论、不超过 4 个主章节，以及 3 条直接可执行的要点。",
  },
  {
    id: "technical",
    label: "技术与论文拆解",
    instruction:
      "重点提取架构设计、算法原理、基准数据、权衡取舍与工程避坑清单，时间戳精确对应技术细节出现的位置。",
  },
  {
    id: "custom",
    label: "自定义提示词",
    instruction: "",
  },
];

export interface TranslationPairPreset {
  id: TranslationPairId;
  label: string;
  sourceLabel: string;
  targetLabel: string;
  targetIsChinese: boolean;
}

export const TRANSLATION_PAIR_PRESETS: TranslationPairPreset[] = [
  {
    id: "auto-zh",
    label: "自动识别 → 中文",
    sourceLabel: "自动识别原语言（如英文、德文、日文等）",
    targetLabel: "自然流畅的简体中文",
    targetIsChinese: true,
  },
  {
    id: "en-zh",
    label: "英文 → 中文",
    sourceLabel: "英文",
    targetLabel: "自然流畅的简体中文",
    targetIsChinese: true,
  },
  {
    id: "de-zh",
    label: "德文 → 中文",
    sourceLabel: "德文",
    targetLabel: "自然流畅的简体中文",
    targetIsChinese: true,
  },
  {
    id: "ja-zh",
    label: "日文 → 中文",
    sourceLabel: "日文",
    targetLabel: "自然流畅的简体中文",
    targetIsChinese: true,
  },
  {
    id: "fr-zh",
    label: "法文 → 中文",
    sourceLabel: "法文",
    targetLabel: "自然流畅的简体中文",
    targetIsChinese: true,
  },
  {
    id: "ko-zh",
    label: "韩文 → 中文",
    sourceLabel: "韩文",
    targetLabel: "自然流畅的简体中文",
    targetIsChinese: true,
  },
  {
    id: "es-zh",
    label: "西班牙文 → 中文",
    sourceLabel: "西班牙文",
    targetLabel: "自然流畅的简体中文",
    targetIsChinese: true,
  },
  {
    id: "zh-en",
    label: "中文 → 英文",
    sourceLabel: "中文",
    targetLabel: "natural, idiomatic English",
    targetIsChinese: false,
  },
  {
    id: "off",
    label: "关闭",
    sourceLabel: "",
    targetLabel: "",
    targetIsChinese: false,
  },
];

export function getTranslationPairPreset(
  id?: TranslationPairId
): TranslationPairPreset {
  return (
    TRANSLATION_PAIR_PRESETS.find((p) => p.id === id) ??
    TRANSLATION_PAIR_PRESETS[0]
  );
}

export const SYSTEM_TTS_VOICES: Array<{ value: string; label: string }> = [
  { value: "Tingting", label: "婷婷（普通话女声）" },
  { value: "Meijia", label: "美佳（台湾女声）" },
  { value: "Sinji", label: "善怡（粤语女声）" },
  { value: "Flo (中文（中国大陆）)", label: "清禾（柔和女声）" },
  { value: "Sandy (中文（中国大陆）)", label: "晴岚（清亮女声）" },
  { value: "Shelley (中文（中国大陆）)", label: "疏影（知性女声）" },
  { value: "Grandma (中文（中国大陆）)", label: "温润（叙事女声）" },
  { value: "Eddy (中文（中国大陆）)", label: "言川（沉稳男声）" },
  { value: "Reed (中文（中国大陆）)", label: "远山（醇厚男声）" },
  { value: "Rocko (中文（中国大陆）)", label: "明朗（青年男声）" },
  { value: "Grandpa (中文（中国大陆）)", label: "松柏（浑厚男声）" },
  { value: "Shelley (中文（台湾）)", label: "知行（台湾女声）" },
  { value: "Eddy (中文（台湾）)", label: "志明（台湾男声）" },
  { value: "Samantha", label: "Samantha（美式英语）" },
  { value: "Daniel", label: "Daniel（英式英语）" },
  { value: "Kyoko", label: "Kyoko（日语女声）" },
];

export interface CloudTtsPreset {
  id: CloudTtsProviderId;
  label: string;
  pillLabel: string;
  protocol:
    | "xiaomi-mimo"
    | "openai-speech"
    | "doubao"
    | "qwen-dashscope"
    | "minimax"
    | "elevenlabs"
    | "fish-audio";
  baseUrl: string;
  defaultModel: string;
  models: string[];
  voices: Array<{ value: string; label: string }>;
  description: string;
  requiresKey?: boolean;
  applyUrl?: string;
}

export const CLOUD_TTS_PRESETS: CloudTtsPreset[] = [
  {
    id: "doubao-tts",
    label: "豆包语音 TTS (火山引擎 V3)",
    pillLabel: "豆包语音",
    protocol: "doubao",
    baseUrl: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
    defaultModel: "seed-tts-2.0",
    models: ["seed-tts-2.0", "seed-tts-1.1"],
    voices: [
      { value: "zh_female_vv_uranus_bigtts", label: "Vivi 2.0" },
      { value: "zh_male_liufei_uranus_bigtts", label: "刘飞 2.0" },
      { value: "zh_female_xiaohe_uranus_bigtts", label: "小何 2.0" },
      { value: "zh_male_yunzhou_uranus_bigtts", label: "云舟 2.0" },
      { value: "zh_male_xiaotian_uranus_bigtts", label: "小天 2.0" },
      { value: "zh_male_heimao_uranus_bigtts", label: "黑猫警长 2.0" },
      { value: "zh_female_shunv_uranus_bigtts", label: "温柔淑女 2.0" },
      { value: "zh_female_sisi_uranus_bigtts", label: "爽快思思 2.0" },
      { value: "zh_female_cancan_uranus_bigtts", label: "知性灿灿 2.0" },
      { value: "en_male_tim_uranus_bigtts", label: "Tim" },
      { value: "en_female_dacey_uranus_bigtts", label: "Dacey" },
    ],
    description:
      "字节火山引擎豆包大模型语音（V3 单向流接口）。API Key 支持直接填火山 API Key 或「AppID:AccessToken」格式；填过豆包 ASR 可留空复用。",
    requiresKey: true,
    applyUrl: "https://console.volcengine.com/speech/app",
  },
  {
    id: "qwen-tts",
    label: "通义千问 Qwen-TTS (DashScope)",
    pillLabel: "通义 Qwen-TTS",
    protocol: "qwen-dashscope",
    baseUrl:
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    defaultModel: "qwen-tts",
    models: ["qwen-tts", "qwen-tts-latest", "qwen3-tts-flash"],
    voices: [
      { value: "Cherry", label: "Cherry（女声）" },
      { value: "Serena", label: "Serena（温润女声）" },
      { value: "Ethan", label: "Ethan（男声）" },
      { value: "Chelsie", label: "Chelsie（双语）" },
      { value: "Dylan", label: "Dylan（北京男声）" },
      { value: "Jada", label: "Jada（上海女声）" },
      { value: "Sunny", label: "Sunny（四川女声）" },
    ],
    description:
      "阿里云百炼通义 Qwen-TTS 原生多模态合成接口；若已在「AI 翻译」配置过通义千问 Key 可留空复用。",
    requiresKey: true,
    applyUrl: "https://bailian.console.aliyun.com/",
  },
  {
    id: "minimax-tts",
    label: "MiniMax 海螺语音 (speech-02)",
    pillLabel: "MiniMax 海螺",
    protocol: "minimax",
    baseUrl: "https://api.minimax.chat/v1/t2a_v2",
    defaultModel: "speech-02-turbo",
    models: ["speech-02-turbo", "speech-02-hd", "speech-01-turbo"],
    voices: [
      { value: "female-shaonv", label: "活力少女" },
      { value: "female-yujie", label: "知性御姐" },
      { value: "male-qn-qingse", label: "青涩青年" },
      { value: "presenter_male", label: "播客男主播" },
      { value: "presenter_female", label: "播客女主播" },
      { value: "audiobook_female_1", label: "有声书女声" },
    ],
    description:
      "MiniMax 海螺高拟真语音大模型，长文本播客朗读韵律自然，支持中英日多语种。",
    requiresKey: true,
    applyUrl: "https://platform.minimaxi.com/",
  },
  {
    id: "siliconflow-tts",
    label: "硅基流动 CosyVoice2 / FishSpeech",
    pillLabel: "硅基流动",
    protocol: "openai-speech",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "FunAudioLLM/CosyVoice2-0.5B",
    models: [
      "FunAudioLLM/CosyVoice2-0.5B",
      "fishaudio/fish-speech-1.5",
    ],
    voices: [
      { value: "FunAudioLLM/CosyVoice2-0.5B:anna", label: "Anna（沉稳女声）" },
      { value: "FunAudioLLM/CosyVoice2-0.5B:bella", label: "Bella（清亮女声）" },
      { value: "FunAudioLLM/CosyVoice2-0.5B:claire", label: "Claire（温柔女声）" },
      { value: "FunAudioLLM/CosyVoice2-0.5B:alex", label: "Alex（沉稳男声）" },
      { value: "FunAudioLLM/CosyVoice2-0.5B:benjamin", label: "Benjamin（低沉男声）" },
      { value: "FunAudioLLM/CosyVoice2-0.5B:david", label: "David（欢快男声）" },
    ],
    description:
      "硅基流动云端开源语音推理（CosyVoice2 / FishSpeech），性价比极高；已配硅基流动 AI Key 可留空复用。",
    requiresKey: true,
    applyUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  {
    id: "stepfun-tts",
    label: "阶跃星辰 Step-TTS",
    pillLabel: "阶跃星辰",
    protocol: "openai-speech",
    baseUrl: "https://api.stepfun.com/v1",
    defaultModel: "step-tts-mini",
    models: ["step-tts-mini", "step-tts-vivid"],
    voices: [
      { value: "cixingnansheng", label: "磁性男声" },
      { value: "wenrounvsheng", label: "温柔女声" },
      { value: "ganliannvsheng", label: "干练女声" },
      { value: "qingchunshaonv", label: "青春少女" },
    ],
    description: "阶跃星辰语音合成接口，兼容标准 OpenAI Speech 协议，中文口语自然流畅。",
    requiresKey: true,
    applyUrl: "https://platform.stepfun.com/interface-key",
  },
  {
    id: "openai-tts",
    label: "OpenAI 兼容 TTS (gpt-4o-mini-tts / tts-1)",
    pillLabel: "OpenAI",
    protocol: "openai-speech",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini-tts",
    models: ["gpt-4o-mini-tts", "tts-1", "tts-1-hd"],
    voices: [
      { value: "alloy", label: "Alloy" },
      { value: "nova", label: "Nova" },
      { value: "echo", label: "Echo" },
      { value: "shimmer", label: "Shimmer" },
      { value: "coral", label: "Coral" },
      { value: "sage", label: "Sage" },
    ],
    description: "标准 OpenAI /v1/audio/speech 语音合成接口；已配 OpenAI AI Key 可留空复用。",
    requiresKey: true,
    applyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "elevenlabs-tts",
    label: "ElevenLabs (Multilingual v2)",
    pillLabel: "ElevenLabs",
    protocol: "elevenlabs",
    baseUrl: "https://api.elevenlabs.io/v1",
    defaultModel: "eleven_multilingual_v2",
    models: ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5"],
    voices: [
      { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel（自然女声）" },
      { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah（温柔女声）" },
      { value: "pNInz6obpgDQGcFmaJgB", label: "Adam（播客男声）" },
      { value: "ErXwobaYiN019PkySvjV", label: "Antoni（叙事男声）" },
    ],
    description: "海外顶级多语种拟真语音合成，英文与中英混读表现力极强。",
    requiresKey: true,
    applyUrl: "https://elevenlabs.io/app/settings/api-keys",
  },
  {
    id: "fish-audio-tts",
    label: "Fish Audio 云端语音",
    pillLabel: "Fish Audio",
    protocol: "fish-audio",
    baseUrl: "https://api.fish.audio/v1",
    defaultModel: "speech-1.6",
    models: ["speech-1.6", "speech-1.5", "s1"],
    voices: [
      { value: "7f92f8afb8ec43bf81429cc1c9199cb1", label: "知性中文女声" },
      { value: "54a5170264694bfc8e9ad98df7bd89c3", label: "沉稳中文男声" },
      { value: "802e3bc2b27e49c2995d23ef70e6ac89", label: "清晰播报男声" },
    ],
    description: "Fish Audio 云端 TTS 接口，支持社区海量音色 ID（可在「自定义音色」粘贴模型 ID）。",
    requiresKey: true,
    applyUrl: "https://fish.audio/go-api/",
  },
  {
    id: "xiaomi-mimo",
    label: "小米 MiMo 大模型 (mimo-v2.5-tts)",
    pillLabel: "小米 MiMo",
    protocol: "xiaomi-mimo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5-tts",
    models: [
      "mimo-v2.5-tts",
      "mimo-v2.5-tts-voicedesign",
      "mimo-v2.5-tts-voiceclone",
    ],
    voices: [
      { value: "冰糖", label: "冰糖（自然女声）" },
      { value: "茉莉", label: "茉莉（温润播报）" },
      { value: "Mia", label: "Mia（英文/双语）" },
      { value: "Chloe", label: "Chloe（清亮叙事）" },
    ],
    description: "小米 MiMo 语音大模型，支持自然语言风格指令、中英双语与高拟真播客语调。",
    requiresKey: true,
    applyUrl: "https://platform.xiaomimimo.com/",
  },
  {
    id: "deepseek-tts",
    label: "DeepSeek / 自定义兼容语音网关",
    pillLabel: "DeepSeek 兼容",
    protocol: "openai-speech",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "FunAudioLLM/CosyVoice2-0.5B",
    models: ["FunAudioLLM/CosyVoice2-0.5B", "tts-1", "tts-1-hd"],
    voices: [
      { value: "FunAudioLLM/CosyVoice2-0.5B:anna", label: "Anna（女声）" },
      { value: "FunAudioLLM/CosyVoice2-0.5B:alex", label: "Alex（男声）" },
      { value: "alloy", label: "Alloy" },
      { value: "nova", label: "Nova" },
      { value: "echo", label: "Echo" },
    ],
    description:
      "DeepSeek 官方暂无原生 TTS 接口，本项默认指向 OpenAI 兼容 TTS 网关（如硅基流动 / OneAPI / 自建中转），可在「高级设置」自定义节点地址。",
    requiresKey: true,
    applyUrl: "https://cloud.siliconflow.cn/account/ak",
  },
  {
    id: "edge-tts",
    label: "Edge 在线语音（免 Key）",
    pillLabel: "Edge 在线语音",
    protocol: "openai-speech",
    baseUrl: "https://speech.platform.bing.com",
    defaultModel: "edge-neural",
    models: ["edge-neural"],
    voices: [
      { value: "zh-CN-XiaoxiaoNeural", label: "晓晓（女声）" },
      { value: "zh-CN-YunxiNeural", label: "云希（男声）" },
      { value: "zh-CN-XiaoyiNeural", label: "晓伊（女声）" },
      { value: "zh-CN-YunjianNeural", label: "云健（男声）" },
      { value: "zh-TW-HsiaoChenNeural", label: "晓臻（台湾女声）" },
      { value: "zh-HK-HiuMaanNeural", label: "晓曼（粤语女声）" },
    ],
    description: "微软 Edge 神经网络在线语音，免配置 API Key（优先调用本机 edge-tts，未安装时自动回退系统语音）。",
    requiresKey: false,
  },
];

export const LOCAL_TTS_MODEL_CATALOG: Omit<
  LocalTtsModel,
  "installed" | "localPath"
>[] = [
  {
    id: "kokoro-82m",
    name: "Kokoro-82M（超轻量高拟真 · 推荐）",
    engine: "kokoro",
    repoId: "hexgrad/Kokoro-82M",
    sizeLabel: "330 MB",
    description: "仅 82M 参数的高自然度开源 TTS，支持中英日多音色与本地 OpenAI 兼容服务（如 Kokoro-FastAPI）",
    defaultBaseUrl: "http://127.0.0.1:8880/v1",
    voices: [
      { value: "zf_xiaobei", label: "小北（女声）" },
      { value: "zf_xiaoni", label: "小妮（女声）" },
      { value: "zf_xiaoxiao", label: "晓晓（女声）" },
      { value: "zm_yunjian", label: "云健（男声）" },
      { value: "zm_yunxi", label: "云希（男声）" },
      { value: "af_heart", label: "Heart（英文女声）" },
    ],
  },
  {
    id: "cosyvoice2-0.5b",
    name: "CosyVoice2-0.5B（阿里开源中英双语）",
    engine: "cosyvoice",
    repoId: "FunAudioLLM/CosyVoice2-0.5B",
    sizeLabel: "1.2 GB",
    description: "阿里通义实验室开源低延迟流式语音模型，中英混合自然度极高",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    voices: [
      { value: "中文女", label: "中文女声" },
      { value: "中文男", label: "中文男声" },
      { value: "英文女", label: "英文女声" },
      { value: "粤语女", label: "粤语女声" },
    ],
  },
  {
    id: "chattts-local",
    name: "ChatTTS（对话播客自然停顿）",
    engine: "chattts",
    repoId: "2Noise/ChatTTS",
    sizeLabel: "1.1 GB",
    description: "专为对话与播客场景优化，支持自然口语节奏、停顿与语气词",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    voices: [
      { value: "seed_2", label: "知性女声 (Seed 2)" },
      { value: "seed_11", label: "温润男声 (Seed 11)" },
      { value: "seed_2222", label: "自然播报 (Seed 2222)" },
    ],
  },
  {
    id: "fish-speech-1.5",
    name: "Fish Speech 1.5（多语种高表现力）",
    engine: "fish-speech",
    repoId: "fishaudio/fish-speech-1.5",
    sizeLabel: "1.5 GB",
    description: "新一代开源多语种语音合成，支持零样本声音克隆与中英日韩切换",
    defaultBaseUrl: "http://127.0.0.1:8080/v1",
    voices: [
      { value: "default", label: "默认音色" },
      { value: "female", label: "标准女声" },
      { value: "male", label: "标准男声" },
    ],
  },
  {
    id: "sherpa-onnx-vits-zh",
    name: "Sherpa-ONNX VITS 中文（纯 CPU 极速）",
    engine: "sherpa-onnx",
    repoId: "csukuangfj/vits-melo-tts-zh_en",
    sizeLabel: "180 MB",
    description: "超轻量纯 CPU 实时离线推理，支持中英混读，无 GPU 也能毫秒级出声",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    voices: [
      { value: "0", label: "标准女声 (ID 0)" },
      { value: "1", label: "温和女声 (ID 1)" },
    ],
  },
  {
    id: "mimo-audio-7b-instruct",
    name: "小米 MiMo-Audio-7B-Instruct（开源大模型）",
    engine: "mimo-audio",
    repoId: "XiaomiMiMo/MiMo-Audio-7B-Instruct",
    sizeLabel: "14.2 GB",
    description: "支持 Instruct-TTS 情感/语气指令、中英双语与多方言本地离线合成",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    voices: [
      { value: "冰糖", label: "冰糖（女声）" },
      { value: "茉莉", label: "茉莉（播报）" },
      { value: "Mia", label: "Mia（双语）" },
    ],
  },
  {
    id: "mimo-audio-tokenizer",
    name: "小米 MiMo-Audio-Tokenizer（音频分词器）",
    engine: "mimo-audio",
    repoId: "XiaomiMiMo/MiMo-Audio-Tokenizer",
    sizeLabel: "2.4 GB",
    description: "25Hz 8 层 RVQ 语音重建分词器，本地运行 MiMo-Audio 必装组件",
  },
];

export function getCloudTtsPreset(id: CloudTtsProviderId | string): CloudTtsPreset {
  const normalized = id === "xiaomi-mimo-cn" ? "xiaomi-mimo" : id;
  return (
    CLOUD_TTS_PRESETS.find((p) => p.id === normalized) ??
    CLOUD_TTS_PRESETS.find((p) => p.id === "doubao-tts") ??
    CLOUD_TTS_PRESETS[0]
  );
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "light",
  autoPlayNext: true,
  cacheLimitMb: 5120,
  proxyMode: "system",
  proxyUrl: "http://127.0.0.1:7890",
  biliLoggedIn: false,
  llmProvider: "deepseek",
  llmModel: "deepseek-chat",
  llmBaseUrl: "https://api.deepseek.com/v1",
  llmGuideProvider: "default",
  llmTranslateProvider: "default",
  translationStyle: "fast",
  localAiConfigs: {
    codex: getDefaultLocalAiCliConfig("codex"),
    "claude-code": getDefaultLocalAiCliConfig("claude-code"),
    antigravity: getDefaultLocalAiCliConfig("antigravity"),
  },
  asrEngine: "local",
  cloudAsrProvider: "doubao",
  cloudAsrBaseUrl: "https://openspeech.bytedance.com/api/v3",
  cloudAsrModel: "bigmodel",
  localAsrModelId: "qwen3-asr-0.6b",
  guideTemplate: "deep",
  customGuidePrompt: "",
  translationPair: "auto-zh",
  subtitleDisplayMode: "bilingual",
  subtitleZhFontSize: 50,
  subtitleOrigFontSize: 50,
  subtitleFontFamily: "system",
  videoSubtitleStyle: "translucent",
  subtitleShowNextAudioLine: false,
  subtitleOverlayX: 50,
  subtitleOverlayY: 84,
  subscriptionFolders: [],
  uiLanguage: "system",
  showYoutubeSubscribeButton: false,
  showRecommendations: true,
  keepOriginalShowNames: false,
  autoDownloadUpdates: true,
  updateChannel: "stable",
  otaRepo: "luqiming19820311/Arbok1",
  ttsEngine: "local",
  cloudTtsProvider: "doubao-tts",
  cloudTtsModel: "seed-tts-2.0",
  cloudTtsBaseUrl: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  cloudTtsVoice: "zh_female_vv_uranus_bigtts",
  localTtsBaseUrl: "http://127.0.0.1:8000/v1",
  localTtsModelId: "system-enhanced",
  localTtsVoice: "Tingting",
  localTtsVoiceStyle: "用自然、沉稳的播客主持人口吻朗读",
  ttsSpeed: 1,
};

export function getLlmPreset(id: LlmProviderId): LlmProviderPreset {
  return (
    LLM_PROVIDER_PRESETS.find((p) => p.id === id) ?? LLM_PROVIDER_PRESETS[0]
  );
}

export function getCloudAsrPreset(id: CloudAsrProviderId): CloudAsrPreset {
  return (
    CLOUD_ASR_PRESETS.find((p) => p.id === id) ?? CLOUD_ASR_PRESETS[0]
  );
}
