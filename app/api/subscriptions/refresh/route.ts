import { refreshSubscriptions } from "@/lib/server/adapters";
import { listEpisodes, listSubscriptions } from "@/lib/server/db";

export async function POST(request: Request) {
  try {
    let sourceId: string | undefined;
    try {
      const body = (await request.json()) as { sourceId?: string };
      sourceId = body.sourceId;
    } catch {
      sourceId = undefined;
    }

    const stats = await refreshSubscriptions(sourceId);
    return Response.json({
      ...stats,
      subscriptions: listSubscriptions(),
      episodes: listEpisodes(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "刷新订阅源失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
