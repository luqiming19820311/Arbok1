import type { NextRequest } from "next/server";
import type { LlmProviderId } from "@/components/arbok/types";
import { clearChatMessages } from "@/lib/server/db";
import { MissingApiKeyError, streamEpisodeChat } from "@/lib/server/llm";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    provider?: LlmProviderId | "default";
    model?: string;
  };
  const question = body.question?.trim();
  if (!question) {
    return Response.json({ error: "请输入问题" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      try {
        const result = await streamEpisodeChat(
          id,
          question,
          (delta) => send({ type: "delta", delta }),
          {
            provider:
              body.provider && body.provider !== "default"
                ? body.provider
                : undefined,
            model: body.model?.trim() || undefined,
            signal: request.signal,
          }
        );
        send({
          type: "done",
          userMessage: result.userMessage,
          assistantMessage: result.assistantMessage,
        });
      } catch (err) {
        send({
          type: "error",
          code: err instanceof MissingApiKeyError ? err.code : "CHAT_ERROR",
          message: err instanceof Error ? err.message : "AI 问答失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  clearChatMessages(id);
  return Response.json({ ok: true });
}
