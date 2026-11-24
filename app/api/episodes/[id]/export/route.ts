import { connection, type NextRequest } from "next/server";
import { buildEpisodeMarkdown } from "@/components/arbok/mock-data";
import { getEpisodeById, listNotes } from "@/lib/server/db";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await context.params;
  const ep = getEpisodeById(id);
  if (!ep) {
    return Response.json({ error: "未找到该单集" }, { status: 404 });
  }
  const notes = listNotes(id);
  const markdown = buildEpisodeMarkdown(ep, notes);
  const safeName = ep.title.slice(0, 32).replace(/[\\/:*?"<>|]/g, "") || id;

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.md`,
    },
  });
}
