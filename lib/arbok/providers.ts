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
  { value: "Tingting", label: "婷婷（女声）" },
  { value: "Meijia", label: "美嘉（台湾女声）" },
  { value: "Flo (中文（中国大陆）)", label: "清禾（女声）" },
  { value: "Sandy (中文（中国大陆）)", label: "晴岚（女声）" },
  { value: "Grandma (中文（中国大陆）)", label: "温润（女声）" },
  { value: "Eddy (中文（中国大陆）)", label: "言川（男声）" },
  { value: "Reed (中文（中国大陆）)", label: "远山（男声）" },
  { value: "Rocko (中文（中国大陆）)", label: "明朗（男声）" },
];

export interface CloudTtsPreset {
  id: CloudTtsProviderId;
  label: string;
  pillLabel: string;
  protocol: "xiaomi-mimo" | "openai-speech";
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
    label: "豆包语音 TTS",
    pillLabel: "豆包语音",
    protocol: "openai-speech",
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
    description: "中文自然度高，支持多情感音色和原声重塑。朗读时文字会发送到豆包语音。",
    requiresKey: true,
    applyUrl: "https://console.volcengine.com/speech/app",
  },
  {
    id: "deepseek-tts",
    label: "DeepSeek 兼容语音",
    pillLabel: "DeepSeek",
    protocol: "openai-speech",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "tts-1",
    models: ["tts-1", "tts-1-hd"],
    voices: [
      { value: "alloy", label: "Alloy" },
      { value: "nova", label: "Nova" },
      { value: "echo", label: "Echo" },
    ],
    description: "OpenAI 兼容语音合成网关，支持自定义兼容节点。",
    requiresKey: true,
    applyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "xiaomi-mimo",
    label: "小米 MiMo 大模型 (mimo-v2.5-tts · 全球接口)",
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
    id: "qwen-tts",
    label: "通义 Qwen-TTS (DashScope)",
    pillLabel: "通义 Qwen-TTS",
    protocol: "openai-speech",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-tts",
    models: ["qwen-tts", "qwen-tts-latest"],
    voices: [
      { value: "Cherry", label: "Cherry（女声）" },
      { value: "Serena", label: "Serena（温润女声）" },
      { value: "Ethan", label: "Ethan（男声）" },
      { value: "Chelsie", label: "Chelsie（双语）" },
    ],
    description: "阿里云通义语音大模型，支持中英文自然韵律合成。",
    requiresKey: true,
    applyUrl: "https://bailian.console.aliyun.com/",
  },
  {
    id: "openai-tts",
    label: "OpenAI 兼容 TTS (tts-1 / gpt-4o-mini-tts)",
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
    ],
    description: "标准 /v1/audio/speech 语音合成接口。",
    requiresKey: true,
    applyUrl: "https://platform.openai.com/api-keys",
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
    ],
    description: "微软 Edge 神经网络在线语音，免配置 API Key（需本机安装 edge-tts 或自动回退系统语音）。",
    requiresKey: false,
  },
  {
    id: "xiaomi-mimo-cn",
    label: "小米 MiMo (国内节点)",
    pillLabel: "小米 MiMo (国内)",
    protocol: "xiaomi-mimo",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
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
    description: "小米 MiMo 国内直连节点，低延迟中文语音合成。",
    requiresKey: true,
    applyUrl: "https://platform.xiaomimimo.com/",
  },
];

export const LOCAL_TTS_MODEL_CATALOG: Omit<
  LocalTtsModel,
  "installed" | "localPath"
>[] = [
  {
    id: "mimo-audio-7b-instruct",
    name: "小米 MiMo-Audio-7B-Instruct（核心语音大模型）",
    engine: "mimo-audio",
    repoId: "XiaomiMiMo/MiMo-Audio-7B-Instruct",
    sizeLabel: "14.2 GB",
    description: "支持 Instruct-TTS 情感/语气指令、中英双语与多方言本地离线合成",
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

export function getCloudTtsPreset(id: CloudTtsProviderId): CloudTtsPreset {
  return (
    CLOUD_TTS_PRESETS.find((p) => p.id === id) ??
    CLOUD_TTS_PRESETS.find((p) => p.id === "xiaomi-mimo") ??
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
  subtitleZhFontSize: 100,
  subtitleOrigFontSize: 100,
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
