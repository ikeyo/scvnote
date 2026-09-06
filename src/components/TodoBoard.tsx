"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorText, Input, Spinner } from "@/components/ui";
import {
  TODO_KIND_LABEL,
  TODO_KIND_ORDER,
  TODO_STATUS_LABEL,
  TODO_STATUS_ORDER,
  UNASSIGNED,
  type ProjectSummary,
  type TodoItem,
  type TodoKindValue,
  type TodoStatusValue,
} from "@/lib/types";

const KIND_STYLE: Record<TodoKindValue, string> = {
  BUG: "border-[var(--danger)] text-[var(--danger)]",
  IMPROVEMENT: "border-[var(--accent)] text-[var(--accent)]",
  IDEA: "border-[var(--border)] text-[var(--muted)]",
  TASK: "border-[var(--border)] text-[var(--muted)]",
};

/** Clicking the state chip walks 대기 -> 진행 중 -> 완료 -> 대기. */
const NEXT_STATUS: Record<TodoStatusValue, TodoStatusValue> = {
  TODO: "DOING",
  DOING: "DONE",
  DONE: "TODO",
};

export function TodoBoard({ initialProject }: { initialProject?: string }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const [kindFilter, setKindFilter] = useState<TodoKindValue | "">("");
  const [error, setError] = useState("");

  // new-item form
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TodoKindValue>("BUG");
  const [busy, setBusy] = useState(false);

  const listUrl = (() => {
    const u = new URLSearchParams();
    if (initialProject) u.set("project", initialProject);
    if (kindFilter) u.set("kind", kindFilter);
    if (hideDone) u.set("open", "1");
    const qs = u.toString();
    return `/api/todos${qs ? `?${qs}` : ""}`;
  })();

  const load = useCallback(async () => {
    const res = await fetch(listUrl);
    if (res.ok) setTodos((await res.json()).todos);
    setLoading(false);
  }, [listUrl]);

  useEffect(() => {
    // promise-chain form: setState lands in a callback, not in the effect body
    void fetch(listUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setTodos(d.todos);
        setLoading(false);
      });
  }, [listUrl]);

  useEffect(() => {
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProjects(d.projects));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        kind,
        projectId: initialProject && initialProject !== UNASSIGNED ? initialProject : null,
      }),
    });
    if (res.ok) {
      setTitle("");
      await load();
    } else {
      setError((await res.json()).error ?? "추가에 실패했습니다");
    }
    setBusy(false);
  }

  async function patch(todo: TodoItem, body: Record<string, unknown>) {
    setError("");
    const res = await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json()).error ?? "변경에 실패했습니다");
    await load();
  }

  async function remove(todo: TodoItem) {
    if (!confirm(`"${todo.title}" 항목을 삭제할까요?`)) return;
    const res = await fetch(`/api/todos/${todo.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "삭제에 실패했습니다");
    await load();
  }

  const activeProject = projects.find((p) => p.id === initialProject);
  const scopeLabel = activeProject
    ? activeProject.name
    : initialProject === UNASSIGNED
      ? "미분류"
      : null;

  const open = todos.filter((t) => t.status !== "DONE");
  const byStatus = (s: TodoStatusValue) => todos.filter((t) => t.status === s);

  return (
    <div className="page">
      <div className="min-w-0">
        {scopeLabel && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: activeProject?.color ?? "var(--border)" }}
            />
            {scopeLabel}
          </div>
        )}
        <h1 className="text-xl font-bold">할 일</h1>
        <p className="mt-0.5 text-sm text-[var(--muted)]">
          {open.length > 0 ? `남은 항목 ${open.length}건` : "남은 항목이 없습니다"}
        </p>
      </div>

      <form onSubmit={add} className="mt-5 flex gap-2">
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
          placeholder="무엇을 해야 하나요?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Button type="submit" variant="primary" disabled={busy} className="shrink-0">
          {busy ? "추가 중…" : "추가"}
        </Button>
      </form>

      <ErrorText>{error}</ErrorText>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <button
          onClick={() => setKindFilter("")}
          className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
            kindFilter === "" ? "border-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          전체
        </button>
        {TODO_KIND_ORDER.map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
              kindFilter === k ? "border-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {TODO_KIND_LABEL[k]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-[var(--muted)]">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          완료 숨기기
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : todos.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">할 일이 없습니다</p>
      ) : (
        <div className="mt-4 space-y-6">
          {TODO_STATUS_ORDER.filter((s) => byStatus(s).length > 0).map((status) => (
            <section key={status}>
              <h2 className="text-xs font-medium tracking-wide text-[var(--muted)]">
                {TODO_STATUS_LABEL[status]} {byStatus(status).length}
              </h2>
              <ul className="mt-1 divide-y divide-[var(--border)]">
                {byStatus(status).map((todo) => (
                  <TodoRow
                    key={todo.id}
                    todo={todo}
                    showProject={!initialProject}
                    onCycle={() => patch(todo, { status: NEXT_STATUS[todo.status] })}
                    onSave={(body) => patch(todo, body)}
                    onRemove={() => remove(todo)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TodoRow({
  todo,
  showProject,
  onCycle,
  onSave,
  onRemove,
}: {
  todo: TodoItem;
  showProject: boolean;
  onCycle: () => Promise<void>;
  onSave: (body: Record<string, unknown>) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [detail, setDetail] = useState(todo.detail ?? "");
  const [kind, setKind] = useState<TodoKindValue>(todo.kind);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ title, detail, kind });
    setBusy(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="py-3">
        <form onSubmit={submit} className="space-y-2">
          <div className="flex gap-2">
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
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <Input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="설명 (선택)"
          />
          <div className="flex justify-end gap-1">
            <Button type="button" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "저장 중…" : "저장"}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  const done = todo.status === "DONE";

  return (
    <li className="flex items-start gap-2 py-2.5">
      <button
        onClick={onCycle}
        title="상태 바꾸기"
        className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs transition hover:opacity-80 ${
          done
            ? "border-transparent bg-[var(--surface)] text-[var(--muted)]"
            : todo.status === "DOING"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--muted)]"
        }`}
      >
        {TODO_STATUS_LABEL[todo.status]}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? "text-[var(--muted)] line-through" : ""}`}>{todo.title}</p>
        {todo.detail && <p className="mt-0.5 text-xs text-[var(--muted)]">{todo.detail}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className={`rounded border px-1.5 py-0.5 ${KIND_STYLE[todo.kind]}`}>
            {TODO_KIND_LABEL[todo.kind]}
          </span>
          {showProject && todo.project && (
            <span className="flex items-center gap-1 rounded bg-[var(--surface)] px-1.5 py-0.5">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: todo.project.color ?? "var(--muted)" }}
              />
              {todo.project.name}
            </span>
          )}
          {todo.note && (
            <Link href={`/notes/${todo.note.id}`} className="hover:text-[var(--accent)]">
              📄 {todo.note.title}
            </Link>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-1">
        <Button onClick={() => setEditing(true)}>수정</Button>
        <Button variant="danger" onClick={onRemove}>
          삭제
        </Button>
      </div>
    </li>
  );
}
