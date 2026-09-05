"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorText, Input, Spinner } from "@/components/ui";
import { ProjectMembersPanel } from "@/components/ProjectMembersPanel";
import { notifyProjectsChanged } from "@/lib/events";
import type { ProjectSummary, SessionInfo } from "@/lib/types";

export const PALETTE = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#dc2626", "#0891b2", "#ca8a04"];

export function ProjectManager() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [membersOpenId, setMembersOpenId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSession(d));
  }, []);

  // deliberately no setLoading(true) up front: setting state synchronously
  // inside an effect is a lint error, and a refetch does not need a spinner
  const load = useCallback(async () => {
    const res = await fetch(`/api/projects${showArchived ? "?archived=1" : ""}`);
    if (res.ok) setProjects((await res.json()).projects);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => {
    // promise-chain form: setState lands in a callback, not in the effect body
    void fetch(`/api/projects${showArchived ? "?archived=1" : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setProjects(d.projects);
        setLoading(false);
      });
  }, [showArchived]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color }),
    });
    if (res.ok) {
      setName("");
      setDescription("");
      setColor(PALETTE[(projects.length + 1) % PALETTE.length]);
      await load();
      notifyProjectsChanged();
    } else {
      setError((await res.json()).error ?? "생성에 실패했습니다");
    }
    setBusy(false);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json()).error ?? "수정에 실패했습니다");
    await load();
    notifyProjectsChanged();
  }

  async function remove(project: ProjectSummary) {
    const { notes, secrets } = project._count;
    const warning =
      notes + secrets > 0
        ? `노트 ${notes}건, 내 개인 비밀번호 ${secrets}건이 미분류로 이동합니다.\n`
        : "";
    // 다른 멤버가 만든 공유 비밀번호까지는 삭제 전에 정확한 개수를 알 수 없다 -
    // 실제 삭제 결과는 DELETE 응답을 받은 뒤 따로 알린다
    if (
      !confirm(
        `${warning}이 프로젝트의 공유 비밀번호는 함께 영구히 삭제되며 되돌릴 수 없습니다.\n\n"${project.name}" 프로젝트를 삭제할까요?`,
      )
    )
      return;

    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error ?? "삭제에 실패했습니다");
    } else {
      const { deletedSharedSecrets } = (await res.json()) as { deletedSharedSecrets: number };
      if (deletedSharedSecrets > 0) alert(`공유 비밀번호 ${deletedSharedSecrets}건이 함께 삭제되었습니다.`);
    }
    await load();
    notifyProjectsChanged();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-bold">프로젝트</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        프로젝트는 가장 큰 단위입니다. 만들면 작업일지 · 코드 스니펫 · 일반 노트 세 카테고리가 함께 생깁니다.
        프로젝트에 멤버로 초대된 사람은 그 안의 노트/할 일/비밀번호를 함께 봅니다.
        프로젝트를 지우면 노트/할 일과 개인 비밀번호는 남아 미분류로 이동하지만,
        이 프로젝트의 공유 비밀번호는 함께 영구히 삭제됩니다.
      </p>

      <form onSubmit={create} className="mt-6 space-y-2 rounded-lg border border-[var(--border)] p-4">
        <Input
          placeholder="새 프로젝트 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          placeholder="설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex items-center gap-2 pt-1">
          <ColorPicker value={color} onChange={setColor} />
          <Button type="submit" variant="primary" className="ml-auto" disabled={busy}>
            {busy ? "생성 중…" : "만들기"}
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>

      <label className="mt-6 flex items-center gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        보관된 프로젝트도 보기
      </label>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : projects.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">아직 프로젝트가 없습니다</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {projects.map((p) =>
            editingId === p.id ? (
              <li key={p.id} className="py-3">
                <ProjectEditForm
                  project={p}
                  onCancel={() => setEditingId(null)}
                  onSave={async (body) => {
                    await patch(p.id, body);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li key={p.id} className="py-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: p.color ?? "var(--muted)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <Link href={`/notes?project=${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.archived && <span className="ml-2 text-xs text-[var(--muted)]">보관됨</span>}
                    <p className="truncate text-xs text-[var(--muted)]">
                      노트 {p._count.notes} · 내 비밀번호 {p._count.secrets}
                      {p.description ? ` · ${p.description}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button onClick={() => setMembersOpenId(membersOpenId === p.id ? null : p.id)}>
                      멤버
                    </Button>
                    <Button onClick={() => setEditingId(p.id)}>수정</Button>
                    <Button onClick={() => patch(p.id, { archived: !p.archived })}>
                      {p.archived ? "복구" : "보관"}
                    </Button>
                    <Button variant="danger" onClick={() => remove(p)}>
                      삭제
                    </Button>
                  </div>
                </div>
                {membersOpenId === p.id && (
                  <ProjectMembersPanel projectId={p.id} viewerEmail={session?.email ?? null} />
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <>
      <span className="text-xs text-[var(--muted)]">색상</span>
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`색상 ${c}`}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`size-5 rounded-full transition ${
            value === c
              ? "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--background)]"
              : ""
          }`}
          style={{ background: c }}
        />
      ))}
    </>
  );
}

/** Inline rename / re-describe / re-colour for one project. */
function ProjectEditForm({
  project,
  onCancel,
  onSave,
}: {
  project: ProjectSummary;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [color, setColor] = useState(project.color ?? PALETTE[0]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({ name, description, color });
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-[var(--accent)] p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" required />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="설명 (선택)"
      />
      <div className="flex items-center gap-2 pt-1">
        <ColorPicker value={color} onChange={setColor} />
        <div className="ml-auto flex gap-1">
          <Button type="button" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    </form>
  );
}
