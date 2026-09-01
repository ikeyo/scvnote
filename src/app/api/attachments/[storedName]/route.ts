import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { getSessionUserId, requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireNoteAccess } from "@/lib/access";
import { isInline, removeStored, resolveStored } from "@/lib/attachments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ storedName: string }> };

/**
 * Two ways in: a logged-in user with access to the parent note, or nobody at
 * all if that note has an active public share link (so images embedded in a
 * shared note still render for anonymous visitors).
 */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { storedName } = await ctx.params;

  const attachment = await prisma.attachment.findUnique({
    where: { storedName },
    include: { note: { select: { shareToken: true } } },
  });
  if (!attachment) throw new HttpError(404, "첨부파일을 찾을 수 없습니다");

  const userId = await getSessionUserId();
  if (userId) {
    await requireNoteAccess(userId, attachment.noteId);
  } else if (!attachment.note.shareToken) {
    throw new HttpError(401, "Unauthorized");
  }

  const full = resolveStored(storedName);
  const info = await stat(full).catch(() => null);
  if (!info) throw new HttpError(404, "파일이 디스크에 없습니다");

  const disposition = isInline(attachment.mimeType) ? "inline" : "attachment";
  const filename = encodeURIComponent(attachment.originalName);

  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(info.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
      // uploads are immutable - the stored name is a fresh uuid every time
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  const userId = await requireUserId();
  const { storedName } = await ctx.params;

  const attachment = await prisma.attachment.findUnique({ where: { storedName } });
  if (!attachment) throw new HttpError(404, "첨부파일을 찾을 수 없습니다");
  await requireNoteAccess(userId, attachment.noteId);

  await prisma.attachment.delete({ where: { id: attachment.id } });
  await removeStored(storedName);
  return Response.json({ ok: true });
});
