import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { isInline, removeStored, resolveStored } from "@/lib/attachments";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ storedName: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireUserId();
  const { storedName } = await ctx.params;

  const attachment = await prisma.attachment.findUnique({ where: { storedName } });
  if (!attachment) throw new HttpError(404, "첨부파일을 찾을 수 없습니다");

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
  await requireUserId();
  const { storedName } = await ctx.params;

  const attachment = await prisma.attachment.findUnique({ where: { storedName } });
  if (!attachment) throw new HttpError(404, "첨부파일을 찾을 수 없습니다");

  await prisma.attachment.delete({ where: { id: attachment.id } });
  await removeStored(storedName);
  return Response.json({ ok: true });
});
