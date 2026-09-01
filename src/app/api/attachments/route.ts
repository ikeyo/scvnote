import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { removeStored, saveUpload } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** multipart/form-data: `file` (required), `noteId` (required). */
export const POST = route(async (req: Request) => {
  await requireUserId();

  const form = await req.formData();
  const file = form.get("file");
  const noteId = form.get("noteId");

  if (!(file instanceof File)) throw new HttpError(400, "file 필드가 필요합니다");
  if (typeof noteId !== "string" || !noteId) throw new HttpError(400, "noteId 필드가 필요합니다");

  const note = await prisma.note.findUnique({ where: { id: noteId }, select: { id: true } });
  if (!note) throw new HttpError(404, "노트를 찾을 수 없습니다");

  const saved = await saveUpload(file);
  try {
    const attachment = await prisma.attachment.create({
      data: { noteId, ...saved },
      select: { id: true, originalName: true, storedName: true, mimeType: true, size: true },
    });
    return Response.json(
      { attachment, url: `/api/attachments/${attachment.storedName}` },
      { status: 201 },
    );
  } catch (err) {
    // don't leave an orphan file behind if the row fails to insert
    await removeStored(saved.storedName);
    throw err;
  }
});
