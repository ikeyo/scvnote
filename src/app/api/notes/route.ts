import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";
import { deriveTitle } from "@/lib/markdown";
import { NOTE_LIST_SELECT, buildNoteWhere, connectTags, parseKind } from "@/lib/notes";
import { resolveProjectId } from "@/lib/projects";
import { NoteKind } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

  const notes = await prisma.note.findMany({
    where: await buildNoteWhere(userId, {
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
    // shareToken itself is only sent from the note-detail route, not in bulk lists
    notes: notes.map(({ body, shareToken, ...n }) => ({
      ...n,
      excerpt: body.slice(0, 200),
      isShared: shareToken !== null,
    })),
  });
});

export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const input = (await req.json()) as {
    title?: string;
    body?: string;
    kind?: string;
    tags?: string[];
    projectId?: string | null;
  };

  const body = input.body ?? "";

  const note = await prisma.note.create({
    data: {
      kind: parseKind(input.kind) ?? NoteKind.NOTE,
      title: input.title?.trim() || deriveTitle(body),
      body,
      tags: connectTags(input.tags),
      ownerId: userId,
      projectId: await resolveProjectId(userId, input.projectId),
    },
    include: { tags: { select: { name: true } }, project: { select: { id: true, name: true } } },
  });

  return Response.json({ note }, { status: 201 });
});
