import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";
import { requireSecretAccess } from "@/lib/access";
import { decryptSecret } from "@/lib/secret-crypto";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The decrypted value of one entry. Kept off the list endpoint on purpose:
 * "보기"/"복사" asks for exactly the one it needs, so browsing the vault
 * doesn't ship every password to the browser (or through any proxy log
 * along the way).
 */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireSecretAccess(userId, id);

  const secret = await prisma.secret.findUniqueOrThrow({
    where: { id },
    select: { valueCipher: true },
  });
  return Response.json({ value: decryptSecret(secret.valueCipher) });
});
