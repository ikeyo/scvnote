"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorText, Input } from "@/components/ui";
import type { ProjectMemberRow } from "@/lib/types";

/** Roster for one project: add by email, promote/demote, remove, leave. */
export function ProjectMembersPanel({
  projectId,
  viewerEmail,
}: {
  projectId: string;
  viewerEmail: string | null;
}) {
  const [members, setMembers] = useState<ProjectMemberRow[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/members`);
    if (res.ok) setMembers((await res.json()).members);
  }, [projectId]);

  useEffect(() => {
    // promise-chain form: setState lands in a callback, not in the effect body
    void fetch(`/api/projects/${projectId}/members`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMembers(d.members));
  }, [projectId]);

  const isOwner = members?.some((m) => m.user.email === viewerEmail && m.role === "OWNER") ?? false;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setEmail("");
      await load();
    } else {
      setError((await res.json()).error ?? "추가에 실패했습니다");
    }
    setBusy(false);
  }

  async function setRole(userId: string, role: "OWNER" | "MEMBER") {
    setError("");
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) setError((await res.json()).error ?? "변경에 실패했습니다");
    await load();
  }

  async function removeMember(userId: string, self: boolean) {
    if (!confirm(self ? "이 프로젝트에서 나갈까요?" : "이 멤버를 제거할까요?")) return;
    setError("");
    const res = await fetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "제거에 실패했습니다");
    await load();
  }

  if (!members) return null;

  return (
    <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <ul className="space-y-1.5">
        {members.map((m) => {
          const self = m.user.email === viewerEmail;
          return (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.user.email}
                {self && <span className="text-[var(--muted)]"> (나)</span>}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {m.role === "OWNER" ? "소유자" : "멤버"}
              </span>
              {isOwner && (
                <Button onClick={() => setRole(m.user.id, m.role === "OWNER" ? "MEMBER" : "OWNER")}>
                  {m.role === "OWNER" ? "소유자 해제" : "소유자로"}
                </Button>
              )}
              {(isOwner || self) && (
                <Button variant="danger" onClick={() => removeMember(m.user.id, self)}>
                  {self ? "나가기" : "제거"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <Input
            type="email"
            placeholder="추가할 계정 이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            {busy ? "추가 중…" : "추가"}
          </Button>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
