import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireSecretAccess } from "@/lib/access";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireSecretAccess(userId, id);

  const body = (await req.json()) as Record<string, string | boolean | undefined>;

  // 프로젝트 소속(=공유 여부)은 만들 때 정해지며 바꿀 수 없다 - 옮기려면 다른 키로
  // 다시 암호화해야 하므로 메타데이터 수정이 아니다. 새로 만들어 옮기는 쪽을 안내한다.
  if (body.projectId !== undefined) {
    throw new HttpError(400, "프로젝트 소속은 바꿀 수 없습니다 - 새로 만들어 옮기세요");
  }

  const data: Prisma.SecretUpdateInput = {};
  if (typeof body.title === "string") {
    if (!body.title.trim()) throw new HttpError(400, "제목이 필요합니다");
    data.title = body.title.trim();
  }
  if (typeof body.username === "string") data.username = body.username.trim() || null;
  if (typeof body.url === "string") data.url = body.url.trim() || null;
  if (typeof body.memo === "string") data.memo = body.memo.trim() || null;

  // cipher and IV must move together or the entry becomes undecryptable
  if (body.secretCipher !== undefined || body.secretIv !== undefined) {
    if (!body.secretCipher || !body.secretIv) {
      throw new HttpError(400, "secretCipher와 secretIv는 함께 보내야 합니다");
    }
    data.secretCipher = body.secretCipher as string;
    data.secretIv = body.secretIv as string;
  }

  const updated = await prisma.secret.update({ where: { id }, data });
  return Response.json({ secret: updated });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireSecretAccess(userId, id);

  await prisma.secret.delete({ where: { id } });
  return Response.json({ ok: true });
});
