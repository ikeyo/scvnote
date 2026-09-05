import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Every project key this account has been handed, still wrapped with this
 * account's own public key - only this account's private key can open them.
 * Fetched once per unlock so the browser can decrypt shared secrets without
 * a round trip per project.
 */
export const GET = route(async () => {
  const userId = await requireUserId();
  const keys = await prisma.projectVaultKey.findMany({
    where: { userId },
    select: { projectId: true, wrappedKey: true },
  });
  return Response.json({ keys });
});
