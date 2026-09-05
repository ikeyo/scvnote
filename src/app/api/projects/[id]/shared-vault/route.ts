import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireProjectOwner } from "@/lib/access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Turns on password sharing for a project: stores this project's freshly
 * generated key, wrapped once per member who already has a public key on
 * file. The browser does all the crypto - this just persists the wrapped
 * bytes. Refuses if sharing is already on: there is one key per project for
 * its whole lifetime here, no re-keying support.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectOwner(user, id);

  const { wraps } = (await req.json()) as {
    wraps?: { userId?: string; wrappedKey?: string }[];
  };
  if (!Array.isArray(wraps) || wraps.length === 0) {
    throw new HttpError(400, "wraps 배열이 필요합니다");
  }
  if (!wraps.some((w) => w.userId === user.id)) {
    throw new HttpError(400, "본인 몫의 wrappedKey도 포함해야 합니다");
  }

  const existing = await prisma.projectVaultKey.count({ where: { projectId: id } });
  if (existing > 0) throw new HttpError(409, "이미 공유 비밀번호가 켜져 있습니다");

  const memberIds = new Set(
    (await prisma.projectMember.findMany({ where: { projectId: id }, select: { userId: true } })).map(
      (m) => m.userId,
    ),
  );
  for (const w of wraps) {
    if (!w.userId || !w.wrappedKey) throw new HttpError(400, "각 항목은 userId와 wrappedKey가 필요합니다");
    if (!memberIds.has(w.userId)) throw new HttpError(400, `프로젝트 멤버가 아닙니다: ${w.userId}`);
  }

  await prisma.$transaction(
    wraps.map((w) =>
      prisma.projectVaultKey.create({
        data: { projectId: id, userId: w.userId!, wrappedKey: w.wrappedKey! },
      }),
    ),
  );

  return Response.json({ ok: true, granted: wraps.length });
});
