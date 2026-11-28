import type { NextRequest } from "next/server";
import type { TranslationPairId } from "@/components/arbok/types";
import {
  MissingApiKeyError,
  translateEpisodeTranscript,
} from "@/lib/server/llm";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    force?: boolean;
    translationPair?: TranslationPairId;
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const sendRaw = (chunk: string) => {
        if (closed || request.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (payload: unknown) => {
        sendRaw(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const heartbeat = setInterval(() => {
        sendRaw(": keepalive\n\n");
      }, 8000);

      try {
        const result = await translateEpisodeTranscript(id, {
          force: body.force,
          translationPair: body.translationPair,
          signal: request.signal,
          onBatch: (batch) => {
            send({ type: "batch", ...batch });
          },
        });
        send({
          type: "done",
          total: result.total,
          translatedNow: result.translatedNow,
          cachedCount: result.cachedCount,
          missingCount: result.missingCount,
          segments: result.segments,
        });
      } catch (err) {
        send({
          type: "error",
          code: err instanceof MissingApiKeyError ? err.code : "TRANSLATE_ERROR",
          message: err instanceof Error ? err.message : "双语翻译失败",
        });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Stream already closed by client disconnect.
          }
        }
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
