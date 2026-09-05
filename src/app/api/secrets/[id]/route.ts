import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireSecretAccess } from "@/lib/access";
import { encryptSecret } from "@/lib/secret-crypto";
import { resolveProjectId } from "@/lib/projects";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireSecretAccess(userId, id);

  const body = (await req.json()) as Record<string, string | null | undefined>;

  const data: Prisma.SecretUpdateInput = {};
  if (typeof body.title === "string") {
    if (!body.title.trim()) throw new HttpError(400, "제목이 필요합니다");
    data.title = body.title.trim();
  }
  if (typeof body.username === "string") data.username = body.username.trim() || null;
  if (typeof body.url === "string") data.url = body.url.trim() || null;
  if (typeof body.memo === "string") data.memo = body.memo.trim() || null;

  // an absent/blank value means "keep the stored one" - the edit form leaves
  // the password field empty unless it's being changed
  if (body.value) data.valueCipher = encryptSecret(body.value);

  if (body.projectId !== undefined) {
    const projectId = await resolveProjectId(userId, body.projectId);
    data.project = projectId ? { connect: { id: projectId } } : { disconnect: true };
  }

  const secret = await prisma.secret.update({
    where: { id },
    data,
    select: {
      id: true,
      title: true,
      username: true,
      url: true,
      memo: true,
      project: { select: { id: true, name: true, color: true } },
    },
  });
  return Response.json({ secret });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireSecretAccess(userId, id);

  await prisma.secret.delete({ where: { id } });
  return Response.json({ ok: true });
});
