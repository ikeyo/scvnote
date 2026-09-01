import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";
import { ownedOrMemberWhere } from "@/lib/access";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const userId = await requireUserId();
  const includeUnused = new URL(req.url).searchParams.get("unused") === "1";
  const visibility = await ownedOrMemberWhere(userId);

  // counts only the notes this caller can actually see - a tag used solely on
  // someone else's private notes should not show a nonzero count here
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { notes: { where: visibility } } } },
  });

  return Response.json({
    tags: includeUnused ? tags : tags.filter((t) => t._count.notes > 0),
    unusedCount: tags.filter((t) => t._count.notes === 0).length,
  });
});

/** Sweeps tags no note references any more (globally). Deleting a note can strand them. */
export const DELETE = route(async () => {
  await requireUserId();
  const { count } = await prisma.tag.deleteMany({ where: { notes: { none: {} } } });
  return Response.json({ ok: true, deleted: count });
});
