import { connection } from "next/server";
import { searchApplePodcasts } from "@/lib/server/adapters/podcast";
import { listSubscriptions } from "@/lib/server/db";

export async function GET(request: Request) {
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get("term")?.trim() ?? "";
    if (!term) {
      return Response.json({ results: [] });
    }
    const results = await searchApplePodcasts(term);
    const subs = listSubscriptions();
    const subscribedFeedSet = new Set(
      subs.map((s) => s.sourceUrl?.toLowerCase()).filter(Boolean)
    );
    const subscribedNameSet = new Set(subs.map((s) => s.name.toLowerCase()));

    const enriched = results.map((item) => ({
      ...item,
      subscribed:
        (item.feedUrl
          ? subscribedFeedSet.has(item.feedUrl.toLowerCase())
          : false) || subscribedNameSet.has(item.name.toLowerCase()),
    }));

    return Response.json({ results: enriched });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Apple Podcasts 搜索失败";
    return Response.json({ error: message, results: [] }, { status: 502 });
  }
}
