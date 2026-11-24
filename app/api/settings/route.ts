import { connection } from "next/server";
import type {
  AppSettings,
  CloudAsrProviderId,
  CloudTtsProviderId,
  LlmProviderId,
} from "@/components/arbok/types";
import { getAppSettings, saveAppSettings } from "@/lib/server/db";
import { deleteSecret, getKeychainStatus, setSecret } from "@/lib/server/keychain";
import { enforceTempCacheLruLimit, inspectStorageUsage } from "@/lib/server/storage";

export async function GET() {
  await connection();
  return Response.json({
    settings: getAppSettings(),
    keyStatus: getKeychainStatus(),
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    settings?: Partial<AppSettings>;
    secrets?: {
      llmProvider?: LlmProviderId;
      llmApiKey?: string;
      asrProvider?: CloudAsrProviderId;
      asrApiKey?: string;
      ttsProvider?: CloudTtsProviderId;
      ttsApiKey?: string;
      biliCookie?: string;
    };
  };

  if (body.secrets) {
    if (body.secrets.llmProvider && typeof body.secrets.llmApiKey === "string") {
      if (body.secrets.llmApiKey.trim()) {
        setSecret(`llm:${body.secrets.llmProvider}`, body.secrets.llmApiKey);
      } else {
        deleteSecret(`llm:${body.secrets.llmProvider}`);
      }
    }
    if (body.secrets.asrProvider && typeof body.secrets.asrApiKey === "string") {
      if (body.secrets.asrApiKey.trim()) {
        setSecret(`asr:${body.secrets.asrProvider}`, body.secrets.asrApiKey);
      } else {
        deleteSecret(`asr:${body.secrets.asrProvider}`);
      }
    }
    if (body.secrets.ttsProvider && typeof body.secrets.ttsApiKey === "string") {
      if (body.secrets.ttsApiKey.trim()) {
        setSecret(`tts:${body.secrets.ttsProvider}`, body.secrets.ttsApiKey);
      } else {
        deleteSecret(`tts:${body.secrets.ttsProvider}`);
      }
    }
    if (typeof body.secrets.biliCookie === "string") {
      if (body.secrets.biliCookie.trim()) {
        setSecret("auth:bilibili", body.secrets.biliCookie);
      } else {
        deleteSecret("auth:bilibili");
      }
    }
  }

  const settings = body.settings
    ? saveAppSettings(body.settings)
    : getAppSettings();

  const storage =
    typeof body.settings?.cacheLimitMb === "number"
      ? enforceTempCacheLruLimit(settings.cacheLimitMb).usage
      : inspectStorageUsage();

  return Response.json({
    settings,
    keyStatus: getKeychainStatus(),
    storage,
  });
}
