import type { UiLanguage } from "@/components/arbok/types";

export const UI_LANGUAGE_OPTIONS: Array<{ value: UiLanguage; label: string }> = [
  { value: "system", label: "跟随系统（简体中文）" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

export type ResolvedUiLocale = "zh-CN" | "zh-TW" | "en" | "ja";

export function resolveUiLocale(lang?: UiLanguage): ResolvedUiLocale {
  if (!lang || lang === "system" || lang === "zh-CN") return "zh-CN";
  return lang;
}

export interface UiCopy {
  navHome: string;
  navHistory: string;
  navNotes: string;
  navOffline: string;
  navSubscriptions: string;
  navAddSource: string;
  navSettings: string;
  settingsTitle: string;
  settingsSubtitle: string;
  settingsClose: string;
  tabSubtitles: string;
  tabGeneral: string;
  tabNetwork: string;
  tabBili: string;
  tabLlm: string;
  tabAsr: string;
  tabTts: string;
  tabEnv: string;
  tabAbout: string;
  themeLabel: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
  interfaceTitle: string;
  interfaceLangLabel: string;
  showYtSubBtn: string;
  showRecs: string;
  keepOrigNames: string;
  keepOrigNamesDesc: string;
  autoPlayNext: string;
  autoPlayNextDesc: string;
  homeContinue: string;
  homeLatest: string;
  homeRecommended: string;
  homeMoreRecs: string;
  homeSubscriptions: string;
  ytSubscribeAction: string;
}

const COPY_TABLE: Record<ResolvedUiLocale, UiCopy> = {
  "zh-CN": {
    navHome: "首页",
    navHistory: "收听记录",
    navNotes: "收藏与笔记",
    navOffline: "离线下载",
    navSubscriptions: "订阅",
    navAddSource: "添加链接 / 订阅",
    navSettings: "偏好设置",
    settingsTitle: "Arbok 偏好设置",
    settingsSubtitle: "凭据仅存本机 macOS Keychain，业务数据持久化至本地 SQLite",
    settingsClose: "关闭",
    tabSubtitles: "字幕",
    tabGeneral: "常规与存储",
    tabNetwork: "网络与代理",
    tabBili: "B站账号鉴权",
    tabLlm: "AI 翻译",
    tabAsr: "语音转写 (ASR)",
    tabTts: "语音播报 (TTS)",
    tabEnv: "环境检测",
    tabAbout: "关于",
    themeLabel: "外观主题",
    themeSystem: "跟随系统",
    themeLight: "浅色模式",
    themeDark: "深色模式",
    interfaceTitle: "界面",
    interfaceLangLabel: "界面语言",
    showYtSubBtn: "显示节目的 YouTube 订阅按钮",
    showRecs: "在侧栏显示 Arbok 推荐",
    keepOrigNames: "外文节目名不翻译",
    keepOrigNamesDesc: "侧栏和订阅列表保留原名，如 Lenny's Podcast。自己改过的名字不受影响。",
    autoPlayNext: "自动连播下一集",
    autoPlayNextDesc: "当前单集播放完毕后自动续播列表中的下一条内容",
    homeContinue: "接下来听",
    homeLatest: "最新单集",
    homeRecommended: "为你推荐",
    homeMoreRecs: "更多推荐",
    homeSubscriptions: "订阅节目",
    ytSubscribeAction: "YouTube 订阅",
  },
  "zh-TW": {
    navHome: "首頁",
    navHistory: "收聽紀錄",
    navNotes: "收藏與筆記",
    navOffline: "離線下載",
    navSubscriptions: "訂閱",
    navAddSource: "新增連結 / 訂閱",
    navSettings: "偏好設定",
    settingsTitle: "Arbok 偏好設定",
    settingsSubtitle: "憑證僅存本機 macOS Keychain，資料持久化至本地 SQLite",
    settingsClose: "關閉",
    tabSubtitles: "字幕",
    tabGeneral: "一般與儲存",
    tabNetwork: "網路與代理",
    tabBili: "B站帳號驗證",
    tabLlm: "AI 翻譯",
    tabAsr: "語音轉寫 (ASR)",
    tabTts: "語音播報 (TTS)",
    tabEnv: "環境檢測",
    tabAbout: "關於",
    themeLabel: "外觀主題",
    themeSystem: "跟隨系統",
    themeLight: "淺色模式",
    themeDark: "深色模式",
    interfaceTitle: "介面",
    interfaceLangLabel: "介面語言",
    showYtSubBtn: "顯示節目的 YouTube 訂閱按鈕",
    showRecs: "在側欄顯示 Arbok 推薦",
    keepOrigNames: "外文節目名不翻譯",
    keepOrigNamesDesc: "側欄和訂閱列表保留原名，如 Lenny's Podcast。自己改過的名字不受影響。",
    autoPlayNext: "自動連播下一集",
    autoPlayNextDesc: "目前單集播放完畢後自動續播清單中的下一條內容",
    homeContinue: "接下來聽",
    homeLatest: "最新單集",
    homeRecommended: "為你推薦",
    homeMoreRecs: "更多推薦",
    homeSubscriptions: "訂閱節目",
    ytSubscribeAction: "YouTube 訂閱",
  },
  en: {
    navHome: "Home",
    navHistory: "History",
    navNotes: "Saved & Notes",
    navOffline: "Downloads",
    navSubscriptions: "Subscriptions",
    navAddSource: "Add Link / Feed",
    navSettings: "Preferences",
    settingsTitle: "Arbok Preferences",
    settingsSubtitle: "Secrets stay in local macOS Keychain; library persists in local SQLite",
    settingsClose: "Close",
    tabSubtitles: "Subtitles",
    tabGeneral: "General & Storage",
    tabNetwork: "Network & Proxy",
    tabBili: "Bilibili Auth",
    tabLlm: "AI Translation",
    tabAsr: "Transcription (ASR)",
    tabTts: "Voice (TTS)",
    tabEnv: "Diagnostics",
    tabAbout: "About",
    themeLabel: "Appearance",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    interfaceTitle: "Interface",
    interfaceLangLabel: "Interface Language",
    showYtSubBtn: "Show YouTube subscribe button on episodes",
    showRecs: "Show Arbok recommendations in sidebar",
    keepOrigNames: "Keep original foreign show names",
    keepOrigNamesDesc: "Keep original titles like Lenny's Podcast in the sidebar and lists. Custom renames are unaffected.",
    autoPlayNext: "Auto-play next episode",
    autoPlayNextDesc: "Automatically continue playing the next episode in the list when finished",
    homeContinue: "Up Next",
    homeLatest: "Latest Episodes",
    homeRecommended: "Recommended",
    homeMoreRecs: "More",
    homeSubscriptions: "Subscriptions",
    ytSubscribeAction: "Subscribe on YouTube",
  },
  ja: {
    navHome: "ホーム",
    navHistory: "再生履歴",
    navNotes: "保存とノート",
    navOffline: "オフライン",
    navSubscriptions: "登録チャンネル",
    navAddSource: "URL / 登録を追加",
    navSettings: "環境設定",
    settingsTitle: "Arbok 環境設定",
    settingsSubtitle: "認証情報はローカルの macOS Keychain に保存され、データは SQLite に永続化されます",
    settingsClose: "閉じる",
    tabSubtitles: "字幕",
    tabGeneral: "一般とストレージ",
    tabNetwork: "ネットワーク",
    tabBili: "Bilibili 認証",
    tabLlm: "AI 翻訳",
    tabAsr: "文字起こし (ASR)",
    tabTts: "音声読み上げ (TTS)",
    tabEnv: "環境チェック",
    tabAbout: "このアプリについて",
    themeLabel: "外観テーマ",
    themeSystem: "システムに従う",
    themeLight: "ライト",
    themeDark: "ダーク",
    interfaceTitle: "インターフェース",
    interfaceLangLabel: "表示言語",
    showYtSubBtn: "番組の YouTube 登録ボタンを表示",
    showRecs: "サイドバーに Arbok おすすめを表示",
    keepOrigNames: "外国語の番組名を翻訳しない",
    keepOrigNamesDesc: "Lenny's Podcast などの原題をそのまま表示します。手動で変更した名前は維持されます。",
    autoPlayNext: "次のエピソードを自動再生",
    autoPlayNextDesc: "現在のエピソード終了後にリストの次の項目を自動で再生します",
    homeContinue: "次に聴く",
    homeLatest: "最新エピソード",
    homeRecommended: "おすすめ",
    homeMoreRecs: "もっと見る",
    homeSubscriptions: "登録番組",
    ytSubscribeAction: "YouTube で登録",
  },
};

export function getUiCopy(lang?: UiLanguage): UiCopy {
  return COPY_TABLE[resolveUiLocale(lang)];
}
