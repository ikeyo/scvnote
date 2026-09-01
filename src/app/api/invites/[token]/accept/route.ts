import { prisma } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public: the one way to create an account after the first. New accounts are
 * never admins - only an admin promoting someone via the admin panel changes
 * that.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email?.includes("@")) throw new HttpError(400, "이메일 형식이 올바르지 않습니다");
  if (!password || password.length < 8) throw new HttpError(400, "비밀번호는 8자 이상이어야 합니다");

  const invite = await prisma.invite.findUnique({ where: { token }, select: { usedAt: true, expiresAt: true } });
  if (!invite) throw new HttpError(404, "존재하지 않는 초대 링크입니다");
  if (invite.usedAt) throw new HttpError(410, "이미 사용된 초대 링크입니다");
  if (invite.expiresAt < new Date()) throw new HttpError(410, "만료된 초대 링크입니다");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new HttpError(409, "이미 있는 이메일입니다");

  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({ data: { email, passwordHash, isAdmin: false } });

    // conditional update: only claims the invite if it's still unused at the
    // moment this transaction's write actually lands, so two people racing
    // on the same link can't both succeed
    const claimed = await tx.invite.updateMany({
      where: { token, usedAt: null },
      data: { usedAt: new Date(), usedById: created.id },
    });
    if (claimed.count === 0) throw new HttpError(410, "이미 사용된 초대 링크입니다");

    return created;
  });

  await createSession(user.id);
  return Response.json({ ok: true, email: user.email });
});
