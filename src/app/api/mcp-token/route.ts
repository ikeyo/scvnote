import { prisma } from "@/lib/db";
import { generateMcpToken, hashMcpToken, requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

const TOKEN_SELECT = {
  id: true,
  label: true,
  createdAt: true,
  lastUsedAt: true,
} as const;

/** The tokens themselves are never returned - only what they're called and when they ran. */
export const GET = route(async () => {
  const userId = await requireUserId();
  const tokens = await prisma.mcpToken.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: TOKEN_SELECT,
  });
  return Response.json({ tokens });
});

/**
 * Issues one more token, leaving the others alone - a new machine gets its own
 * instead of displacing the one already registered somewhere else. Returned in
 * plaintext exactly once; only its hash is kept, so it can't be recovered
 * later, only replaced.
 */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const { label } = (await req.json().catch(() => ({}))) as { label?: string };

  const token = generateMcpToken();
  const created = await prisma.mcpToken.create({
    data: {
      label: label?.trim() || "이름 없는 기기",
      tokenHash: hashMcpToken(token),
      userId,
    },
    select: TOKEN_SELECT,
  });
  return Response.json({ token, created }, { status: 201 });
});

/** Revokes one token. The client using it stops working immediately. */
export const DELETE = route(async (req: Request) => {
  const userId = await requireUserId();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "지울 토큰 id가 필요합니다");

  // scoped to the caller, so an id belonging to someone else just 404s
  const { count } = await prisma.mcpToken.deleteMany({ where: { id, userId } });
  if (count === 0) throw new HttpError(404, "토큰을 찾을 수 없습니다");
  return Response.json({ ok: true });
});
