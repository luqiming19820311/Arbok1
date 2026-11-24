import { connection } from "next/server";
import { proxyEpisodeMediaStream } from "@/lib/server/stream";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "video" ? "video" : "audio";
  const quality = searchParams.get("quality") ?? undefined;
  const rangeHeader = request.headers.get("range");

  return proxyEpisodeMediaStream(id, { mode, quality, rangeHeader });
}
