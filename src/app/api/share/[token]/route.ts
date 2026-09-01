import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/api";
import { renderNoteHtml } from "@/lib/tiptap-render";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public, unauthenticated. Anyone with the token gets read-only access to
 * exactly this one note - nothing else about the account, project, or other
 * notes is reachable from here.
 */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;

  const note = await prisma.note.findUnique({
    where: { shareToken: token },
    select: {
      title: true,
      kind: true,
      content: true,
      updatedAt: true,
      sharedAt: true,
    },
  });
  if (!note) throw new HttpError(404, "존재하지 않거나 공개가 해제된 링크입니다");

  return Response.json({
    title: note.title,
    kind: note.kind,
    html: renderNoteHtml(note.content),
    updatedAt: note.updatedAt,
    sharedAt: note.sharedAt,
  });
});
