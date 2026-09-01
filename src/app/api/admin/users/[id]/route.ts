import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Toggles admin/disabled on another account. Never your own - that would let
 * an admin lock themselves out (disable) or silently self-demote with no one
 * left to undo it. Use a second admin account for that.
 */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  if (id === admin.id) throw new HttpError(400, "본인 계정은 여기서 바꿀 수 없습니다");

  const { isAdmin, disabled } = (await req.json()) as { isAdmin?: boolean; disabled?: boolean };
  const data: Prisma.UserUpdateInput = {};
  if (typeof isAdmin === "boolean") data.isAdmin = isAdmin;
  if (typeof disabled === "boolean") data.disabledAt = disabled ? new Date() : null;
  if (Object.keys(data).length === 0) throw new HttpError(400, "바꿀 항목이 없습니다");

  const user = await prisma.user
    .update({
      where: { id },
      data,
      select: { id: true, email: true, isAdmin: true, disabledAt: true },
    })
    .catch(() => {
      throw new HttpError(404, "사용자를 찾을 수 없습니다");
    });
  return Response.json({ user });
});
