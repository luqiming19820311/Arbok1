import { connection } from "next/server";
import type { UpdateChannel } from "@/components/arbok/types";
import { getAppSettings } from "@/lib/server/db";
import { checkGitHubUpdate } from "@/lib/server/updates";

export async function GET() {
  await connection();
  const settings = getAppSettings();
  const result = await checkGitHubUpdate({
    repo: settings.otaRepo,
    channel: settings.updateChannel,
  });
  return Response.json(result);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    repo?: string;
    channel?: UpdateChannel;
  };
  const settings = getAppSettings();
  const result = await checkGitHubUpdate({
    repo: body.repo ?? settings.otaRepo,
    channel: body.channel ?? settings.updateChannel,
  });
  return Response.json(result);
}
