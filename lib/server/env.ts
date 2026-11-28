import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  EnvDependency,
  LocalAiCliStatus,
  LocalAsrModel,
  LocalCliModelItem,
} from "@/components/arbok/types";
import {
  LOCAL_AI_CLI_METADATA,
  LOCAL_ASR_MODEL_CATALOG,
} from "@/lib/arbok/providers";
import { getDatabasePath } from "./db";

function getBaseDataDir(): string {
  return process.env.ARBOK_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function getModelsDir(): string {
  return process.env.ARBOK_MODELS_DIR ?? path.join(getBaseDataDir(), "models");
}

export function getAudioCacheDir(): string {
  return (
    process.env.ARBOK_CACHE_DIR ??
    path.join(getBaseDataDir(), "cache", "audio")
  );
}

export function resolveBinary(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate.startsWith("/") && fs.existsSync(candidate)) {
      return candidate;
    }
    try {
      const found = execFileSync("/usr/bin/which", [candidate], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      if (found) return found;
    } catch {
      // Try next candidate path.
    }
  }
  return null;
}

function getBinaryVersion(binPath: string, args: string[]): string {
  try {
    const out = execFileSync(binPath, args, {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const firstLine = out.split(/\r?\n/).find((line) => line.trim().length > 0);
    return firstLine?.trim().slice(0, 72) ?? "已安装";
  } catch {
    return "已安装";
  }
}

export function listLocalAsrModels(): LocalAsrModel[] {
  const dir = getModelsDir();
  return LOCAL_ASR_MODEL_CATALOG.map((model) => {
    const candidate = path.join(/*turbopackIgnore: true*/ dir, model.filename);
    const exists =
      fs.existsSync(/*turbopackIgnore: true*/ candidate) &&
      fs.statSync(/*turbopackIgnore: true*/ candidate).size > 0;
    return {
      ...model,
      installed: exists,
      localPath: exists ? candidate : undefined,
    };
  });
}

export function inspectEnvironment(): EnvDependency[] {
  const home = process.env.HOME ?? "";
  const ytdlp = resolveBinary([
    path.join(home, ".local", "bin", "yt-dlp"),
    "/opt/homebrew/bin/yt-dlp",
    "/usr/local/bin/yt-dlp",
    "yt-dlp",
  ]);
  const ffmpeg = resolveBinary([
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "ffmpeg",
  ]);
  const whisper = resolveBinary([
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
    "whisper-cli",
    "whisper-cpp",
  ]);
  const llamaMtmd = resolveBinary([
    "/opt/homebrew/bin/llama-mtmd-cli",
    "/usr/local/bin/llama-mtmd-cli",
    "llama-mtmd-cli",
  ]);

  const dbPath = getDatabasePath();
  const dbExists = dbPath === ":memory:" || fs.existsSync(dbPath);
  const installedModels = listLocalAsrModels().filter((m) => m.installed).length;

  return [
    {
      name: "yt-dlp",
      available: Boolean(ytdlp),
      path: ytdlp ?? "未检测到",
      version: ytdlp ? getBinaryVersion(ytdlp, ["--version"]) : "未安装",
      installHint: "brew install yt-dlp",
    },
    {
      name: "ffmpeg",
      available: Boolean(ffmpeg),
      path: ffmpeg ?? "未检测到",
      version: ffmpeg ? getBinaryVersion(ffmpeg, ["-version"]) : "未安装",
      installHint: "brew install ffmpeg",
    },
    {
      name: "llama-mtmd-cli (Qwen3-ASR 本地引擎)",
      available: Boolean(llamaMtmd),
      path: llamaMtmd ?? "未检测到",
      version: llamaMtmd ? getBinaryVersion(llamaMtmd, ["--version"]) : "未安装",
      installHint: "brew install llama.cpp",
    },
    {
      name: "whisper-cli (本地离线 ASR)",
      available: Boolean(whisper),
      path: whisper ?? "未检测到",
      version: whisper
        ? `Metal/CPU 就绪 · 已下载 ${installedModels} 个模型`
        : "未安装",
      installHint: "brew install whisper-cpp",
    },
    {
      name: "SQLite 本地库",
      available: dbExists,
      path: dbPath,
      version: `node:sqlite (Node ${process.version})`,
    },
    {
      name: "macOS Keychain",
      available: process.platform === "darwin" && fs.existsSync("/usr/bin/security"),
      path: "/usr/bin/security",
      version:
        process.platform === "darwin"
          ? "系统钥匙串托管已启用"
          : "非 macOS 内存回退",
    },
  ];
}

function readCodexModelsFromDisk(home: string): LocalCliModelItem[] {
  const candidates = [
    path.join(home, ".codex", "models_cache.json"),
    path.join(home, ".codex", "models_cache.codex_work_desktop.json"),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      const entries = Array.isArray(raw)
        ? raw
        : (raw as { models?: unknown[]; data?: unknown[] })?.models ??
          (raw as { data?: unknown[] })?.data ??
          [];
      const items: LocalCliModelItem[] = [];
      const seen = new Set<string>();
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue;
        const m = entry as {
          slug?: string;
          id?: string;
          display_name?: string;
          name?: string;
          visibility?: string;
        };
        if (m.visibility === "hide") continue;
        const id = (m.slug ?? m.id ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          displayName: (m.display_name ?? m.name ?? id).trim() || id,
        });
      }
      if (items.length > 0) {
        return items.slice(0, 8);
      }
    } catch {
      // Fallback to default preset models.
    }
  }
  return [...LOCAL_AI_CLI_METADATA.codex.defaultModels];
}

function readClaudeModelsFromDisk(home: string): LocalCliModelItem[] {
  const defaults = [...LOCAL_AI_CLI_METADATA["claude-code"].defaultModels];
  try {
    const settingsPath = path.join(home, ".claude", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as {
        model?: string;
      };
      const configured = parsed.model?.trim();
      if (configured && !defaults.some((d) => d.id === configured)) {
        return [{ id: configured, displayName: configured }, ...defaults];
      }
    }
  } catch {
    // Ignore unreadable Claude settings.
  }
  return defaults;
}

function readMacAppShortVersion(appPath: string): string | null {
  try {
    const plist = path.join(appPath, "Contents", "Info.plist");
    if (!fs.existsSync(plist)) return null;
    const out = execFileSync(
      "/usr/bin/defaults",
      ["read", path.join(appPath, "Contents", "Info"), "CFBundleShortVersionString"],
      { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function inspectLocalAiClis(): LocalAiCliStatus[] {
  const home = process.env.HOME ?? "";

  const claudeBin = resolveBinary([
    path.join(home, ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    "claude",
  ]);
  const codexBin = resolveBinary([
    path.join(home, ".local", "bin", "codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "codex",
  ]);
  const agyCliBin = resolveBinary([
    path.join(home, ".local", "bin", "agy"),
    "/opt/homebrew/bin/agy",
    "/usr/local/bin/agy",
    "agy",
    "antigravity",
    "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide",
  ]);
  const agyAppInstalled =
    fs.existsSync("/Applications/Antigravity.app") ||
    fs.existsSync("/Applications/Antigravity IDE.app");
  const agyAppVer =
    readMacAppShortVersion("/Applications/Antigravity.app") ??
    readMacAppShortVersion("/Applications/Antigravity IDE.app");

  return [
    {
      id: "claude-code",
      available: Boolean(claudeBin),
      version: claudeBin
        ? getBinaryVersion(claudeBin, ["--version"])
        : LOCAL_AI_CLI_METADATA["claude-code"].defaultVersionLabel,
      vendor: LOCAL_AI_CLI_METADATA["claude-code"].vendor,
      binaryPath: claudeBin ?? undefined,
      models: readClaudeModelsFromDisk(home),
    },
    {
      id: "codex",
      available: Boolean(codexBin),
      version: codexBin
        ? getBinaryVersion(codexBin, ["--version"])
        : LOCAL_AI_CLI_METADATA.codex.defaultVersionLabel,
      vendor: LOCAL_AI_CLI_METADATA.codex.vendor,
      binaryPath: codexBin ?? undefined,
      models: readCodexModelsFromDisk(home),
    },
    {
      id: "antigravity",
      available: Boolean(agyCliBin || agyAppInstalled),
      version: agyAppVer
        ? `antigravity ${agyAppVer}`
        : agyCliBin
          ? getBinaryVersion(agyCliBin, ["--version"])
          : LOCAL_AI_CLI_METADATA.antigravity.defaultVersionLabel,
      vendor: LOCAL_AI_CLI_METADATA.antigravity.vendor,
      binaryPath: agyCliBin ?? (agyAppInstalled ? "/Applications/Antigravity.app" : undefined),
      models: [...LOCAL_AI_CLI_METADATA.antigravity.defaultModels],
    },
  ];
}
