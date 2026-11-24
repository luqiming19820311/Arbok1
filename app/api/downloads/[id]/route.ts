import type { NextRequest } from "next/server";
import { listEpisodes } from "@/lib/server/db";
import {
  listOfflineDownloadJobs,
  removeOfflineDownload,
} from "@/lib/server/downloads";
import { inspectStorageUsage } from "@/lib/server/storage";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  removeOfflineDownload(id);
  return Response.json({
    jobs: listOfflineDownloadJobs(),
    episodes: listEpisodes(),
    storage: inspectStorageUsage(),
  });
}
