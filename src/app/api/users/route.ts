import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Minimal directory of existing accounts, for the "add member" picker on a
 * project. Any signed-in user can call this - knowing which emails exist on
 * this instance isn't sensitive for a small trusted-group deployment, and
 * the picker is unusable without it.
 */
export const GET = route(async () => {
  await requireUserId();
  const users = await prisma.user.findMany({
    where: { disabledAt: null },
    orderBy: { email: "asc" },
    select: { id: true, email: true },
  });
  return Response.json({ users });
});
