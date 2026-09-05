import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { hasProjectVaultKey, requireProjectMember } from "@/lib/access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Hands the project's shared key to one member who doesn't have it yet -
 * typically someone added after sharing was already turned on. The caller
 * must already hold the key themselves (proof they can correctly wrap it for
 * someone else); the actual wrapping happens in their browser before this
 * call, using the target's public key from `GET .../members`.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await requireProjectMember(user.id, id);

  if (!(await hasProjectVaultKey(user.id, id))) {
    throw new HttpError(403, "본인이 먼저 이 프로젝트의 공유 키를 가지고 있어야 합니다");
  }

  const { userId: targetId, wrappedKey } = (await req.json()) as {
    userId?: string;
    wrappedKey?: string;
  };
  if (!targetId || !wrappedKey) throw new HttpError(400, "userId와 wrappedKey가 필요합니다");
  await requireProjectMember(targetId, id).catch(() => {
    throw new HttpError(400, "대상이 이 프로젝트의 멤버가 아닙니다");
  });

  await prisma.projectVaultKey.upsert({
    where: { projectId_userId: { projectId: id, userId: targetId } },
    create: { projectId: id, userId: targetId, wrappedKey },
    update: { wrappedKey },
  });

  return Response.json({ ok: true });
});
