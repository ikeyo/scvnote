import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Backfills the RSA keypair for a vault that was set up before project
 * sharing existed. The frontend calls this transparently, right after a
 * successful unlock, whenever `vaultPublicKey` comes back empty from
 * `GET /api/vault` - the user never sees a separate step for it.
 */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const { publicKey, privateKeyCipher, privateKeyIv } = (await req.json()) as Record<
    string,
    string | undefined
  >;
  if (!publicKey || !privateKeyCipher || !privateKeyIv) {
    throw new HttpError(400, "publicKey/privateKeyCipher/privateKeyIv 필요");
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { vaultPublicKey: true } });
  if (user?.vaultPublicKey) throw new HttpError(409, "키 쌍이 이미 있습니다");

  await prisma.user.update({
    where: { id: userId },
    data: { vaultPublicKey: publicKey, vaultPrivateKeyCipher: privateKeyCipher, vaultPrivateKeyIv: privateKeyIv },
  });
  return Response.json({ ok: true });
});
