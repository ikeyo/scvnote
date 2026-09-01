import { prisma } from "@/lib/db";
import { generateMcpToken, hashMcpToken, requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Only tells the caller whether a token exists - never the value itself. */
export const GET = route(async () => {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mcpTokenHash: true } });
  return Response.json({ issued: Boolean(user?.mcpTokenHash) });
});

/**
 * Issues a fresh token, replacing any previous one - the old value stops
 * working immediately. Returned in plaintext exactly once; only its hash is
 * kept, so there's no way to recover it later, only reissue.
 */
export const POST = route(async () => {
  const userId = await requireUserId();
  const token = generateMcpToken();
  await prisma.user.update({ where: { id: userId }, data: { mcpTokenHash: hashMcpToken(token) } });
  return Response.json({ token });
});
