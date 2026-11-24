import { connection } from "next/server";
import {
  getAppSettings,
  getPlayQueue,
  listEpisodes,
  listNotes,
  listSubscriptions,
} from "@/lib/server/db";
import { listLocalAsrDownloadStates } from "@/lib/server/asr";
import { listOfflineDownloadJobs } from "@/lib/server/downloads";
import {
  inspectEnvironment,
  inspectLocalAiClis,
  listLocalAsrModels,
} from "@/lib/server/env";
import { getKeychainStatus } from "@/lib/server/keychain";
import { inspectStorageUsage } from "@/lib/server/storage";
import { listLocalTtsModels } from "@/lib/server/tts";

export async function GET() {
  await connection();
  return Response.json({
    subscriptions: listSubscriptions(),
    episodes: listEpisodes(),
    notes: listNotes(),
    settings: getAppSettings(),
    keyStatus: getKeychainStatus(),
    envDeps: inspectEnvironment(),
    localModels: listLocalAsrModels(),
    localAiClis: inspectLocalAiClis(),
    asrModelDownloads: listLocalAsrDownloadStates(),
    localTtsModels: listLocalTtsModels(),
    storage: inspectStorageUsage(),
    downloadJobs: listOfflineDownloadJobs(),
    playQueue: getPlayQueue(),
  });
}
