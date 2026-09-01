import { prisma } from "@/lib/db";
import { generateInviteToken, inviteExpiry, requireAdmin } from "@/lib/auth";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

const INVITE_SELECT = {
  id: true,
  token: true,
  createdAt: true,
  expiresAt: true,
  usedAt: true,
  usedBy: { select: { email: true } },
} as const;

export const GET = route(async () => {
  await requireAdmin();
  const invites = await prisma.invite.findMany({
    orderBy: { createdAt: "desc" },
    select: INVITE_SELECT,
  });
  return Response.json({ invites });
});

/** Anyone with the returned URL can create an account - share it carefully. */
export const POST = route(async () => {
  const admin = await requireAdmin();

  const invite = await prisma.invite.create({
    data: { token: generateInviteToken(), expiresAt: inviteExpiry(), createdById: admin.id },
    select: INVITE_SELECT,
  });
  return Response.json({ invite }, { status: 201 });
});
