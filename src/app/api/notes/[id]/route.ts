import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireNoteAccess } from "@/lib/access";
import { deriveTitle } from "@/lib/markdown";
import { connectTags, parseKind } from "@/lib/notes";
import { resolveProjectId } from "@/lib/projects";
import { removeStored } from "@/lib/attachments";
import { TODO_ORDER, TODO_SELECT } from "@/lib/todos";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireNoteAccess(userId, id); // 404s if missing or not visible to this user

  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      tags: { select: { name: true } },
      project: { select: { id: true, name: true, color: true } },
      todos: { select: TODO_SELECT, orderBy: TODO_ORDER },
      attachments: {
        select: { id: true, originalName: true, storedName: true, mimeType: true, size: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!note) throw new HttpError(404, "노트를 찾을 수 없습니다");

  return Response.json({ note });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireNoteAccess(userId, id);

  const input = (await req.json()) as {
    title?: string;
    body?: string;
    kind?: string;
    tags?: string[];
    pinned?: boolean;
    archived?: boolean;
    projectId?: string | null;
  };

  const data: Prisma.NoteUpdateInput = {};

  if (input.body !== undefined) {
    data.body = input.body;
    // an emptied title falls back to the first line rather than staying blank
    if (input.title !== undefined && !input.title.trim()) data.title = deriveTitle(input.body);
  }
  if (input.title?.trim()) data.title = input.title.trim();
  if (input.kind) data.kind = parseKind(input.kind);
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.archived !== undefined) data.archived = input.archived;
  if (input.projectId !== undefined) {
    const pid = await resolveProjectId(userId, input.projectId);
    data.project = pid ? { connect: { id: pid } } : { disconnect: true };
  }
  if (input.tags !== undefined) {
    // `set: []` first, otherwise removed tags would stay connected
    data.tags = { set: [], ...(connectTags(input.tags) ?? {}) };
  }

  const note = await prisma.note
    .update({
      where: { id },
      data,
      include: { tags: { select: { name: true } }, project: { select: { id: true, name: true } } },
    })
    .catch(() => {
      throw new HttpError(404, "노트를 찾을 수 없습니다");
    });

  return Response.json({ note });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireNoteAccess(userId, id);

  // rows cascade at the DB level, but the files on disk have to go explicitly
  const note = await prisma.note.findUnique({
    where: { id },
    select: { attachments: { select: { storedName: true } } },
  });
  if (!note) throw new HttpError(404, "노트를 찾을 수 없습니다");

  await prisma.note.delete({ where: { id } });
  await Promise.all(note.attachments.map((a) => removeStored(a.storedName)));
  return Response.json({ ok: true });
});
