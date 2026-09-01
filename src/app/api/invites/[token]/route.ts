import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Public: lets the accept page show "누가 초대했나" / expired-or-used state before submitting. */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    select: { expiresAt: true, usedAt: true, createdBy: { select: { email: true } } },
  });
  if (!invite) throw new HttpError(404, "존재하지 않는 초대 링크입니다");
  if (invite.usedAt) throw new HttpError(410, "이미 사용된 초대 링크입니다");
  if (invite.expiresAt < new Date()) throw new HttpError(410, "만료된 초대 링크입니다");

  return Response.json({ invitedBy: invite.createdBy.email, expiresAt: invite.expiresAt });
});
