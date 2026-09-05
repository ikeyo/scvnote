import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { ProjectRole } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Project-scoped sharing model: a note/todo with `projectId` set is visible to
 * every member of that project. Unassigned (`projectId = null`) items are
 * private to whoever created them. Secrets are the one exception - see
 * secretVisibilityWhere below.
 */

export async function memberProjectIds(userId: string): Promise<string[]> {
  const rows = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

export async function projectRole(userId: string, projectId: string): Promise<ProjectRole | null> {
  const row = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return row?.role ?? null;
}

/** Notes/todos visible to this user: their own unassigned ones, plus anything in a project they belong to. */
export async function ownedOrMemberWhere(
  userId: string,
): Promise<Prisma.NoteWhereInput & Prisma.TodoWhereInput> {
  const projectIds = await memberProjectIds(userId);
  return {
    OR: [
      { ownerId: userId, projectId: null },
      ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
    ],
  };
}

/**
 * A secret is visible if the caller owns it (personal, `shared = false`), or
 * it's `shared = true` on a project the caller belongs to. Sharing works via
 * a project key wrapped per-member with public-key crypto - see
 * `src/lib/crypto-client.ts` - rather than the item's own ciphertext, which
 * stays a single AES-GCM blob either way.
 */
export async function secretVisibilityWhere(userId: string): Promise<Prisma.SecretWhereInput> {
  const projectIds = await memberProjectIds(userId);
  return {
    OR: [
      { ownerId: userId, shared: false },
      ...(projectIds.length > 0 ? [{ shared: true, projectId: { in: projectIds } }] : []),
    ],
  };
}

/**
 * Personal secrets: owner only. Shared secrets: any member of their project.
 * 404s (not 403) either way a stranger can't distinguish "doesn't exist"
 * from "not yours".
 */
export async function requireSecretAccess(
  userId: string,
  secretId: string,
): Promise<{ id: string; ownerId: string; shared: boolean; projectId: string | null }> {
  const secret = await prisma.secret.findUnique({
    where: { id: secretId },
    select: { id: true, ownerId: true, shared: true, projectId: true },
  });
  if (!secret) throw new HttpError(404, "항목을 찾을 수 없습니다");

  const visible = secret.shared
    ? secret.projectId !== null && (await projectRole(userId, secret.projectId)) !== null
    : secret.ownerId === userId;
  if (!visible) throw new HttpError(404, "항목을 찾을 수 없습니다");
  return secret;
}

/** Whether this user currently holds this project's shared vault key. */
export async function hasProjectVaultKey(userId: string, projectId: string): Promise<boolean> {
  const row = await prisma.projectVaultKey.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Throws 404 if the project doesn't exist, 403 if the user isn't a member.
 * 404-before-403 so a stranger can't tell "doesn't exist" from "not yours"
 * by probing IDs.
 */
export async function requireProjectMember(
  userId: string,
  projectId: string,
): Promise<ProjectRole> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new HttpError(404, "프로젝트를 찾을 수 없습니다");

  const role = await projectRole(userId, projectId);
  if (!role) throw new HttpError(403, "이 프로젝트의 멤버가 아닙니다");
  return role;
}

/** OWNER role, or a site admin acting as a break-glass fallback. */
export async function requireProjectOwner(
  user: { id: string; isAdmin: boolean },
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new HttpError(404, "프로젝트를 찾을 수 없습니다");
  if (user.isAdmin) return;

  const role = await projectRole(user.id, projectId);
  if (role !== ProjectRole.OWNER) throw new HttpError(403, "프로젝트 소유자만 할 수 있습니다");
}

/**
 * A note is visible if the caller owns it (when unassigned) or is a member
 * of the project it belongs to. Returns null when neither holds.
 */
export async function noteAccess(
  userId: string,
  noteId: string,
): Promise<{ id: string; ownerId: string; projectId: string | null } | null> {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { id: true, ownerId: true, projectId: true },
  });
  if (!note) return null;
  if (note.projectId) {
    const role = await projectRole(userId, note.projectId);
    return role ? note : null;
  }
  return note.ownerId === userId ? note : null;
}

export async function requireNoteAccess(
  userId: string,
  noteId: string,
): Promise<{ id: string; ownerId: string; projectId: string | null }> {
  const note = await noteAccess(userId, noteId);
  if (!note) throw new HttpError(404, "노트를 찾을 수 없습니다");
  return note;
}

/**
 * Tags are a shared namespace (so "docker" doesn't fork into five differently-
 * cased rows), but renaming/merging/deleting one touches every note that
 * carries it - including notes the caller can't see. This checks whether any
 * such invisible note exists, so those destructive ops can refuse rather than
 * silently editing someone else's private data.
 */
export async function tagOnlyTouchesVisibleNotes(userId: string, tagId: string): Promise<boolean> {
  const visibility = await ownedOrMemberWhere(userId);
  const invisibleCount = await prisma.note.count({
    where: { tags: { some: { id: tagId } }, NOT: visibility },
  });
  return invisibleCount === 0;
}

/** Same rule as notes: visible if owned (unassigned) or the caller is a project member. */
export async function requireTodoAccess(userId: string, todoId: string): Promise<void> {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: { ownerId: true, projectId: true },
  });
  if (!todo) throw new HttpError(404, "할 일을 찾을 수 없습니다");

  const visible = todo.projectId
    ? (await projectRole(userId, todo.projectId)) !== null
    : todo.ownerId === userId;
  if (!visible) throw new HttpError(404, "할 일을 찾을 수 없습니다");
}
