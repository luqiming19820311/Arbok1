import type { NextRequest } from "next/server";
import type { GuideTemplateId } from "@/components/arbok/types";
import {
  MissingApiKeyError,
  generateEpisodeGuide,
} from "@/lib/server/llm";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    templateId?: GuideTemplateId;
    customPrompt?: string;
    force?: boolean;
  };

  try {
    const result = await generateEpisodeGuide(id, {
      templateId: body.templateId,
      customPrompt: body.customPrompt,
      force: body.force ?? true,
      signal: request.signal,
    });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof MissingApiKeyError ? 401 : 400;
    return Response.json(
      {
        code: err instanceof MissingApiKeyError ? err.code : "GUIDE_ERROR",
        error: err instanceof Error ? err.message : "AI 导读生成失败",
      },
      { status }
    );
  }
}
