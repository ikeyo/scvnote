import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { resolveProjectId } from "@/lib/projects";
import {
  TODO_ORDER,
  TODO_SELECT,
  buildTodoWhere,
  parseTodoKind,
  parseTodoStatus,
  resolveNoteLink,
} from "@/lib/todos";
import { TodoKind, TodoStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const params = new URL(req.url).searchParams;

  const todos = await prisma.todo.findMany({
    where: await buildTodoWhere(userId, {
      q: params.get("q"),
      kind: params.get("kind"),
      status: params.get("status"),
      project: params.get("project"),
      note: params.get("note"),
      open: params.get("open") === "1",
    }),
    orderBy: TODO_ORDER,
    take: 500,
    select: TODO_SELECT,
  });

  return Response.json({ todos });
});

export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const body = (await req.json()) as {
    title?: string;
    detail?: string;
    kind?: string;
    status?: string;
    projectId?: string | null;
    noteId?: string | null;
    anchorText?: string | null;
  };

  const title = body.title?.trim();
  if (!title) throw new HttpError(400, "할 일 제목이 필요합니다");

  const link = await resolveNoteLink(userId, body.noteId);
  let projectId = await resolveProjectId(userId, body.projectId);
  // a todo raised from inside a note belongs to that note's project by default
  if (!projectId && body.projectId === undefined) projectId = link?.projectId ?? null;

  const todo = await prisma.todo.create({
    data: {
      title,
      detail: body.detail?.trim() || null,
      kind: parseTodoKind(body.kind) ?? TodoKind.TASK,
      status: parseTodoStatus(body.status) ?? TodoStatus.TODO,
      ownerId: userId,
      projectId,
      noteId: link?.id ?? null,
      // only meaningful together with a note - it quotes that note's body
      anchorText: (link && body.anchorText?.trim()) || null,
    },
    select: TODO_SELECT,
  });

  return Response.json({ todo }, { status: 201 });
});
