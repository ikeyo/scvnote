import { prisma } from "@/lib/db";
import { renderNoteHtml } from "@/lib/note-render";
import { KIND_LABEL, type NoteKindValue } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated, read-only. Deliberately outside the (app) route
 * group - no sidebar, no session check. Renders through `renderNoteHtml`,
 * an allowlist renderer, never the raw TipTap JSON or a WYSIWYG editor.
 */
export default async function SharedNotePage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;

  const note = await prisma.note.findUnique({
    where: { shareToken: token },
    select: { title: true, kind: true, body: true, updatedAt: true },
  });

  if (!note) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-bold">링크를 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          존재하지 않거나, 만든 사람이 공개를 해제한 링크입니다.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <p className="text-xs text-[var(--muted)]">
        {KIND_LABEL[note.kind as NoteKindValue]} · 읽기 전용 공개 링크 ·{" "}
        {new Date(note.updatedAt).toLocaleDateString("ko-KR")} 수정
      </p>
      <h1 className="mt-1 text-3xl font-bold">{note.title}</h1>
      <div
        // reuses the editor's typographic CSS (headings/lists/code/images) -
        // those rules aren't editing-specific, so this static page borrows them
        className="note-body mt-6"
        // renderNoteHtml is an allowlist renderer (see src/lib/tiptap-render.ts) -
        // every tag is chosen explicitly and all text is escaped, so this is
        // not raw user HTML
        dangerouslySetInnerHTML={{ __html: renderNoteHtml(note.body) }}
      />
    </main>
  );
}
