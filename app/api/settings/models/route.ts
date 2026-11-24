import type { LlmProviderId } from "@/components/arbok/types";
import { getLlmPreset } from "@/lib/arbok/providers";
import { getSecret } from "@/lib/server/keychain";
import { proxyFetch } from "@/lib/server/proxy";

const CLI_DEFAULT_MODELS: Record<string, string[]> = {
  "claude-code": ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-3-5"],
  codex: ["gpt-5-codex", "o4-mini", "gpt-5"],
  antigravity: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    provider?: LlmProviderId;
    baseUrl?: string;
    apiKey?: string;
  };
  const provider = body.provider ?? "deepseek";
  const preset = getLlmPreset(provider);
  const baseUrl = (body.baseUrl?.trim() || preset.baseUrl).replace(/\/+$/, "");
  const apiKey = body.apiKey?.trim() || getSecret(`llm:${provider}`) || "";

  if (preset.protocol === "cli" && baseUrl.startsWith("cli://")) {
    return Response.json({
      ok: true,
      models: CLI_DEFAULT_MODELS[provider] ?? [preset.defaultModel],
    });
  }

  try {
    const headers: Record<string, string> = {};
    if (apiKey && preset.protocol !== "gemini") {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const url =
      preset.protocol === "gemini" && apiKey
        ? `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`
        : `${baseUrl}/models`;

    const res = await proxyFetch(url, { headers });
    if (!res.ok) {
      return Response.json(
        {
          ok: false,
          models: [preset.defaultModel],
          error: `获取模型列表返回 ${res.status}`,
        },
        { status: 200 }
      );
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ name?: string; id?: string }>;
    };
    const ids = [
      ...(data.data ?? []).map((m) => m.id ?? ""),
      ...(data.models ?? []).map((m) =>
        (m.id ?? m.name ?? "").replace(/^models\//, "")
      ),
    ].filter(Boolean);

    return Response.json({
      ok: true,
      models: ids.length > 0 ? Array.from(new Set(ids)).slice(0, 40) : [preset.defaultModel],
    });
  } catch (err) {
    return Response.json({
      ok: false,
      models: [preset.defaultModel],
      error: err instanceof Error ? err.message : "获取模型列表失败",
    });
  }
}
