import { prisma } from "@/lib/db";
import { docToText, deriveTitle } from "@/lib/tiptap-text";
import {
  memberProjectIds,
  requireNoteAccess,
  requireTodoAccess,
  secretVisibilityWhere,
} from "@/lib/access";
import { NOTE_LIST_SELECT, buildNoteWhere, connectTags, parseKind } from "@/lib/notes";
import { UNASSIGNED, projectFilter, projectSelect, resolveProjectId } from "@/lib/projects";
import {
  TODO_ORDER,
  TODO_SELECT,
  buildTodoWhere,
  parseTodoKind,
  parseTodoStatus,
  resolveNoteLink,
} from "@/lib/todos";
import { NoteKind, ProjectRole, TodoKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, userId: string) => Promise<unknown>;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;

/** Shared so every tool documents the same project semantics. */
const PROJECT_ARG = {
  type: "string",
  description:
    '프로젝트 이름 또는 ID. 생략하면 미분류. "' + UNASSIGNED + '"를 주면 미분류만 대상으로 한다. ' +
    "이 도구를 쓰는 사용자가 멤버가 아닌 프로젝트는 지정할 수 없다.",
} as const;

/** Wraps plain text (paragraphs split on blank lines) into a TipTap document. */
function textToDoc(text: string): Prisma.InputJsonValue {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim());
  return {
    type: "doc",
    content: (blocks.length ? blocks : [""]).map((block) => ({
      type: "paragraph",
      content: block ? [{ type: "text", text: block }] : [],
    })),
  } as Prisma.InputJsonValue;
}

function appendParagraphs(doc: unknown, text: string): Prisma.InputJsonValue {
  const base =
    doc && typeof doc === "object" && Array.isArray((doc as { content?: unknown[] }).content)
      ? (doc as { type?: string; content: unknown[] })
      : { type: "doc", content: [] };
  const added = (textToDoc(text) as { content: unknown[] }).content;
  return { type: "doc", content: [...base.content, ...added] } as Prisma.InputJsonValue;
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "list_projects",
    title: "프로젝트 목록",
    description:
      "내가 멤버인 프로젝트 목록과 각 프로젝트의 노트/할 일/내 비밀번호 개수를 반환한다. 노트를 저장하기 전에 이걸로 기존 프로젝트 이름을 확인한다.",
    inputSchema: {
      type: "object",
      properties: {
        includeArchived: { type: "boolean", default: false, description: "보관된 프로젝트도 포함" },
      },
    },
    async run(args, userId) {
      const ids = await memberProjectIds(userId);
      const projects = await prisma.project.findMany({
        where: {
          id: { in: ids },
          ...(args.includeArchived ? {} : { archived: false }),
        },
        orderBy: [{ archived: "asc" }, { name: "asc" }],
        select: projectSelect(userId),
      });
      const unassigned = await prisma.note.count({
        where: { projectId: null, archived: false, ownerId: userId },
      });
      return {
        count: projects.length,
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          archived: p.archived,
          notes: p._count.notes,
          todos: p._count.todos,
          mySecrets: p._count.secrets,
        })),
        // "미분류" is always the caller's own - other users' private notes never show up here
        myUnassignedNotes: unassigned,
      };
    },
  },
  {
    name: "create_project",
    title: "프로젝트 생성",
    description:
      "새 프로젝트를 만든다. 만든 사람이 자동으로 소유자(OWNER)가 된다. 먼저 list_projects로 같은 것이 있는지 확인한다. 이름은 중복될 수 없다.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
    async run(args, userId) {
      const name = str(args.name);
      if (!name) throw new Error("name이 필요합니다");

      const existing = await prisma.project.findUnique({ where: { name }, select: { id: true } });
      if (existing) throw new Error("같은 이름의 프로젝트가 이미 있습니다: " + name);

      const project = await prisma.project.create({
        data: {
          name,
          description: str(args.description) ?? null,
          members: { create: { userId, role: ProjectRole.OWNER } },
        },
        select: { id: true, name: true },
      });
      return { ...project, message: "프로젝트를 만들었습니다 (소유자로 등록됨)" };
    },
  },
  {
    name: "list_todos",
    title: "할 일 목록",
    description:
      "내가 볼 수 있는 할 일을 조회한다 - 내가 만든 미분류 항목과, 내가 멤버인 프로젝트의 항목. 기본은 아직 끝나지 않은 것만 반환한다. kind로 오류(BUG)/개선(IMPROVEMENT)/아이디어(IDEA)/할 일(TASK)을 구분한다.",
    inputSchema: {
      type: "object",
      properties: {
        project: PROJECT_ARG,
        kind: { type: "string", enum: ["BUG", "IMPROVEMENT", "IDEA", "TASK"] },
        status: {
          type: "string",
          enum: ["TODO", "DOING", "DONE"],
          description: "생략하면 TODO와 DOING만 반환한다",
        },
        q: { type: "string", description: "제목·설명 부분 일치" },
        note: { type: "string", description: "이 노트에 연결된 할 일만 (노트 ID)" },
      },
    },
    async run(args, userId) {
      const where = await buildTodoWhere(userId, {
        q: str(args.q),
        kind: str(args.kind),
        status: str(args.status),
        project: str(args.project),
        note: str(args.note),
        open: args.status === undefined,
      });

      const todos = await prisma.todo.findMany({
        where,
        orderBy: TODO_ORDER,
        take: 100,
        select: TODO_SELECT,
      });
      return {
        count: todos.length,
        todos: todos.map((t) => ({
          id: t.id,
          kind: t.kind,
          status: t.status,
          title: t.title,
          detail: t.detail,
          project: t.project?.name ?? null,
          note: t.note ? { id: t.note.id, title: t.note.title } : null,
        })),
      };
    },
  },
  {
    name: "create_todo",
    title: "할 일 추가",
    description:
      "할 일을 추가한다. 오류를 발견했으면 kind=BUG, 개선안은 IMPROVEMENT, 떠오른 생각은 IDEA를 쓴다.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        detail: { type: "string", description: "부연 설명(선택)" },
        kind: { type: "string", enum: ["BUG", "IMPROVEMENT", "IDEA", "TASK"], default: "TASK" },
        project: PROJECT_ARG,
        noteId: {
          type: "string",
          description: "이 할 일이 나온 노트의 ID. 주면 노트의 프로젝트를 그대로 물려받는다",
        },
      },
      required: ["title"],
    },
    async run(args, userId) {
      const title = str(args.title);
      if (!title) throw new Error("title이 필요합니다");

      const link = await resolveNoteLink(userId, str(args.noteId));
      // a todo raised from a note inherits that note's project unless told otherwise
      const projectId = (await resolveProjectId(userId, str(args.project))) ?? link?.projectId ?? null;

      const todo = await prisma.todo.create({
        data: {
          title,
          detail: str(args.detail) ?? null,
          kind: parseTodoKind(str(args.kind)) ?? TodoKind.TASK,
          ownerId: userId,
          projectId,
          noteId: link?.id ?? null,
        },
        select: {
          id: true,
          kind: true,
          status: true,
          title: true,
          project: { select: { name: true } },
          note: { select: { id: true, title: true } },
        },
      });
      return {
        ...todo,
        project: todo.project?.name ?? null,
        note: todo.note?.title ?? null,
        message: "추가했습니다",
      };
    },
  },
  {
    name: "update_todo",
    title: "할 일 진행 변경",
    description:
      "할 일의 상태·제목·종류·프로젝트를 바꾼다. 진행 상태는 TODO(대기) / DOING(진행 중) / DONE(완료)이다. 완료 처리에 이걸 쓴다. 내가 볼 수 있는 할 일만 바꿀 수 있다.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "할 일 ID (list_todos로 찾는다)" },
        status: { type: "string", enum: ["TODO", "DOING", "DONE"] },
        title: { type: "string" },
        detail: { type: "string" },
        kind: { type: "string", enum: ["BUG", "IMPROVEMENT", "IDEA", "TASK"] },
        project: PROJECT_ARG,
        noteId: { type: "string", description: "연결할 노트 ID. 빈 문자열이면 연결 해제" },
      },
      required: ["id"],
    },
    async run(args, userId) {
      const id = str(args.id);
      if (!id) throw new Error("id가 필요합니다");
      await requireTodoAccess(userId, id);

      const data: Prisma.TodoUpdateInput = {};
      const title = str(args.title);
      if (title) data.title = title;
      if (args.detail !== undefined) data.detail = str(args.detail) ?? null;
      const kind = parseTodoKind(str(args.kind));
      if (kind) data.kind = kind;
      const status = parseTodoStatus(str(args.status));
      if (status) {
        data.status = status;
        data.doneAt = status === "DONE" ? new Date() : null;
      }
      if (args.project !== undefined) {
        const pid = await resolveProjectId(userId, str(args.project));
        data.project = pid ? { connect: { id: pid } } : { disconnect: true };
      }
      if (args.noteId !== undefined) {
        const link = await resolveNoteLink(userId, str(args.noteId));
        data.note = link ? { connect: { id: link.id } } : { disconnect: true };
      }
      if (Object.keys(data).length === 0) throw new Error("바꿀 항목이 하나도 없습니다");

      const todo = await prisma.todo.update({
        where: { id },
        data,
        select: { id: true, kind: true, status: true, title: true, project: { select: { name: true } } },
      });
      return { ...todo, project: todo.project?.name ?? null, message: "변경했습니다" };
    },
  },
  {
    name: "list_tags",
    title: "태그 목록",
    description:
      "내가 볼 수 있는 노트에 쓰이고 있는 태그와 개수를 반환한다. 노트를 저장하기 전에 이걸로 기존 표기를 확인하면 비슷한 태그가 중복 생기는 것을 막을 수 있다.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "태그 이름 부분 일치 필터" },
      },
    },
    async run(args, userId) {
      const q = str(args.q);
      const ids = await memberProjectIds(userId);
      const visibility: Prisma.NoteWhereInput = {
        OR: [{ ownerId: userId, projectId: null }, ...(ids.length ? [{ projectId: { in: ids } }] : [])],
      };
      const tags = await prisma.tag.findMany({
        where: {
          notes: { some: visibility },
          ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        },
        orderBy: { name: "asc" },
        select: { name: true, _count: { select: { notes: { where: visibility } } } },
      });
      return {
        count: tags.length,
        tags: tags.map((t) => ({ name: t.name, notes: t._count.notes })),
      };
    },
  },
  {
    name: "create_note",
    title: "노트 생성",
    description:
      "새 노트를 만든다. 작업일지는 kind=WORKLOG, 코드 조각은 kind=SNIPPET을 쓴다. 비밀번호는 저장할 수 없다.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "제목. 비우면 본문 첫 줄에서 만든다" },
        text: { type: "string", description: "본문(일반 텍스트). 빈 줄로 문단을 나눈다" },
        kind: { type: "string", enum: ["NOTE", "WORKLOG", "SNIPPET"], default: "NOTE" },
        project: PROJECT_ARG,
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["text"],
    },
    async run(args, userId) {
      const text = str(args.text) ?? "";
      const note = await prisma.note.create({
        data: {
          kind: parseKind(str(args.kind)) ?? NoteKind.NOTE,
          title: str(args.title) ?? deriveTitle(text),
          content: textToDoc(text),
          contentText: text,
          tags: connectTags(strArray(args.tags)),
          ownerId: userId,
          projectId: await resolveProjectId(userId, str(args.project)),
        },
        select: { id: true, title: true, kind: true, project: { select: { name: true } } },
      });
      return { ...note, project: note.project?.name ?? null, message: "저장했습니다" };
    },
  },
  {
    name: "append_to_note",
    title: "노트에 이어쓰기",
    description: "기존 노트 본문 끝에 텍스트를 덧붙인다. 작업일지 누적에 쓴다. 내가 볼 수 있는 노트만 가능하다.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "노트 ID (search_notes로 찾는다)" },
        text: { type: "string" },
      },
      required: ["id", "text"],
    },
    async run(args, userId) {
      const id = str(args.id);
      const text = str(args.text);
      if (!id || !text) throw new Error("id와 text가 필요합니다");
      await requireNoteAccess(userId, id);

      const existing = await prisma.note.findUniqueOrThrow({ where: { id }, select: { content: true } });
      const content = appendParagraphs(existing.content, text);
      const note = await prisma.note.update({
        where: { id },
        data: { content, contentText: docToText(content) },
        select: { id: true, title: true, updatedAt: true },
      });
      return { ...note, message: "이어썼습니다" };
    },
  },
  {
    name: "update_note",
    title: "노트 속성 변경",
    description:
      "기존 노트의 제목·카테고리·프로젝트·고정 여부를 바꾼다. 본문은 건드리지 않는다(본문은 append_to_note를 쓴다). 노트를 다른 프로젝트로 옮길 때 이걸 쓴다. 내가 볼 수 있는 노트만 가능하다.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        kind: { type: "string", enum: ["NOTE", "WORKLOG", "SNIPPET"] },
        project: PROJECT_ARG,
        pinned: { type: "boolean" },
      },
      required: ["id"],
    },
    async run(args, userId) {
      const id = str(args.id);
      if (!id) throw new Error("id가 필요합니다");
      await requireNoteAccess(userId, id);

      const data: Prisma.NoteUpdateInput = {};
      const title = str(args.title);
      if (title) data.title = title;
      const kind = parseKind(str(args.kind));
      if (kind) data.kind = kind;
      if (typeof args.pinned === "boolean") data.pinned = args.pinned;
      if (args.project !== undefined) {
        const pid = await resolveProjectId(userId, str(args.project));
        data.project = pid ? { connect: { id: pid } } : { disconnect: true };
      }
      if (Object.keys(data).length === 0) throw new Error("바꿀 속성이 하나도 없습니다");

      const note = await prisma.note.update({
        where: { id },
        data,
        select: {
          id: true,
          title: true,
          kind: true,
          pinned: true,
          project: { select: { name: true } },
        },
      });
      return { ...note, project: note.project?.name ?? null, message: "변경했습니다" };
    },
  },
  {
    name: "search_notes",
    title: "노트 검색",
    description:
      "내가 볼 수 있는 노트에서 제목과 본문 키워드를 검색한다 - 내 미분류 노트와, 내가 멤버인 프로젝트의 노트. 결과는 요약만 반환한다. project를 주면 그 프로젝트 안에서만 찾는다.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "검색어. 비우면 최근 노트를 반환한다" },
        kind: { type: "string", enum: ["NOTE", "WORKLOG", "SNIPPET"] },
        project: PROJECT_ARG,
        tag: { type: "string" },
        limit: { type: "integer", default: 10, maximum: 50 },
      },
    },
    async run(args, userId) {
      const limit = Math.min(Number(args.limit) || 10, 50);
      const notes = await prisma.note.findMany({
        where: await buildNoteWhere(userId, {
          q: str(args.q),
          kind: str(args.kind),
          tag: str(args.tag),
          project: str(args.project),
        }),
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        take: limit,
        select: NOTE_LIST_SELECT,
      });
      return {
        count: notes.length,
        notes: notes.map((n) => ({
          id: n.id,
          title: n.title,
          kind: n.kind,
          project: n.project?.name ?? null,
          tags: n.tags.map((t) => t.name),
          updatedAt: n.updatedAt,
          excerpt: n.contentText.slice(0, 300),
        })),
      };
    },
  },
  {
    name: "get_note",
    title: "노트 전문 읽기",
    description: "ID로 노트 본문 전체를 읽는다. 내가 볼 수 있는 노트만 가능하다.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    async run(args, userId) {
      const id = str(args.id);
      if (!id) throw new Error("id가 필요합니다");
      await requireNoteAccess(userId, id);

      const note = await prisma.note.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          title: true,
          kind: true,
          contentText: true,
          updatedAt: true,
          tags: { select: { name: true } },
          project: { select: { name: true } },
          todos: { select: { id: true, kind: true, status: true, title: true }, orderBy: TODO_ORDER },
          attachments: { select: { originalName: true, mimeType: true, size: true } },
        },
      });
      return { ...note, project: note.project?.name ?? null, tags: note.tags.map((t) => t.name) };
    },
  },
  {
    name: "list_secrets",
    title: "비밀번호 항목 목록",
    description:
      "내 비밀번호 항목의 제목/계정/URL만 반환한다. 비밀번호는 사용자마다 독립된 보관함이라 다른 사람의 항목은 보이지 않는다. 값 자체는 브라우저에서만 복호화되므로 이 도구로는 절대 읽을 수 없다.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string" },
        project: PROJECT_ARG,
      },
    },
    async run(args, userId) {
      const q = str(args.q);
      const and: Prisma.SecretWhereInput[] = [secretVisibilityWhere(userId)];
      const pf = await projectFilter(userId, str(args.project));
      if ("projectId" in pf) and.push({ projectId: pf.projectId });
      if (q) {
        and.push({
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
            { url: { contains: q, mode: "insensitive" as const } },
          ],
        });
      }

      const secrets = await prisma.secret.findMany({
        where: { AND: and },
        orderBy: { title: "asc" },
        take: 50,
        // deliberately excludes secretCipher/secretIv
        select: {
          id: true,
          title: true,
          username: true,
          url: true,
          memo: true,
          project: { select: { name: true } },
        },
      });
      return {
        count: secrets.length,
        secrets: secrets.map((s) => ({ ...s, project: s.project?.name ?? null })),
        note: "이 계정 소유의 항목만 보인다. 값은 웹 UI에서 본인 마스터 패스워드로만 열 수 있다.",
      };
    },
  },
];
