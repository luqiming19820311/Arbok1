import { connection, type NextRequest } from "next/server";
import { getEpisodeById, updateEpisodeFields } from "@/lib/server/db";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await context.params;
  const episode = getEpisodeById(id);
  if (!episode) {
    return Response.json({ error: "未找到该单集" }, { status: 404 });
  }
  return Response.json({ episode });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    positionSec?: number;
    isOffline?: boolean;
    localFilePath?: string;
  };
  updateEpisodeFields(id, body);
  const episode = getEpisodeById(id);
  return Response.json({ episode });
}
