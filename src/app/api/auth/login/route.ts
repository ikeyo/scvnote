import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email || !password) throw new HttpError(400, "이메일과 비밀번호를 입력하세요");

  const user = await prisma.user.findUnique({ where: { email } });
  // Hash-compare even when the user is missing so a wrong email and a wrong
  // password take the same amount of time.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");

  if (!user || !ok) throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다");

  await createSession(user.id);
  return Response.json({ ok: true });
});
