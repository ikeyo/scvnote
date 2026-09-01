import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { resolveProjectId } from "@/lib/projects";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;
  const body = (await req.json()) as Record<string, string | undefined>;

  const data: Prisma.SecretUpdateInput = {};
  if (body.title !== undefined) {
    if (!body.title.trim()) throw new HttpError(400, "제목이 필요합니다");
    data.title = body.title.trim();
  }
  if (body.username !== undefined) data.username = body.username.trim() || null;
  if (body.url !== undefined) data.url = body.url.trim() || null;
  if (body.memo !== undefined) data.memo = body.memo.trim() || null;
  if (body.projectId !== undefined) {
    const pid = await resolveProjectId(body.projectId);
    data.project = pid ? { connect: { id: pid } } : { disconnect: true };
  }

  // cipher and IV must move together or the entry becomes undecryptable
  if (body.secretCipher !== undefined || body.secretIv !== undefined) {
    if (!body.secretCipher || !body.secretIv) {
      throw new HttpError(400, "secretCipher와 secretIv는 함께 보내야 합니다");
    }
    data.secretCipher = body.secretCipher;
    data.secretIv = body.secretIv;
  }

  const secret = await prisma.secret.update({ where: { id }, data }).catch(() => {
    throw new HttpError(404, "항목을 찾을 수 없습니다");
  });
  return Response.json({ secret });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;
  await prisma.secret.delete({ where: { id } }).catch(() => {
    throw new HttpError(404, "항목을 찾을 수 없습니다");
  });
  return Response.json({ ok: true });
});
