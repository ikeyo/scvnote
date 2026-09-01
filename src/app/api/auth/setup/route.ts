import { prisma } from "@/lib/db";
import { createSession, hashPassword, needsSetup } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Creates the one and only account. Refuses once an account exists. */
export const POST = route(async (req: Request) => {
  if (!(await needsSetup())) throw new HttpError(409, "계정이 이미 존재합니다");

  const { email, password } = (await req.json()) as { email?: string; password?: string };
  if (!email?.includes("@")) throw new HttpError(400, "이메일 형식이 올바르지 않습니다");
  if (!password || password.length < 8) throw new HttpError(400, "비밀번호는 8자 이상이어야 합니다");

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password) },
  });
  await createSession(user.id);
  return Response.json({ ok: true, email: user.email });
});
