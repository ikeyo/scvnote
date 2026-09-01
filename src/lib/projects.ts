import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/api";

/** Sentinel used by the UI and MCP to mean "not assigned to any project". */
export const UNASSIGNED = "none";

export const PROJECT_SELECT = {
  id: true,
  name: true,
  description: true,
  color: true,
  archived: true,
  _count: { select: { notes: true, secrets: true, todos: true } },
} as const;

/**
 * Accepts a project id or an exact project name and returns the id.
 * MCP callers only know names, so both have to work.
 */
export async function resolveProjectId(value: string | null | undefined): Promise<string | null> {
  const v = value?.trim();
  if (!v || v === UNASSIGNED) return null;

  const project = await prisma.project.findFirst({
    where: { OR: [{ id: v }, { name: v }] },
    select: { id: true },
  });
  if (!project) throw new HttpError(404, `프로젝트를 찾을 수 없습니다: ${v}`);
  return project.id;
}

/**
 * Turns a filter value into a `where` fragment.
 * Returns `{}` for "no filter", which is different from "unassigned only".
 */
export async function projectFilter(
  value: string | null | undefined,
): Promise<{ projectId?: string | null }> {
  const v = value?.trim();
  if (!v) return {};
  if (v === UNASSIGNED) return { projectId: null };
  return { projectId: await resolveProjectId(v) };
}
