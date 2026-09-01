import { HttpError } from "@/lib/api";
import { ownedOrMemberWhere } from "@/lib/access";
import { projectFilter } from "@/lib/projects";
import { NoteKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const NOTE_KINDS = Object.values(NoteKind) as string[];

export function parseKind(value: string | null | undefined): NoteKind | undefined {
  return value && NOTE_KINDS.includes(value) ? (value as NoteKind) : undefined;
}

export async function buildNoteWhere(
  userId: string,
  params: {
    q?: string | null;
    kind?: string | null;
    tag?: string | null;
    project?: string | null;
    archived?: boolean;
  },
): Promise<Prisma.NoteWhereInput> {
  // combined with AND, not spread onto one object, so this OR (visibility)
  // never collides with the search OR below
  const and: Prisma.NoteWhereInput[] = [await ownedOrMemberWhere(userId)];

  const pf = await projectFilter(userId, params.project);
  if ("projectId" in pf) and.push({ projectId: pf.projectId });

  const kind = parseKind(params.kind);
  if (kind) and.push({ kind });
  if (params.tag) and.push({ tags: { some: { name: params.tag } } });

  if (params.q?.trim()) {
    const q = params.q.trim();
    // `contains` + insensitive compiles to ILIKE '%q%', which the pg_trgm GIN
    // indexes on title/contentText can serve.
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { contentText: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return { archived: params.archived ?? false, AND: and };
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
  ownerId: true,
  shareToken: true,
  tags: { select: { name: true } },
  project: { select: { id: true, name: true, color: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.NoteSelect;
