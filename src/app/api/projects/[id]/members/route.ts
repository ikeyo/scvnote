import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireProjectMember, requireProjectOwner } from "@/lib/access";
import { ProjectRole } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, email: true, isAdmin: true, vaultPublicKey: true } },
} as const;

/**
 * Any current member can see the roster. Each entry also carries the
 * member's public key (needed to hand them the project's shared vault key)
 * and whether they already hold it - both are what the "공유 비밀번호" panel
 * on /secrets needs to know who still needs a key.
 */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectMember(user.id, id);

  const [members, vaultKeys] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: MEMBER_SELECT,
    }),
    prisma.projectVaultKey.findMany({ where: { projectId: id }, select: { userId: true } }),
  ]);
  const hasKey = new Set(vaultKeys.map((k) => k.userId));

  return Response.json({
    members: members.map((m) => ({ ...m, hasSharedVaultAccess: hasKey.has(m.user.id) })),
    sharedVaultEnabled: vaultKeys.length > 0,
  });
});

/** Adds an existing user by email. OWNER or a site admin only. */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectOwner(user, id);

  const { email, role } = (await req.json()) as { email?: string; role?: string };
  const target = email?.trim().toLowerCase();
  if (!target) throw new HttpError(400, "이메일이 필요합니다");

  const targetUser = await prisma.user.findUnique({ where: { email: target }, select: { id: true } });
  if (!targetUser) throw new HttpError(404, `그런 계정이 없습니다: ${target}`);

  const memberRole = role === "OWNER" ? ProjectRole.OWNER : ProjectRole.MEMBER;

  const member = await prisma.projectMember
    .create({ data: { projectId: id, userId: targetUser.id, role: memberRole }, select: MEMBER_SELECT })
    .catch((err: unknown) => {
      if ((err as { code?: string }).code === "P2002") {
        throw new HttpError(409, "이미 이 프로젝트의 멤버입니다");
      }
      throw err;
    });

  return Response.json({ member: { ...member, hasSharedVaultAccess: false } }, { status: 201 });
});
