import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { PROJECT_SELECT } from "@/lib/projects";
import type { NoteKind } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export type KindCounts = Record<NoteKind, number>;

const emptyCounts = (): KindCounts => ({ NOTE: 0, WORKLOG: 0, SNIPPET: 0 });

export const GET = route(async (req: Request) => {
  await requireUserId();
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";

  const projects = await prisma.project.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: PROJECT_SELECT,
  });

  // one grouped query for every project+kind pair, rather than N queries
  const grouped = await prisma.note.groupBy({
    by: ["projectId", "kind"],
    where: { archived: false },
    _count: { _all: true },
  });

  // outstanding todos per project, in one grouped query as well
  const todoGroups = await prisma.todo.groupBy({
    by: ["projectId"],
    where: { status: { not: "DONE" } },
    _count: { _all: true },
  });
  const openTodos = new Map<string, number>();
  let unassignedTodos = 0;
  for (const row of todoGroups) {
    if (row.projectId) openTodos.set(row.projectId, row._count._all);
    else unassignedTodos = row._count._all;
  }

  const byProject = new Map<string, KindCounts>();
  const unassignedCounts = emptyCounts();

  for (const row of grouped) {
    const target = row.projectId
      ? (byProject.get(row.projectId) ?? byProject.set(row.projectId, emptyCounts()).get(row.projectId)!)
      : unassignedCounts;
    target[row.kind] = row._count._all;
  }

  return Response.json({
    projects: projects.map((p) => ({
      ...p,
      kindCounts: byProject.get(p.id) ?? emptyCounts(),
      openTodos: openTodos.get(p.id) ?? 0,
    })),
    unassignedNotes: Object.values(unassignedCounts).reduce((a, b) => a + b, 0),
    unassignedKindCounts: unassignedCounts,
    unassignedOpenTodos: unassignedTodos,
  });
});

export const POST = route(async (req: Request) => {
  await requireUserId();
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
    },
    select: PROJECT_SELECT,
  });
  return Response.json(
    { project: { ...project, kindCounts: emptyCounts(), openTodos: 0 } },
    { status: 201 },
  );
});
