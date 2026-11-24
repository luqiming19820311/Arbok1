import { connection } from "next/server";
import {
  deleteLocalTtsModel,
  downloadLocalTtsModel,
  listLocalTtsModels,
} from "@/lib/server/tts";

export async function GET() {
  await connection();
  return Response.json({ models: listLocalTtsModels() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { modelId?: string };
    if (!body.modelId) {
      return Response.json({ error: "缺少 modelId" }, { status: 400 });
    }
    const models = await downloadLocalTtsModel(body.modelId);
    return Response.json({ models });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "下载本地 MiMo TTS 模型失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { modelId?: string };
  if (!body.modelId) {
    return Response.json({ error: "缺少 modelId" }, { status: 400 });
  }
  return Response.json({ models: deleteLocalTtsModel(body.modelId) });
}
