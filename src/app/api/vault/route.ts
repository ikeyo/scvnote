import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Vault crypto material. The salt, probe ciphertext, and public key are all
 * safe to return as-is - none of them are useful without the master
 * password, which never reaches the server.
 */
export const GET = route(async () => {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      vaultSalt: true,
      vaultCheckCipher: true,
      vaultCheckIv: true,
      vaultPublicKey: true,
      vaultPrivateKeyCipher: true,
      vaultPrivateKeyIv: true,
    },
  });
  if (!user) throw new HttpError(404, "사용자를 찾을 수 없습니다");

  return Response.json({
    initialized: Boolean(user.vaultSalt && user.vaultCheckCipher && user.vaultCheckIv),
    salt: user.vaultSalt,
    checkCipher: user.vaultCheckCipher,
    checkIv: user.vaultCheckIv,
    publicKey: user.vaultPublicKey,
    privateKeyCipher: user.vaultPrivateKeyCipher,
    privateKeyIv: user.vaultPrivateKeyIv,
  });
});

/**
 * Sets the master password material. Refuses to overwrite an initialized
 * vault - overwriting the salt would make every existing secret permanently
 * unreadable.
 *
 * The RSA keypair (publicKey/privateKeyCipher/privateKeyIv) can be supplied
 * in this same call for a brand-new vault, or added later via
 * `/api/vault/keypair` for a vault that predates project sharing.
 */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const body = (await req.json()) as Record<string, string | undefined>;
  const { salt, checkCipher, checkIv, publicKey, privateKeyCipher, privateKeyIv } = body;
  if (!salt || !checkCipher || !checkIv) throw new HttpError(400, "salt/checkCipher/checkIv 필요");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { vaultSalt: true },
  });
  if (user?.vaultSalt) {
    throw new HttpError(409, "마스터 패스워드가 이미 설정되어 있습니다");
  }

  const hasKeyPair = Boolean(publicKey && privateKeyCipher && privateKeyIv);
  if ((publicKey || privateKeyCipher || privateKeyIv) && !hasKeyPair) {
    throw new HttpError(400, "publicKey/privateKeyCipher/privateKeyIv는 함께 보내야 합니다");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      vaultSalt: salt,
      vaultCheckCipher: checkCipher,
      vaultCheckIv: checkIv,
      ...(hasKeyPair
        ? { vaultPublicKey: publicKey, vaultPrivateKeyCipher: privateKeyCipher, vaultPrivateKeyIv: privateKeyIv }
        : {}),
    },
  });
  return Response.json({ ok: true });
});
