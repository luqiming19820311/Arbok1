import type { LlmProviderId } from "@/components/arbok/types";
import { testLlmConnection } from "@/lib/server/llm";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    provider?: LlmProviderId;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  };

  const result = await testLlmConnection({
    provider: body.provider,
    model: body.model,
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
  });

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
