import { connection } from "next/server";
import { getAppSettings } from "@/lib/server/db";
import {
  clearTempCache,
  enforceTempCacheLruLimit,
  inspectStorageUsage,
} from "@/lib/server/storage";

export async function GET() {
  await connection();
  return Response.json({
    storage: inspectStorageUsage(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "clear" | "enforce-lru";
    limitMb?: number;
  };

  if (body.action === "enforce-lru") {
    const limitMb =
      typeof body.limitMb === "number"
        ? body.limitMb
        : getAppSettings().cacheLimitMb;
    const result = enforceTempCacheLruLimit(limitMb);
    return Response.json({
      evictedCount: result.evictedFiles.length,
      freedBytes: result.freedBytes,
      storage: result.usage,
    });
  }

  const cleared = clearTempCache();
  return Response.json({
    clearedBytes: cleared.clearedBytes,
    storage: cleared.usage,
  });
}
