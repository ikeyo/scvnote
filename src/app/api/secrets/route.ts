import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { hasProjectVaultKey, secretVisibilityWhere } from "@/lib/access";
import { projectFilter, resolveProjectId } from "@/lib/projects";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();

  const and: Prisma.SecretWhereInput[] = [await secretVisibilityWhere(userId)];

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
  const body = (await req.json()) as Record<string, string | boolean | undefined>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HttpError(400, "제목이 필요합니다");
  if (!body.secretCipher || !body.secretIv) {
    throw new HttpError(400, "암호문이 필요합니다 - 비밀번호는 브라우저에서 암호화해야 합니다");
  }

  const projectId = await resolveProjectId(userId, body.projectId as string | undefined);
  // 프로젝트 소속 여부가 곧 공유 여부다 - 개별 항목은 항상 개인용, 프로젝트 항목은 항상 공유.
  // 사용자가 따로 고를 수 있는 값이 아니다.
  const shared = projectId !== null;

  if (shared && !(await hasProjectVaultKey(userId, projectId))) {
    // the browser encrypts with the project key, which it can only have if
    // sharing was actually turned on and granted to this user - if not,
    // this ciphertext would be unreadable to anyone, including its creator
    throw new HttpError(409, "이 프로젝트의 공유 비밀번호 키가 없습니다 - 먼저 공유를 켜세요");
  }

  const secret = await prisma.secret.create({
    data: {
      title,
      username: typeof body.username === "string" ? body.username.trim() || null : null,
      url: typeof body.url === "string" ? body.url.trim() || null : null,
      memo: typeof body.memo === "string" ? body.memo.trim() || null : null,
      secretCipher: body.secretCipher as string,
      secretIv: body.secretIv as string,
      shared,
      ownerId: userId,
      projectId,
    },
    include: { project: { select: { id: true, name: true } } },
  });
  return Response.json({ secret }, { status: 201 });
});
