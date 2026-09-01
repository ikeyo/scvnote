import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "@/lib/api";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Rendered inline; everything else is served as a download. */
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "application/zip": ".zip",
};

export function attachmentsDir(): string {
  // resolved at runtime from env; the bundler cannot and need not trace it
  return path.resolve(/*turbopackIgnore: true*/ process.env.ATTACHMENTS_DIR ?? "./data/attachments");
}

export function isInline(mimeType: string): boolean {
  return INLINE_TYPES.has(mimeType);
}

/**
 * Resolves a stored name to an absolute path, rejecting anything that would
 * escape the attachments directory.
 */
export function resolveStored(storedName: string): string {
  const dir = attachmentsDir();
  const full = path.resolve(/*turbopackIgnore: true*/ dir, storedName);
  if (path.dirname(full) !== dir) throw new HttpError(400, "잘못된 파일 경로입니다");
  return full;
}

export async function saveUpload(file: File): Promise<{
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}> {
  if (file.size === 0) throw new HttpError(400, "빈 파일입니다");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, `파일이 너무 큽니다 (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);
  }

  const mimeType = file.type || "application/octet-stream";
  const originalName = file.name || "clipboard";
  const ext = EXTENSIONS[mimeType] ?? path.extname(originalName).slice(0, 12) ?? "";
  const storedName = `${randomUUID()}${ext}`;

  const dir = attachmentsDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ dir, storedName), Buffer.from(await file.arrayBuffer()));

  return { storedName, originalName, mimeType, size: file.size };
}

/** Best-effort: a missing file must not fail the surrounding delete. */
export async function removeStored(storedName: string): Promise<void> {
  try {
    await unlink(resolveStored(storedName));
  } catch {
    /* already gone */
  }
}
