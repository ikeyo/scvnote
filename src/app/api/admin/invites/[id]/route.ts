import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Revokes an unused invite. A used one is history, not a live risk - it can't be revoked. */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;

  const invite = await prisma.invite.findUnique({ where: { id }, select: { usedAt: true } });
  if (!invite) throw new HttpError(404, "초대를 찾을 수 없습니다");
  if (invite.usedAt) throw new HttpError(409, "이미 사용된 초대는 취소할 수 없습니다");

  await prisma.invite.delete({ where: { id } });
  return Response.json({ ok: true });
});
