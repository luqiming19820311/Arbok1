import { connection } from "next/server";
import { searchGlobalTranscriptsAndNotes } from "@/lib/server/db";

export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) {
    return Response.json({ hits: [] });
  }
  return Response.json({
    hits: searchGlobalTranscriptsAndNotes(q, 24),
  });
}
