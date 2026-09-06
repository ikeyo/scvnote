"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Spinner } from "@/components/ui";
import {
  KIND_LABEL,
  KIND_ORDER,
  UNASSIGNED,
  type NoteKindValue,
  type NoteSummary,
  type ProjectSummary,
} from "@/lib/types";

export function NoteBrowser({
  initialKind,
  initialQuery,
  initialProject,
  initialTag,
}: {
  initialKind?: string;
  initialQuery?: string;
  initialProject?: string;
  initialTag?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery ?? "");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // guards against an older request overwriting a newer one
  const requestId = useRef(0);

  useEffect(() => {
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProjects(d.projects));
  }, []);

  const load = useCallback(
    async (q: string) => {
      const id = ++requestId.current;
      setLoading(true);
      const url = new URL("/api/notes", window.location.origin);
      if (q.trim()) url.searchParams.set("q", q.trim());
      if (initialKind) url.searchParams.set("kind", initialKind);
      if (initialProject) url.searchParams.set("project", initialProject);
      if (initialTag) url.searchParams.set("tag", initialTag);

      const res = await fetch(url);
      const data = await res.json();
      if (id !== requestId.current) return;
      setNotes(res.ok ? data.notes : []);
      setLoading(false);
    },
    [initialKind, initialProject, initialTag],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  /** New documents inherit the project and category they were created inside. */
  async function createNote(kind: NoteKindValue) {
    setCreating(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "",
        kind,
        projectId: initialProject && initialProject !== UNASSIGNED ? initialProject : null,
        body: "",
      }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/notes/${data.note.id}`);
    else setCreating(false);
  }

  const activeProject = projects.find((p) => p.id === initialProject);
  const projectLabel = activeProject
    ? activeProject.name
    : initialProject === UNASSIGNED
      ? "미분류"
      : null;
  const kindLabel = initialKind ? KIND_LABEL[initialKind as NoteKindValue] : null;

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {projectLabel && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: activeProject?.color ?? "var(--border)" }}
              />
              {projectLabel}
            </div>
          )}
          <h1 className="truncate text-xl font-bold">
            {initialTag ? `#${initialTag}` : (kindLabel ?? projectLabel ?? "전체 노트")}
          </h1>
          {!kindLabel && activeProject?.description && (
            <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
              {activeProject.description}
            </p>
          )}
        </div>

        {/* inside a category: one button. above it: one per category. */}
        {initialKind ? (
          <Button
            variant="primary"
            onClick={() => createNote(initialKind as NoteKindValue)}
            disabled={creating}
          >
            {creating ? "생성 중…" : `새 ${kindLabel}`}
          </Button>
        ) : (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {KIND_ORDER.map((kind) => (
              <Button key={kind} onClick={() => createNote(kind)} disabled={creating}>
                + {KIND_LABEL[kind]}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Input
          type="search"
          placeholder={
            kindLabel && projectLabel
              ? `${projectLabel} / ${kindLabel} 안에서 검색`
              : projectLabel
                ? `${projectLabel} 안에서 검색`
                : "제목·본문 검색"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : notes.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--muted)]">
            {query ? "검색 결과가 없습니다" : "아직 문서가 없습니다"}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {notes.map((note) => (
              <li key={note.id}>
                <Link href={`/notes/${note.id}`} className="block py-3 hover:opacity-80">
                  <div className="flex items-baseline gap-2">
                    {note.pinned && <span className="text-xs text-[var(--accent)]">고정</span>}
                    <span className="truncate font-medium">{note.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--muted)]">
                      {new Date(note.updatedAt).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  {note.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{note.excerpt}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
                    {/* each label is redundant once you've filtered by it */}
                    {!initialKind && (
                      <span className="rounded border border-[var(--border)] px-1.5 py-0.5">
                        {KIND_LABEL[note.kind]}
                      </span>
                    )}
                    {!initialProject && note.project && (
                      <span className="flex items-center gap-1 rounded bg-[var(--surface)] px-1.5 py-0.5">
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full"
                          style={{ background: note.project.color ?? "var(--muted)" }}
                        />
                        {note.project.name}
                      </span>
                    )}
                    {note.tags.map((t) => (
                      <span key={t.name} className="rounded bg-[var(--surface)] px-1.5 py-0.5">
                        #{t.name}
                      </span>
                    ))}
                    {note._count.attachments > 0 && <span>첨부 {note._count.attachments}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
