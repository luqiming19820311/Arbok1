import type { CloudTtsProviderId, TtsEngine } from "@/components/arbok/types";
import { synthesizeSpeech } from "@/lib/server/tts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      engine?: TtsEngine;
      provider?: CloudTtsProviderId;
      model?: string;
      baseUrl?: string;
      voice?: string;
      speed?: number;
      stylePrompt?: string;
      apiKey?: string;
    };

    const result = await synthesizeSpeech({
      text: body.text ?? "",
      engine: body.engine,
      provider: body.provider,
      model: body.model,
      baseUrl: body.baseUrl,
      voice: body.voice,
      speed: body.speed,
      stylePrompt: body.stylePrompt,
      apiKey: body.apiKey,
    });

    return new Response(new Uint8Array(result.audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.audioBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TTS 语音合成失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
