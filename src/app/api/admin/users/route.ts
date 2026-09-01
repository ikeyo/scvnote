import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, isAdmin: true, disabledAt: true, createdAt: true },
  });
  return Response.json({ users });
});
