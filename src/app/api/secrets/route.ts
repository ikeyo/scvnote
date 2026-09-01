import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { secretVisibilityWhere } from "@/lib/access";
import { projectFilter, resolveProjectId } from "@/lib/projects";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();

  const and: Prisma.SecretWhereInput[] = [secretVisibilityWhere(userId)];

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
    include: { project: { select: { id: true, name: true } } },
  });
  return Response.json({ secrets });
});

export const POST = route(async (req: Request) => {
  const userId = await requireUserId();
  const body = (await req.json()) as Record<string, string | undefined>;
  if (!body.title?.trim()) throw new HttpError(400, "제목이 필요합니다");
  if (!body.secretCipher || !body.secretIv) {
    throw new HttpError(400, "암호문이 필요합니다 - 비밀번호는 브라우저에서 암호화해야 합니다");
  }

  const secret = await prisma.secret.create({
    data: {
      title: body.title.trim(),
      username: body.username?.trim() || null,
      url: body.url?.trim() || null,
      memo: body.memo?.trim() || null,
      secretCipher: body.secretCipher,
      secretIv: body.secretIv,
      ownerId: userId,
      projectId: await resolveProjectId(userId, body.projectId),
    },
    include: { project: { select: { id: true, name: true } } },
  });
  return Response.json({ secret }, { status: 201 });
});
