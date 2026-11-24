import { connection } from "next/server";
import type { Episode } from "@/components/arbok/types";
import { insertEpisode, listEpisodes } from "@/lib/server/db";

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
