export type NoteKindValue = "NOTE" | "WORKLOG" | "SNIPPET";

export const KIND_LABEL: Record<NoteKindValue, string> = {
  NOTE: "일반 노트",
  WORKLOG: "작업일지",
  SNIPPET: "코드 스니펫",
};

/** Query-param value meaning "notes with no project". */
export const UNASSIGNED = "none";

export type KindCounts = Record<NoteKindValue, number>;

/** Every project carries the same three categories; they need no rows of their own. */
export const KIND_ORDER: NoteKindValue[] = ["WORKLOG", "SNIPPET", "NOTE"];

export type ProjectRef = { id: string; name: string; color?: string | null };

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean;
  kindCounts: KindCounts;
  openTodos: number;
  _count: { notes: number; secrets: number; todos: number };
};

export type TodoKindValue = "BUG" | "IMPROVEMENT" | "IDEA" | "TASK";
export type TodoStatusValue = "TODO" | "DOING" | "DONE";

export const TODO_KIND_LABEL: Record<TodoKindValue, string> = {
  BUG: "오류",
  IMPROVEMENT: "개선",
  IDEA: "아이디어",
  TASK: "할 일",
};

export const TODO_STATUS_LABEL: Record<TodoStatusValue, string> = {
  TODO: "대기",
  DOING: "진행 중",
  DONE: "완료",
};

export const TODO_KIND_ORDER: TodoKindValue[] = ["BUG", "IMPROVEMENT", "IDEA", "TASK"];
export const TODO_STATUS_ORDER: TodoStatusValue[] = ["TODO", "DOING", "DONE"];

export type TodoItem = {
  id: string;
  kind: TodoKindValue;
  status: TodoStatusValue;
  title: string;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  project: ProjectRef | null;
  note: { id: string; title: string } | null;
};

export type TagSummary = {
  id: string;
  name: string;
  _count: { notes: number };
};

export type NoteSummary = {
  id: string;
  kind: NoteKindValue;
  title: string;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
  excerpt: string;
  tags: { name: string }[];
  project: ProjectRef | null;
  _count: { attachments: number };
};

export type AttachmentInfo = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
};

export type NoteDetail = {
  id: string;
  kind: NoteKindValue;
  title: string;
  content: unknown;
  pinned: boolean;
  archived: boolean;
  updatedAt: string;
  tags: { name: string }[];
  project: ProjectRef | null;
  todos: TodoItem[];
  attachments: AttachmentInfo[];
};

export type SecretRow = {
  id: string;
  title: string;
  username: string | null;
  url: string | null;
  memo: string | null;
  secretCipher: string;
  secretIv: string;
  project: ProjectRef | null;
};
