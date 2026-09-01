import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  await requireUserId();
  const includeUnused = new URL(req.url).searchParams.get("unused") === "1";

  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { notes: true } } },
  });

  return Response.json({
    tags: includeUnused ? tags : tags.filter((t) => t._count.notes > 0),
    unusedCount: tags.filter((t) => t._count.notes === 0).length,
  });
});

/** Sweeps tags no note references any more. Deleting a note can strand them. */
export const DELETE = route(async () => {
  await requireUserId();
  const { count } = await prisma.tag.deleteMany({ where: { notes: { none: {} } } });
  return Response.json({ ok: true, deleted: count });
});
