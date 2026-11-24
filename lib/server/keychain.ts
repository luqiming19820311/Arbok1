import { execFileSync } from "node:child_process";
import type { KeychainStatus } from "@/components/arbok/types";
import {
  CLOUD_ASR_PRESETS,
  CLOUD_TTS_PRESETS,
  LLM_PROVIDER_PRESETS,
} from "@/lib/arbok/providers";

const KEYCHAIN_SERVICE = "com.arbok.credentials";

const memoryStore = new Map<string, string>();

function isMemoryMode(): boolean {
  return (
    process.env.ARBOK_KEYCHAIN_MODE === "memory" ||
    process.env.NODE_ENV === "test" ||
    process.platform !== "darwin"
  );
}

export function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return "••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function setSecret(account: string, value: string): void {
  const cleaned = value.trim();
  if (!cleaned) {
    deleteSecret(account);
    return;
  }

  if (isMemoryMode()) {
    memoryStore.set(account, cleaned);
    return;
  }

  try {
    execFileSync(
      "/usr/bin/security",
      [
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        account,
        "-w",
        cleaned,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch {
    memoryStore.set(account, cleaned);
  }
}

export function getSecret(account: string): string | null {
  if (isMemoryMode()) {
    return memoryStore.get(account) ?? null;
  }

  try {
    const out = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const trimmed = out.trim();
    return trimmed || null;
  } catch {
    return memoryStore.get(account) ?? null;
  }
}

export function deleteSecret(account: string): void {
  memoryStore.delete(account);
  if (isMemoryMode()) return;

  try {
    execFileSync(
      "/usr/bin/security",
      ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch {
    // Entry may not exist yet in macOS Keychain.
  }
}

export function resetMemoryKeychain(): void {
  memoryStore.clear();
}

export function getKeychainStatus(): KeychainStatus {
  const llmKeys: KeychainStatus["llmKeys"] = {};
  for (const preset of LLM_PROVIDER_PRESETS) {
    const val = getSecret(`llm:${preset.id}`);
    llmKeys[preset.id] = {
      configured: Boolean(val),
      masked: maskSecret(val),
    };
  }

  const asrKeys: KeychainStatus["asrKeys"] = {};
  for (const preset of CLOUD_ASR_PRESETS) {
    const val = getSecret(`asr:${preset.id}`);
    asrKeys[preset.id] = {
      configured: Boolean(val),
      masked: maskSecret(val),
    };
  }

  const ttsKeys: KeychainStatus["ttsKeys"] = {};
  for (const preset of CLOUD_TTS_PRESETS) {
    const val = getSecret(`tts:${preset.id}`);
    ttsKeys[preset.id] = {
      configured: Boolean(val),
      masked: maskSecret(val),
    };
  }

  const biliCookie = getSecret("auth:bilibili");
  return {
    llmKeys,
    asrKeys,
    ttsKeys,
    biliCookieConfigured: Boolean(biliCookie),
  };
}
