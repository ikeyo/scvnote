import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireProjectOwner } from "@/lib/access";
import { ProjectRole } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** Promote/demote a member. OWNER or a site admin only. */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id, userId: targetId } = await ctx.params;
  await requireProjectOwner(user, id);

  const { role } = (await req.json()) as { role?: string };
  if (role !== "OWNER" && role !== "MEMBER") throw new HttpError(400, "role은 OWNER 또는 MEMBER여야 합니다");

  const member = await prisma.projectMember
    .update({
      where: { projectId_userId: { projectId: id, userId: targetId } },
      data: { role: role === "OWNER" ? ProjectRole.OWNER : ProjectRole.MEMBER },
      select: { id: true, role: true, user: { select: { id: true, email: true } } },
    })
    .catch(() => {
      throw new HttpError(404, "멤버를 찾을 수 없습니다");
    });
  return Response.json({ member });
});

/**
 * Leaves or removes a member. Anyone can remove themselves; removing someone
 * else needs OWNER or a site admin. The last OWNER can't be removed - promote
 * another member first, or have an admin delete the project outright.
 */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id, userId: targetId } = await ctx.params;

  const isSelf = targetId === user.id;
  if (!isSelf) await requireProjectOwner(user, id);

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: id, userId: targetId } },
    select: { id: true, role: true },
  });
  if (!membership) throw new HttpError(404, "멤버를 찾을 수 없습니다");

  if (membership.role === ProjectRole.OWNER) {
    const otherOwners = await prisma.projectMember.count({
      where: { projectId: id, role: ProjectRole.OWNER, userId: { not: targetId } },
    });
    if (otherOwners === 0) {
      throw new HttpError(409, "마지막 소유자는 나갈 수 없습니다 - 먼저 다른 멤버를 소유자로 지정하세요");
    }
  }

  await prisma.projectMember.delete({ where: { id: membership.id } });
  return Response.json({ ok: true });
});
