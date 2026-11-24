import type { NextRequest } from "next/server";
import { deleteNoteById, listNotes } from "@/lib/server/db";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  deleteNoteById(id);
  return Response.json({ ok: true, notes: listNotes() });
}
