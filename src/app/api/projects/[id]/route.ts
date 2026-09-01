import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { PROJECT_SELECT } from "@/lib/projects";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;
  const body = (await req.json()) as Record<string, string | boolean | undefined>;

  const data: Prisma.ProjectUpdateInput = {};
  if (typeof body.name === "string") {
    if (!body.name.trim()) throw new HttpError(400, "프로젝트 이름이 필요합니다");
    data.name = body.name.trim();
  }
  if (typeof body.description === "string") data.description = body.description.trim() || null;
  if (typeof body.color === "string") data.color = body.color.trim() || null;
  if (typeof body.archived === "boolean") data.archived = body.archived;

  const project = await prisma.project
    .update({ where: { id }, data, select: PROJECT_SELECT })
    .catch((err: unknown) => {
      if ((err as { code?: string }).code === "P2002") {
        throw new HttpError(409, "같은 이름의 프로젝트가 이미 있습니다");
      }
      throw new HttpError(404, "프로젝트를 찾을 수 없습니다");
    });
  return Response.json({ project });
});

/**
 * Deleting a project does NOT delete its notes - the FK is ON DELETE SET NULL,
 * so they fall back to 미분류.
 */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { _count: { select: { notes: true, secrets: true } } },
  });
  if (!project) throw new HttpError(404, "프로젝트를 찾을 수 없습니다");

  await prisma.project.delete({ where: { id } });
  return Response.json({
    ok: true,
    unassignedNotes: project._count.notes,
    unassignedSecrets: project._count.secrets,
  });
});
