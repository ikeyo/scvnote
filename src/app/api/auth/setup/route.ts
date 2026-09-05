import { prisma } from "@/lib/db";
import { createSession, hashPassword, needsSetup } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Creates the very first account. Refuses once any account exists - after
 * that, new accounts only come from an admin-issued invite link
 * (`/api/invites/[token]/accept`). The first account is automatically the
 * site admin, since there's no one else yet to grant that role.
 */
export const POST = route(async (req: Request) => {
  if (!(await needsSetup())) throw new HttpError(409, "계정이 이미 존재합니다");

  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email?.includes("@")) throw new HttpError(400, "이메일 형식이 올바르지 않습니다");
  if (!password) throw new HttpError(400, "비밀번호를 입력하세요");

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), isAdmin: true },
  });
  await createSession(user.id);
  return Response.json({ ok: true, email: user.email });
});
