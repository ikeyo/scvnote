import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { ownedOrMemberWhere } from "@/lib/access";
import { encryptSecret } from "@/lib/secret-crypto";
import { projectFilter, resolveProjectId } from "@/lib/projects";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

/** Metadata only - values are fetched one at a time from `/api/secrets/[id]/value`. */
const LIST_SELECT = {
  id: true,
  title: true,
  username: true,
  url: true,
  memo: true,
  project: { select: { id: true, name: true, color: true } },
} as const;

export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();

  const and: Prisma.SecretWhereInput[] = [await ownedOrMemberWhere(userId)];

  const pf = await projectFilter(userId, params.get("project"));
  if ("projectId" in pf) and.push({ projectId: pf.projectId });

  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
        { url: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const secrets = await prisma.secret.findMany({
    where: { AND: and },
    orderBy: { title: "asc" },
    select: LIST_SELECT,
  });
  return Response.json({ secrets });
});

export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const body = (await req.json()) as Record<string, string | undefined>;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HttpError(400, "제목이 필요합니다");
  if (!body.value) throw new HttpError(400, "비밀번호가 필요합니다");

  const secret = await prisma.secret.create({
    data: {
      title,
      username: typeof body.username === "string" ? body.username.trim() || null : null,
      url: typeof body.url === "string" ? body.url.trim() || null : null,
      memo: typeof body.memo === "string" ? body.memo.trim() || null : null,
      valueCipher: encryptSecret(body.value),
      ownerId: userId,
      projectId: await resolveProjectId(userId, body.projectId),
    },
    select: LIST_SELECT,
  });
  return Response.json({ secret }, { status: 201 });
});
