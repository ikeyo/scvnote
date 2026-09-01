import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";
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
  project: { select: { id: true, name: true, color: true } },
  note: { select: { id: true, title: true } },
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

/**
 * Validates a `noteId` coming from a request body and returns the note's own
 * project, so a todo raised from a note can inherit it.
 * `null` / `undefined` mean "no link" and are not an error.
 */
export async function resolveNoteLink(
  noteId: string | null | undefined,
): Promise<{ id: string; projectId: string | null } | null> {
  const id = noteId?.trim();
  if (!id) return null;

  const note = await prisma.note.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!note) throw new HttpError(404, "연결할 노트를 찾을 수 없습니다");
  return note;
}
