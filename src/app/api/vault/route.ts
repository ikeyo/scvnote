import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Vault crypto material. The salt and the probe ciphertext are public - they are
 * useless without the master password, which never reaches the server.
 */
export const GET = route(async () => {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vaultSalt: true, vaultCheckCipher: true, vaultCheckIv: true },
  });
  if (!user) throw new HttpError(404, "사용자를 찾을 수 없습니다");

  return Response.json({
    initialized: Boolean(user.vaultSalt && user.vaultCheckCipher && user.vaultCheckIv),
    salt: user.vaultSalt,
    checkCipher: user.vaultCheckCipher,
    checkIv: user.vaultCheckIv,
  });
});

/** Sets the master password material. Refuses to overwrite an initialized vault. */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const { salt, checkCipher, checkIv } = (await req.json()) as Record<string, string | undefined>;
  if (!salt || !checkCipher || !checkIv) throw new HttpError(400, "salt/checkCipher/checkIv 필요");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vaultSalt: true },
  });
  if (user?.vaultSalt) {
    // overwriting the salt would make every existing secret permanently unreadable
    throw new HttpError(409, "마스터 패스워드가 이미 설정되어 있습니다");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { vaultSalt: salt, vaultCheckCipher: checkCipher, vaultCheckIv: checkIv },
  });
  return Response.json({ ok: true });
});
