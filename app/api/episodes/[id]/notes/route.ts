import type { NextRequest } from "next/server";
import { getEpisodeById, listNotes, upsertNote } from "@/lib/server/db";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    segId?: number;
    body?: string;
    ts?: number;
    quote?: string;
  };
  if (typeof body.segId !== "number" || !body.body?.trim()) {
    return Response.json({ error: "缺少笔记内容或字幕段 ID" }, { status: 400 });
  }
  const ep = getEpisodeById(id);
  const seg = ep?.transcript.find((s) => s.id === body.segId);
  const saved = upsertNote({
    epId: id,
    segId: body.segId,
    ts: body.ts ?? seg?.start ?? 0,
    quote: body.quote ?? seg?.zh ?? seg?.orig ?? "",
    body: body.body.trim(),
  });
  return Response.json({ note: saved, notes: listNotes() });
}
