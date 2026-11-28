import { connection } from "next/server";
import type { Episode } from "@/components/arbok/types";
import { insertEpisode, listEpisodes, markEpisodesRead } from "@/lib/server/db";

export async function GET() {
  await connection();
  return Response.json({ episodes: listEpisodes() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Episode;
  if (!body.id || !body.title || !body.pageUrl) {
    return Response.json({ error: "缺少必要单集字段" }, { status: 400 });
  }
  const episode = insertEpisode(body);
  return Response.json({ episode }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    ids?: string[];
    isRead?: boolean;
  };
  if (!Array.isArray(body.ids) || typeof body.isRead !== "boolean") {
    return Response.json({ error: "缺少有效的批量更新参数" }, { status: 400 });
  }
  markEpisodesRead(body.ids, body.isRead);
  return Response.json({ ok: true, count: body.ids.length });
}
