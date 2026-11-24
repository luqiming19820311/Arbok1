import { fetchOfficialSubtitlesForEpisode } from "@/lib/server/adapters";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  try {
    const result = await fetchOfficialSubtitlesForEpisode(id, { force });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "拉取官方字幕失败";
    return Response.json({ error: message, transcript: [] }, { status: 500 });
  }
}
