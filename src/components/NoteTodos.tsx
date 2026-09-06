"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, ErrorText, Input } from "@/components/ui";
import {
  TODO_KIND_LABEL,
  TODO_KIND_ORDER,
  TODO_STATUS_LABEL,
  type TodoItem,
  type TodoKindValue,
  type TodoStatusValue,
} from "@/lib/types";

/** Clicking the state chip walks 대기 -> 진행 중 -> 완료 -> 대기. */
const NEXT_STATUS: Record<TodoStatusValue, TodoStatusValue> = {
  TODO: "DOING",
  DOING: "DONE",
  DONE: "TODO",
};

/**
 * Todos raised from inside a note. They inherit the note's project on the
 * server, so a bug found while writing a worklog lands in the right backlog.
 */
export function NoteTodos({
  noteId,
  initial,
  body,
  selection,
  onJump,
  onAnchorUsed,
}: {
  noteId: string;
  initial: TodoItem[];
  /** The note's markdown, so an anchor can be checked against it. */
  body: string;
  /** Passage currently selected in the editor; empty when nothing is selected. */
  selection: string;
  /** Asks the editor to scroll to and select this passage. */
  onJump: (quote: string) => void;
  /** Called once a selection has been turned into a todo. */
  onAnchorUsed: () => void;
}) {
  const [todos, setTodos] = useState<TodoItem[]>(initial);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TodoKindValue>("BUG");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    const res = await fetch(`/api/todos?note=${noteId}`);
    if (res.ok) setTodos((await res.json()).todos);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, kind, noteId, anchorText: selection || null }),
    });
    if (res.ok) {
      setTitle("");
      onAnchorUsed();
      await reload();
    } else {
      setError((await res.json()).error ?? "추가에 실패했습니다");
    }
    setBusy(false);
  }

  async function cycle(todo: TodoItem) {
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: NEXT_STATUS[todo.status] }),
    });
    if (!res.ok) setError((await res.json()).error ?? "변경에 실패했습니다");
    await reload();
  }

  /** Unlinking keeps the todo - it just stops pointing at this note. */
  async function unlink(todo: TodoItem) {
    if (!confirm(`"${todo.title}"을 이 노트에서 떼어낼까요?\n\n할 일 자체는 남습니다.`)) return;
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: null }),
    });
    if (!res.ok) setError((await res.json()).error ?? "해제에 실패했습니다");
    await reload();
  }

  const open = todos.filter((t) => t.status !== "DONE").length;

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-medium">할 일</h2>
        <span className="text-xs text-[var(--muted)]">
          {todos.length === 0 ? "없음" : `남은 ${open} / 전체 ${todos.length}`}
        </span>
        {todos.length > 0 && (
          <Link href="/todos" className="ml-auto text-xs text-[var(--muted)] hover:text-[var(--accent)]">
            전체 보기
          </Link>
        )}
      </div>

      {selection && (
        <p className="mt-2 rounded border-l-2 border-[var(--accent)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted)]">
          <span className="text-[var(--accent)]">선택한 대목에 답니다:</span>{" "}
          <span className="italic">
            {selection.length > 120 ? `${selection.slice(0, 120)}…` : selection}
          </span>
        </p>
      )}

      <form onSubmit={add} className="mt-2 flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TodoKindValue)}
          aria-label="종류"
          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
        >
          {TODO_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {TODO_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <Input
          placeholder={selection ? "이 대목에 대한 할 일" : "이 노트에서 나온 할 일"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? "추가 중…" : "추가"}
        </Button>
      </form>

      <ErrorText>{error}</ErrorText>

      {todos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {todos.map((todo) => (
            <li key={todo.id} className="text-sm">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => cycle(todo)}
                  title="상태 바꾸기"
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs transition hover:opacity-80 ${
                    todo.status === "DONE"
                      ? "border-transparent bg-[var(--surface)] text-[var(--muted)]"
                      : todo.status === "DOING"
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {TODO_STATUS_LABEL[todo.status]}
                </button>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {TODO_KIND_LABEL[todo.kind]}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${
                    todo.status === "DONE" ? "text-[var(--muted)] line-through" : ""
                  }`}
                >
                  {todo.title}
                </span>
                <button
                  onClick={() => unlink(todo)}
                  className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  연결 해제
                </button>
              </div>
              {todo.anchorText && <Anchor quote={todo.anchorText} body={body} onJump={onJump} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The passage a todo points at. Located by searching the body for the quote,
 * so edits elsewhere don't move it - and when the quote itself is gone, that
 * shows up as "원문에서 사라짐" rather than silently pointing somewhere wrong.
 */
function Anchor({
  quote,
  body,
  onJump,
}: {
  quote: string;
  body: string;
  onJump: (quote: string) => void;
}) {
  const found = body.includes(quote);
  const shown = quote.length > 100 ? `${quote.slice(0, 100)}…` : quote;

  if (!found) {
    return (
      <p className="mt-0.5 ml-1 border-l-2 border-[var(--border)] pl-2 text-xs text-[var(--muted)]">
        <span className="italic line-through">{shown}</span> · 원문에서 사라짐
      </p>
    );
  }

  return (
    <button
      onClick={() => onJump(quote)}
      title="본문의 이 대목으로 이동"
      className="mt-0.5 ml-1 block w-full border-l-2 border-[var(--accent)] pl-2 text-left text-xs text-[var(--muted)] italic hover:text-[var(--accent)]"
    >
      {shown}
    </button>
  );
}
