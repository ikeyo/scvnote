import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { memberProjectIds } from "@/lib/access";
import { attachMyRole, parseRepoUrl, projectSelect } from "@/lib/projects";
import { ProjectRole } from "@/generated/prisma/enums";
import type { NoteKind } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export type KindCounts = Record<NoteKind, number>;

const emptyCounts = (): KindCounts => ({ NOTE: 0, WORKLOG: 0, SNIPPET: 0 });

export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";

  const projectIds = await memberProjectIds(userId);

  const projects = await prisma.project.findMany({
    where: {
      id: { in: projectIds },
      ...(includeArchived ? {} : { archived: false }),
    },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: projectSelect(userId),
  });

  // one grouped query for every project+kind pair the user is a member of,
  // rather than N queries
  const grouped = await prisma.note.groupBy({
    by: ["projectId", "kind"],
    where: { archived: false, projectId: { in: projectIds } },
    _count: { _all: true },
  });

  const todoGroups = await prisma.todo.groupBy({
    by: ["projectId"],
    where: { status: { not: "DONE" }, projectId: { in: projectIds } },
    _count: { _all: true },
  });
  const openTodos = new Map<string, number>();
  for (const row of todoGroups) {
    if (row.projectId) openTodos.set(row.projectId, row._count._all);
  }

  const byProject = new Map<string, KindCounts>();
  for (const row of grouped) {
    if (!row.projectId) continue;
    const target = byProject.get(row.projectId) ?? byProject.set(row.projectId, emptyCounts()).get(row.projectId)!;
    target[row.kind] = row._count._all;
  }

  // "미분류" is per-user by definition - it's whatever this caller owns
  // outside of any project, never other users' private items
  const [unassignedNoteGroups, unassignedTodos] = await Promise.all([
    prisma.note.groupBy({
      by: ["kind"],
      where: { archived: false, projectId: null, ownerId: userId },
      _count: { _all: true },
    }),
    prisma.todo.count({ where: { projectId: null, ownerId: userId, status: { not: "DONE" } } }),
  ]);
  const unassignedKindCounts = emptyCounts();
  for (const row of unassignedNoteGroups) unassignedKindCounts[row.kind] = row._count._all;

  return Response.json({
    projects: projects.map((p) => ({
      ...attachMyRole(p),
      kindCounts: byProject.get(p.id) ?? emptyCounts(),
      openTodos: openTodos.get(p.id) ?? 0,
    })),
    unassignedNotes: Object.values(unassignedKindCounts).reduce((a, b) => a + b, 0),
    unassignedKindCounts,
    unassignedOpenTodos: unassignedTodos,
  });
});

export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const body = (await req.json()) as Record<string, string | undefined>;
  const name = body.name?.trim();
  if (!name) throw new HttpError(400, "프로젝트 이름이 필요합니다");

  const existing = await prisma.project.findUnique({ where: { name }, select: { id: true } });
  if (existing) throw new HttpError(409, `같은 이름의 프로젝트가 이미 있습니다: ${name}`);

  const project = await prisma.project.create({
    data: {
      name,
      description: body.description?.trim() || null,
      color: body.color?.trim() || null,
      repoUrl: parseRepoUrl(body.repoUrl),
      // the creator is automatically the owning member
      members: { create: { userId, role: ProjectRole.OWNER } },
    },
    select: projectSelect(userId),
  });
  return Response.json(
    { project: { ...attachMyRole(project), kindCounts: emptyCounts(), openTodos: 0 } },
    { status: 201 },
  );
});
