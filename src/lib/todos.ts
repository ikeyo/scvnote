import { ownedOrMemberWhere, requireNoteAccess } from "@/lib/access";
import { projectFilter } from "@/lib/projects";
import { TodoKind, TodoStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const TODO_KINDS = Object.values(TodoKind) as string[];
export const TODO_STATUSES = Object.values(TodoStatus) as string[];

export function parseTodoKind(value: string | null | undefined): TodoKind | undefined {
  return value && TODO_KINDS.includes(value) ? (value as TodoKind) : undefined;
}

export function parseTodoStatus(value: string | null | undefined): TodoStatus | undefined {
  return value && TODO_STATUSES.includes(value) ? (value as TodoStatus) : undefined;
}

export const TODO_SELECT = {
  id: true,
  kind: true,
  status: true,
  title: true,
  detail: true,
  createdAt: true,
  updatedAt: true,
  doneAt: true,
  ownerId: true,
  project: { select: { id: true, name: true, color: true } },
  note: { select: { id: true, title: true } },
  anchorText: true,
} satisfies Prisma.TodoSelect;

/**
 * Open items first, oldest first inside each group - a backlog reads better
 * than a feed. `status: asc` follows the enum's declared order (TODO, DOING,
 * DONE), so finished items sink to the bottom.
 */
export const TODO_ORDER: Prisma.TodoOrderByWithRelationInput[] = [
  { status: "asc" },
  { createdAt: "asc" },
];

export async function buildTodoWhere(
  userId: string,
  params: {
    q?: string | null;
    kind?: string | null;
    status?: string | null;
    project?: string | null;
    note?: string | null;
    open?: boolean;
  },
): Promise<Prisma.TodoWhereInput> {
  const and: Prisma.TodoWhereInput[] = [await ownedOrMemberWhere(userId)];

  const pf = await projectFilter(userId, params.project);
  if ("projectId" in pf) and.push({ projectId: pf.projectId });

  const kind = parseTodoKind(params.kind);
  if (kind) and.push({ kind });

  if (params.note) and.push({ noteId: params.note });

  const status = parseTodoStatus(params.status);
  if (status) and.push({ status });
  // the common view: everything still outstanding, regardless of kind
  else if (params.open) and.push({ status: { not: TodoStatus.DONE } });

  if (params.q?.trim()) {
    const q = params.q.trim();
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { detail: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: and };
}

/**
 * Validates a `noteId` coming from a request body: the note must exist AND
 * be visible to `userId`. Returns its project, so a todo raised from a note
 * can inherit it. `null` / `undefined` mean "no link" and are not an error.
 */
export async function resolveNoteLink(
  userId: string,
  noteId: string | null | undefined,
): Promise<{ id: string; projectId: string | null } | null> {
  const id = noteId?.trim();
  if (!id) return null;
  const note = await requireNoteAccess(userId, id); // 404s if missing or not visible
  return note;
}
