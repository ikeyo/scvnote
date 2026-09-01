import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { route } from "@/lib/api";
import { requireNoteAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Turns on a public, no-login read-only link. Anyone can view it who has the URL. */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireNoteAccess(userId, id);

  const shareToken = randomBytes(16).toString("hex");
  const note = await prisma.note.update({
    where: { id },
    data: { shareToken, sharedAt: new Date() },
    select: { shareToken: true, sharedAt: true },
  });

  return Response.json(note);
});

/** Revokes the link. A new one gets a fresh token if re-enabled - the old URL stops working. */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { id } = await ctx.params;
  await requireNoteAccess(userId, id);

  await prisma.note.update({ where: { id }, data: { shareToken: null, sharedAt: null } });
  return Response.json({ ok: true });
});
