import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { projectFilter, resolveProjectId } from "@/lib/projects";
import {
  TODO_ORDER,
  TODO_SELECT,
  parseTodoKind,
  parseTodoStatus,
  resolveNoteLink,
} from "@/lib/todos";
import { TodoKind, TodoStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireUserId();
  const params = new URL(req.url).searchParams;

  const where: Prisma.TodoWhereInput = {
    ...(await projectFilter(params.get("project"))),
  };

  const kind = parseTodoKind(params.get("kind"));
  if (kind) where.kind = kind;

  const note = params.get("note");
  if (note) where.noteId = note;

  const status = parseTodoStatus(params.get("status"));
  if (status) where.status = status;
  // the common view: everything still outstanding, regardless of kind
  else if (params.get("open") === "1") where.status = { not: TodoStatus.DONE };

  const q = params.get("q")?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { detail: { contains: q, mode: "insensitive" } },
    ];
  }

  const todos = await prisma.todo.findMany({
    where,
    orderBy: TODO_ORDER,
    take: 500,
    select: TODO_SELECT,
  });

  return Response.json({ todos });
});

export const POST = route(async (req: Request) => {
  await requireUserId();
  const body = (await req.json()) as {
    title?: string;
    detail?: string;
    kind?: string;
    status?: string;
    projectId?: string | null;
    noteId?: string | null;
  };

  const title = body.title?.trim();
  if (!title) throw new HttpError(400, "할 일 제목이 필요합니다");

  const link = await resolveNoteLink(body.noteId);
  let projectId = await resolveProjectId(body.projectId);
  // a todo raised from inside a note belongs to that note's project by default
  if (!projectId && body.projectId === undefined) projectId = link?.projectId ?? null;

  const todo = await prisma.todo.create({
    data: {
      title,
      detail: body.detail?.trim() || null,
      kind: parseTodoKind(body.kind) ?? TodoKind.TASK,
      status: parseTodoStatus(body.status) ?? TodoStatus.TODO,
      projectId,
      noteId: link?.id ?? null,
    },
    select: TODO_SELECT,
  });

  return Response.json({ todo }, { status: 201 });
});
