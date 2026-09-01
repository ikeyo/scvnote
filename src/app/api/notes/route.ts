import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";
import { docToText, deriveTitle } from "@/lib/tiptap-text";
import { NOTE_LIST_SELECT, buildNoteWhere, connectTags, parseKind } from "@/lib/notes";
import { resolveProjectId } from "@/lib/projects";
import { NoteKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireUserId();
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

  const notes = await prisma.note.findMany({
    where: await buildNoteWhere({
      q: url.searchParams.get("q"),
      kind: url.searchParams.get("kind"),
      tag: url.searchParams.get("tag"),
      project: url.searchParams.get("project"),
      archived: url.searchParams.get("archived") === "1",
    }),
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take,
    select: NOTE_LIST_SELECT,
  });

  return Response.json({
    notes: notes.map(({ contentText, ...n }) => ({ ...n, excerpt: contentText.slice(0, 200) })),
  });
});

export const POST = route(async (req: Request) => {
  await requireUserId();
  const body = (await req.json()) as {
    title?: string;
    content?: unknown;
    kind?: string;
    tags?: string[];
    projectId?: string | null;
  };

  const content = body.content ?? { type: "doc", content: [] };
  const contentText = docToText(content);

  const note = await prisma.note.create({
    data: {
      kind: parseKind(body.kind) ?? NoteKind.NOTE,
      title: body.title?.trim() || deriveTitle(contentText),
      content: content as Prisma.InputJsonValue,
      contentText,
      tags: connectTags(body.tags),
      projectId: await resolveProjectId(body.projectId),
    },
    include: { tags: { select: { name: true } }, project: { select: { id: true, name: true } } },
  });

  return Response.json({ note }, { status: 201 });
});
