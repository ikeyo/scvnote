import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireProjectOwner } from "@/lib/access";
import { attachMyRole, projectSelect } from "@/lib/projects";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Rename/describe/archive - project OWNER or a site admin. */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectOwner(user, id);

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
    .update({ where: { id }, data, select: projectSelect(user.id) })
    .catch((err: unknown) => {
      if ((err as { code?: string }).code === "P2002") {
        throw new HttpError(409, "같은 이름의 프로젝트가 이미 있습니다");
      }
      throw new HttpError(404, "프로젝트를 찾을 수 없습니다");
    });
  return Response.json({ project: attachMyRole(project) });
});

/**
 * Deleting a project does NOT delete its notes - the FK is ON DELETE SET NULL,
 * so they fall back to each note's owner as a private, unassigned item.
 * Personal secrets (shared=false, grandfathered from before project sharing
 * existed) fall back the same way. Shared secrets can't: nothing can decrypt
 * them once the project - and with it every ProjectVaultKey wrap - is gone,
 * so leaving the row behind would just orphan an undecryptable, invisible
 * item forever. They're deleted outright instead, ahead of the project
 * itself, and the count is returned so the caller can be told what happened.
 * Requires project OWNER or a site admin.
 */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectOwner(user, id);

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      _count: {
        select: { notes: true, secrets: { where: { ownerId: user.id, shared: false } } },
      },
    },
  });
  if (!project) throw new HttpError(404, "프로젝트를 찾을 수 없습니다");

  const [{ count: deletedSharedSecrets }] = await prisma.$transaction([
    prisma.secret.deleteMany({ where: { projectId: id, shared: true } }),
    prisma.project.delete({ where: { id } }),
  ]);

  return Response.json({
    ok: true,
    unassignedNotes: project._count.notes,
    unassignedSecrets: project._count.secrets,
    deletedSharedSecrets,
  });
});
