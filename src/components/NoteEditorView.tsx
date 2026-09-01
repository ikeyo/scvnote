"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Editor, type UploadResult } from "@/components/Editor";
import { NoteTodos } from "@/components/NoteTodos";
import { Button } from "@/components/ui";
import {
  KIND_LABEL,
  KIND_ORDER,
  type AttachmentInfo,
  type NoteDetail,
  type NoteKindValue,
  type ProjectSummary,
} from "@/lib/types";

const AUTOSAVE_MS = 900;

export function NoteEditorView({ initial }: { initial: NoteDetail }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [kind, setKind] = useState<NoteKindValue>(initial.kind);
  const [tags, setTags] = useState(initial.tags.map((t) => t.name).join(", "));
  const [pinned, setPinned] = useState(initial.pinned);
  const [projectId, setProjectId] = useState<string>(initial.project?.id ?? "");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>(initial.attachments);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const contentRef = useRef<unknown>(initial.content);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // skips the autosave that the initial render would otherwise trigger
  const dirty = useRef(false);

  const save = useCallback(async () => {
    setStatus("saving");
    const res = await fetch(`/api/notes/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        kind,
        pinned,
        projectId: projectId || null,
        content: contentRef.current,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    setStatus(res.ok ? "saved" : "error");
  }, [initial.id, title, kind, pinned, tags, projectId]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  }, [save]);

  useEffect(() => {
    if (!dirty.current) return;
    scheduleSave();
  }, [title, kind, tags, pinned, projectId, scheduleSave]);

  // flush a pending save when leaving the page
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProjects(d.projects));
  }, []);

  const upload = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      const form = new FormData();
      form.append("file", file);
      form.append("noteId", initial.id);

      const res = await fetch("/api/attachments", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        return null;
      }
      setAttachments((prev) => [...prev, data.attachment]);
      return { url: data.url, originalName: data.attachment.originalName };
    },
    [initial.id],
  );

  async function removeAttachment(a: AttachmentInfo) {
    if (!confirm(`"${a.originalName}" 첨부를 삭제할까요? 본문의 이미지도 깨집니다.`)) return;
    const res = await fetch(`/api/attachments/${a.storedName}`, { method: "DELETE" });
    if (res.ok) setAttachments((prev) => prev.filter((x) => x.id !== a.id));
  }

  async function remove() {
    if (!confirm("이 노트를 삭제할까요? 되돌릴 수 없습니다.")) return;
    const res = await fetch(`/api/notes/${initial.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/notes");
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="프로젝트"
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1"
        >
          <option value="">미분류</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <span className="text-[var(--muted)]">/</span>

        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as NoteKindValue)}
          aria-label="카테고리"
          className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1"
        >
          {KIND_ORDER.map((value) => (
            <option key={value} value={value}>
              {KIND_LABEL[value]}
            </option>
          ))}
        </select>

        <Button onClick={() => setPinned((p) => !p)}>{pinned ? "고정 해제" : "고정"}</Button>

        <span className="ml-auto text-xs text-[var(--muted)]">
          {status === "saving" && "저장 중…"}
          {status === "saved" && "저장됨"}
          {status === "error" && <span className="text-[var(--danger)]">저장 실패</span>}
        </span>
        <Button variant="danger" onClick={remove}>
          삭제
        </Button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        className="mt-5 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-[var(--muted)]"
      />

      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="태그 (쉼표로 구분)"
        className="mt-2 w-full bg-transparent text-sm text-[var(--muted)] outline-none"
      />

      <Editor
        content={initial.content}
        onChange={(doc) => {
          contentRef.current = doc;
          scheduleSave();
        }}
        onUpload={upload}
      />

      <NoteTodos noteId={initial.id} initial={initial.todos} />

      {attachments.length > 0 && (
        <section className="mt-10 border-t border-[var(--border)] pt-4">
          <h2 className="text-sm font-medium">첨부파일 {attachments.length}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <a
                  href={`/api/attachments/${a.storedName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[var(--accent)] hover:underline"
                >
                  {a.originalName}
                </a>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {(a.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => removeAttachment(a)}
                  className="ml-auto shrink-0 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
