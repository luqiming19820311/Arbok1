import { connection } from "next/server";
import { listEpisodes } from "@/lib/server/db";
import {
  cancelOfflineDownload,
  enqueueOfflineDownload,
  listOfflineDownloadJobs,
  pauseOfflineDownload,
} from "@/lib/server/downloads";
import { inspectStorageUsage } from "@/lib/server/storage";

export async function GET() {
  await connection();
  return Response.json({
    jobs: listOfflineDownloadJobs(),
    storage: inspectStorageUsage(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    episodeId?: string;
    action?: "start" | "pause" | "resume" | "cancel";
  };

  if (!body.episodeId) {
    return Response.json({ error: "缺少 episodeId" }, { status: 400 });
  }

  const action = body.action ?? "start";
  try {
    let job = null;
    if (action === "pause") {
      job = pauseOfflineDownload(body.episodeId);
    } else if (action === "cancel") {
      job = cancelOfflineDownload(body.episodeId);
    } else {
      job = enqueueOfflineDownload(body.episodeId);
    }
    return Response.json({
      job,
      jobs: listOfflineDownloadJobs(),
      episodes: listEpisodes(),
      storage: inspectStorageUsage(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "离线下载操作失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
