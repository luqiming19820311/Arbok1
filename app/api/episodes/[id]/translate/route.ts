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
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

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
          segments: result.segments,
        });
      } catch (err) {
        send({
          type: "error",
          code: err instanceof MissingApiKeyError ? err.code : "TRANSLATE_ERROR",
          message: err instanceof Error ? err.message : "双语翻译失败",
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
