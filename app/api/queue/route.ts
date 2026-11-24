import { connection } from "next/server";
import { getPlayQueue, savePlayQueue } from "@/lib/server/db";

export async function GET() {
  await connection();
  return Response.json({ playQueue: getPlayQueue() });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    playQueue?: string[];
  };
  if (!Array.isArray(body.playQueue)) {
    return Response.json({ error: "无效的播放队列数据" }, { status: 400 });
  }
  const saved = savePlayQueue(body.playQueue);
  return Response.json({ playQueue: saved });
}
