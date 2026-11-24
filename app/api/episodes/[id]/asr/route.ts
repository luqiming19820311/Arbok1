import { connection, type NextRequest } from "next/server";
import type { AsrEngine } from "@/components/arbok/types";
import { cancelAsrJob, startAsrJob } from "@/lib/server/asr";
import { getAsrJob, getEpisodeById } from "@/lib/server/db";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await context.params;
  const job = getAsrJob(id);
  const episode = getEpisodeById(id);
  return Response.json({
    job: job
      ? {
          episodeId: job.episodeId,
          engine: job.engine,
          provider: job.provider,
          status: job.status,
          progress: job.progress,
          message: job.message,
          completedChunks: job.completedChunks,
          totalChunks: job.totalChunks,
          error: job.error,
          updatedAt: job.updatedAt,
        }
      : null,
    transcript: episode?.transcript ?? [],
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    engine?: AsrEngine;
    localAudioPath?: string;
    force?: boolean;
  };
  try {
    const job = startAsrJob(id, {
      engine: body.engine,
      localAudioPath: body.localAudioPath,
      force: Boolean(body.force),
    });
    return Response.json({ job }, { status: 202 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "启动 ASR 失败" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cancelled = cancelAsrJob(id);
  return Response.json({ ok: cancelled });
}
