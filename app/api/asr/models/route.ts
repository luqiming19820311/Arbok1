import { connection } from "next/server";
import {
  deleteLocalAsrModel,
  downloadLocalAsrModel,
  listLocalAsrDownloadStates,
  startLocalAsrModelDownload,
} from "@/lib/server/asr";
import { listLocalAsrModels } from "@/lib/server/env";

export async function GET() {
  await connection();
  return Response.json({
    models: listLocalAsrModels(),
    downloads: listLocalAsrDownloadStates(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { modelId?: string; async?: boolean };
  if (!body.modelId) {
    return Response.json({ error: "缺少 modelId" }, { status: 400 });
  }
  try {
    if (body.async) {
      const download = startLocalAsrModelDownload(body.modelId);
      return Response.json({
        ok: true,
        started: true,
        download,
        downloads: listLocalAsrDownloadStates(),
        models: listLocalAsrModels(),
      });
    }
    const result = await downloadLocalAsrModel(body.modelId);
    return Response.json({
      ok: true,
      result,
      downloads: listLocalAsrDownloadStates(),
      models: listLocalAsrModels(),
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "模型下载失败",
        downloads: listLocalAsrDownloadStates(),
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { modelId?: string };
  if (!body.modelId) {
    return Response.json({ error: "缺少 modelId" }, { status: 400 });
  }
  const removed = deleteLocalAsrModel(body.modelId);
  return Response.json({
    ok: removed,
    models: listLocalAsrModels(),
    downloads: listLocalAsrDownloadStates(),
  });
}
