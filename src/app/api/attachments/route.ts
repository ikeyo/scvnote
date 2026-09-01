import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { HttpError, route } from "@/lib/api";
import { requireNoteAccess } from "@/lib/access";
import { removeStored, saveUpload } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** multipart/form-data: `file` (required), `noteId` (required). */
export const POST = route(async (req: Request) => {
  const userId = await requireUserId();

  const form = await req.formData();
  const file = form.get("file");
  const noteId = form.get("noteId");

  if (!(file instanceof File)) throw new HttpError(400, "file 필드가 필요합니다");
  if (typeof noteId !== "string" || !noteId) throw new HttpError(400, "noteId 필드가 필요합니다");

  await requireNoteAccess(userId, noteId); // 404s if missing or not visible to this user

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
