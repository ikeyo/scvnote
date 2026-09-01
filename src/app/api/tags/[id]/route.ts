import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { ownedOrMemberWhere, tagOnlyTouchesVisibleNotes } from "@/lib/access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Renames a tag. If the new name already exists this is a merge, which is
 * destructive to the source tag - so it only happens when the caller asks for
 * it explicitly with `merge: true`, otherwise it is a 409.
 *
 * Refuses if the tag is also used on a note the caller can't see - tags are
 * a shared namespace, but renaming one shouldn't silently edit someone else's
 * private notes.
 */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  const { name, merge } = (await req.json()) as { name?: string; merge?: boolean };

  const newName = name?.trim();
  if (!newName) throw new HttpError(400, "태그 이름이 필요합니다");

  const visibility = await ownedOrMemberWhere(userId);
  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { id: true, name: true, notes: { where: visibility, select: { id: true } } },
  });
  if (!tag) throw new HttpError(404, "태그를 찾을 수 없습니다");
  if (!(await tagOnlyTouchesVisibleNotes(userId, id))) {
    throw new HttpError(409, "다른 사용자의 노트에서도 쓰이고 있어 바꿀 수 없습니다");
  }
  if (tag.name === newName) return Response.json({ tag: { id, name: newName }, merged: 0 });

  const target = await prisma.tag.findUnique({ where: { name: newName }, select: { id: true } });

  if (!target) {
    const renamed = await prisma.tag.update({
      where: { id },
      data: { name: newName },
      select: { id: true, name: true, _count: { select: { notes: { where: visibility } } } },
    });
    return Response.json({ tag: renamed, merged: 0 });
  }

  if (!merge) {
    throw new HttpError(409, `"${newName}" 태그가 이미 있습니다. 합치려면 merge를 지정하세요`);
  }
  if (!(await tagOnlyTouchesVisibleNotes(userId, target.id))) {
    throw new HttpError(409, "합칠 대상 태그가 다른 사용자의 노트에서도 쓰이고 있어 합칠 수 없습니다");
  }

  // move every (visible) note onto the target tag, then drop the now-empty source
  const [, merged] = await prisma.$transaction([
    prisma.tag.update({
      where: { id: target.id },
      data: { notes: { connect: tag.notes.map((n) => ({ id: n.id })) } },
    }),
    prisma.tag.delete({ where: { id } }),
  ]);

  const result = await prisma.tag.findUnique({
    where: { id: target.id },
    select: { id: true, name: true, _count: { select: { notes: { where: visibility } } } },
  });
  return Response.json({ tag: result, merged: tag.notes.length, deletedId: merged.id });
});

/**
 * Removes the tag from every note. The notes themselves are untouched.
 * Refuses if the tag is also used on a note the caller can't see.
 */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;

  const visibility = await ownedOrMemberWhere(userId);
  const tag = await prisma.tag.findUnique({
    where: { id },
    select: { _count: { select: { notes: { where: visibility } } } },
  });
  if (!tag) throw new HttpError(404, "태그를 찾을 수 없습니다");
  if (!(await tagOnlyTouchesVisibleNotes(userId, id))) {
    throw new HttpError(409, "다른 사용자의 노트에서도 쓰이고 있어 지울 수 없습니다");
  }

  await prisma.tag.delete({ where: { id } });
  return Response.json({ ok: true, detachedFrom: tag._count.notes });
});
