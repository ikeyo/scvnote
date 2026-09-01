import { HttpError } from "@/lib/api";
import { projectFilter } from "@/lib/projects";
import { NoteKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const NOTE_KINDS = Object.values(NoteKind) as string[];

export function parseKind(value: string | null | undefined): NoteKind | undefined {
  return value && NOTE_KINDS.includes(value) ? (value as NoteKind) : undefined;
}

export async function buildNoteWhere(params: {
  q?: string | null;
  kind?: string | null;
  tag?: string | null;
  project?: string | null;
  archived?: boolean;
}): Promise<Prisma.NoteWhereInput> {
  const where: Prisma.NoteWhereInput = {
    archived: params.archived ?? false,
    ...(await projectFilter(params.project)),
  };

  const kind = parseKind(params.kind);
  if (kind) where.kind = kind;
  if (params.tag) where.tags = { some: { name: params.tag } };

  if (params.q?.trim()) {
    const q = params.q.trim();
    // `contains` + insensitive compiles to ILIKE '%q%', which the pg_trgm GIN
    // indexes on title/contentText can serve.
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { contentText: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

/** Turns a list of tag names into a connectOrCreate payload. */
export function connectTags(names?: string[]) {
  const clean = [...new Set((names ?? []).map((t) => t.trim()).filter(Boolean))];
  if (clean.length > 30) throw new HttpError(400, "태그는 30개까지만 붙일 수 있습니다");
  if (clean.length === 0) return undefined;
  return { connectOrCreate: clean.map((name) => ({ where: { name }, create: { name } })) };
}

export const NOTE_LIST_SELECT = {
  id: true,
  kind: true,
  title: true,
  pinned: true,
  archived: true,
  updatedAt: true,
  contentText: true,
  tags: { select: { name: true } },
  project: { select: { id: true, name: true, color: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.NoteSelect;
