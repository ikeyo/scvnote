import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Renames a tag. If the new name already exists this is a merge, which is
 * destructive to the source tag - so it only happens when the caller asks for
 * it explicitly with `merge: true`, otherwise it is a 409.
 */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;
  const { name, merge } = (await req.json()) as { name?: string; merge?: boolean };

  const newName = name?.trim();
  if (!newName) throw new HttpError(400, "태그 이름이 필요합니다");

  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { id: true, name: true, notes: { select: { id: true } } },
  });
  if (!tag) throw new HttpError(404, "태그를 찾을 수 없습니다");
  if (tag.name === newName) return Response.json({ tag: { id, name: newName }, merged: 0 });

  const target = await prisma.tag.findUnique({ where: { name: newName }, select: { id: true } });

  if (!target) {
    const renamed = await prisma.tag.update({
      where: { id },
      data: { name: newName },
      select: { id: true, name: true, _count: { select: { notes: true } } },
    });
    return Response.json({ tag: renamed, merged: 0 });
  }

  if (!merge) {
    throw new HttpError(409, `"${newName}" 태그가 이미 있습니다. 합치려면 merge를 지정하세요`);
  }

  // move every note onto the target tag, then drop the now-empty source
  const [, merged] = await prisma.$transaction([
    prisma.tag.update({
      where: { id: target.id },
      data: { notes: { connect: tag.notes.map((n) => ({ id: n.id })) } },
    }),
    prisma.tag.delete({ where: { id } }),
  ]);

  const result = await prisma.tag.findUnique({
    where: { id: target.id },
    select: { id: true, name: true, _count: { select: { notes: true } } },
  });
  return Response.json({ tag: result, merged: tag.notes.length, deletedId: merged.id });
});

/** Removes the tag from every note. The notes themselves are untouched. */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await requireUserId();
  const { id } = await ctx.params;

  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { _count: { select: { notes: true } } },
  });
  if (!tag) throw new HttpError(404, "태그를 찾을 수 없습니다");

  await prisma.tag.delete({ where: { id } });
  return Response.json({ ok: true, detachedFrom: tag._count.notes });
});
