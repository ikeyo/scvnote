import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TODO_ORDER, TODO_SELECT } from "@/lib/todos";
import { NoteEditorView } from "@/components/NoteEditorView";
import type { NoteDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;

  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      tags: { select: { name: true } },
      // without this the editor would render "미분류" and the next autosave
      // would actually move the note there
      project: { select: { id: true, name: true, color: true } },
      todos: { select: TODO_SELECT, orderBy: TODO_ORDER },
      attachments: {
        select: { id: true, originalName: true, storedName: true, mimeType: true, size: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!note) notFound();

  // Date -> string so the payload can cross the server/client boundary
  const initial = { ...note, updatedAt: note.updatedAt.toISOString() } as unknown as NoteDetail;
  return <NoteEditorView initial={initial} />;
}
