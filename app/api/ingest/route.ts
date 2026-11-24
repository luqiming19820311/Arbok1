import { ingestUrl } from "@/lib/server/adapters";
import { listEpisodes, listSubscriptions } from "@/lib/server/db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string; limit?: number };
    const url = body.url?.trim();
    if (!url) {
      return Response.json(
        { error: "请输入有效的播客 RSS、小宇宙、YouTube 或 B站链接" },
        { status: 400 }
      );
    }

    const result = await ingestUrl(url, { limit: body.limit });
    return Response.json({
      ...result,
      subscriptions: listSubscriptions(),
      episodes: listEpisodes(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "解析链接失败，请检查地址或网络";
    return Response.json({ error: message }, { status: 422 });
  }
}
