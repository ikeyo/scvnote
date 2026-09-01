import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { resolveProjectId } from "@/lib/projects";
import { TODO_SELECT, parseTodoKind, parseTodoStatus, resolveNoteLink } from "@/lib/todos";
import { TodoStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    title?: string;
    detail?: string;
    kind?: string;
    status?: string;
    projectId?: string | null;
    noteId?: string | null;
  };

  const data: Prisma.TodoUpdateInput = {};

  if (body.title !== undefined) {
    if (!body.title.trim()) throw new HttpError(400, "할 일 제목이 필요합니다");
    data.title = body.title.trim();
  }
  if (body.detail !== undefined) data.detail = body.detail.trim() || null;

  if (body.kind !== undefined) {
    const kind = parseTodoKind(body.kind);
    if (!kind) throw new HttpError(400, `알 수 없는 종류입니다: ${body.kind}`);
    data.kind = kind;
  }

  if (body.status !== undefined) {
    const status = parseTodoStatus(body.status);
    if (!status) throw new HttpError(400, `알 수 없는 상태입니다: ${body.status}`);
    data.status = status;
    // stamp the completion time on the way in, clear it on the way back out
    data.doneAt = status === TodoStatus.DONE ? new Date() : null;
  }

  if (body.noteId !== undefined) {
    const link = await resolveNoteLink(body.noteId);
    data.note = link ? { connect: { id: link.id } } : { disconnect: true };
  }

  if (body.projectId !== undefined) {
    const pid = await resolveProjectId(body.projectId);
    data.project = pid ? { connect: { id: pid } } : { disconnect: true };
  }

  if (Object.keys(data).length === 0) throw new HttpError(400, "바꿀 항목이 없습니다");

  const todo = await prisma.todo
    .update({ where: { id }, data, select: TODO_SELECT })
    .catch(() => {
      throw new HttpError(404, "할 일을 찾을 수 없습니다");
    });

  return Response.json({ todo });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;
  await prisma.todo.delete({ where: { id } }).catch(() => {
    throw new HttpError(404, "할 일을 찾을 수 없습니다");
  });
  return Response.json({ ok: true });
});
