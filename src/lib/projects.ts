import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { memberProjectIds } from "@/lib/access";

/** Sentinel used by the UI and MCP to mean "not assigned to any project". */
export const UNASSIGNED = "none";

/** Every count is project-wide: members see the same notes, todos and secrets. */
export function projectSelect(userId: string) {
  return {
    id: true,
    name: true,
    description: true,
    color: true,
    archived: true,
    // the caller's own membership row - at most one match, used to surface
    // "am I the owner" (see attachMyRole below) without an N+1 query per project
    members: { where: { userId }, select: { role: true } },
    _count: { select: { notes: true, todos: true, secrets: true } },
  } as const;
}

/** Flattens `projectSelect`'s filtered `members` array into a plain `myRole` field. */
export function attachMyRole<T extends { members: { role: string }[] }>(
  project: T,
): Omit<T, "members"> & { myRole: string | null } {
  const { members, ...rest } = project;
  return { ...rest, myRole: members[0]?.role ?? null };
}

/**
 * Accepts a project id or an exact project name and returns the id - but only
 * if `userId` is a member. MCP callers only know names, so both id and name
 * have to work; the membership check stops a user from filing their own
 * notes/secrets into a project they don't belong to.
 */
export async function resolveProjectId(
  userId: string,
  value: string | null | undefined,
): Promise<string | null> {
  const v = value?.trim();
  if (!v || v === UNASSIGNED) return null;

  const project = await prisma.project.findFirst({
    where: { OR: [{ id: v }, { name: v }] },
    select: { id: true },
  });
  if (!project) throw new HttpError(404, `프로젝트를 찾을 수 없습니다: ${v}`);

  const ids = await memberProjectIds(userId);
  if (!ids.includes(project.id)) throw new HttpError(403, `이 프로젝트의 멤버가 아닙니다: ${v}`);
  return project.id;
}

/**
 * Turns a filter value into a `where` fragment.
 * Returns `{}` for "no filter", which is different from "unassigned only".
 * Filtering by an id/name the caller isn't a member of returns "no results"
 * rather than an error - a list endpoint shouldn't 403 on a bad query param.
 */
export async function projectFilter(
  userId: string,
  value: string | null | undefined,
): Promise<{ projectId?: string | null }> {
  const v = value?.trim();
  if (!v) return {};
  if (v === UNASSIGNED) return { projectId: null };
  try {
    return { projectId: await resolveProjectId(userId, v) };
  } catch {
    return { projectId: "__no_match__" }; // an id that can never exist -> empty result set
  }
}
