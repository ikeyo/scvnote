"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorText, Spinner } from "@/components/ui";
import type { AdminUserRow, InviteRow } from "@/lib/types";

export function AdminPanel() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newInviteUrl, setNewInviteUrl] = useState("");

  const load = useCallback(async () => {
    const [u, i] = await Promise.all([
      fetch("/api/admin/users").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/invites").then((r) => (r.ok ? r.json() : null)),
    ]);
    if (u) setUsers(u.users);
    if (i) setInvites(i.invites);
  }, []);

  useEffect(() => {
    // promise-chain form: setState lands in a callback, not in the effect body
    void Promise.all([
      fetch("/api/admin/users").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/invites").then((r) => (r.ok ? r.json() : null)),
    ]).then(([u, i]) => {
      if (u) setUsers(u.users);
      if (i) setInvites(i.invites);
    });
  }, []);

  async function createInvite() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/invites", { method: "POST" });
    if (res.ok) {
      const { invite } = await res.json();
      setNewInviteUrl(`${window.location.origin}/invite/${invite.token}`);
      await load();
    } else {
      setError((await res.json()).error ?? "생성에 실패했습니다");
    }
    setBusy(false);
  }

  async function revokeInvite(id: string) {
    if (!confirm("이 초대 링크를 취소할까요?")) return;
    const res = await fetch(`/api/admin/invites/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "취소에 실패했습니다");
    await load();
  }

  async function patchUser(id: string, body: Record<string, boolean>) {
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json()).error ?? "변경에 실패했습니다");
    await load();
  }

  if (!users || !invites) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-bold">관리자</h1>
      <ErrorText>{error}</ErrorText>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">계정</h2>
        </div>
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {u.email}
                  {u.isAdmin && <span className="ml-2 text-xs text-[var(--accent)]">관리자</span>}
                  {u.disabledAt && <span className="ml-2 text-xs text-[var(--danger)]">비활성화됨</span>}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  가입 {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button onClick={() => patchUser(u.id, { isAdmin: !u.isAdmin })}>
                  {u.isAdmin ? "관리자 해제" : "관리자로"}
                </Button>
                <Button
                  variant={u.disabledAt ? "default" : "danger"}
                  onClick={() => patchUser(u.id, { disabled: !u.disabledAt })}
                >
                  {u.disabledAt ? "다시 활성화" : "비활성화"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">초대 링크</h2>
          <Button variant="primary" onClick={createInvite} disabled={busy}>
            {busy ? "생성 중…" : "새 초대 만들기"}
          </Button>
        </div>

        {newInviteUrl && (
          <div className="mt-2 rounded-md border border-[var(--accent)] bg-[var(--surface)] p-3 text-sm">
            <p className="text-xs text-[var(--muted)]">
              이 링크를 가진 사람은 누구나 계정을 만들 수 있습니다. 신뢰하는 사람에게만 전달하세요.
              7일간 유효합니다.
            </p>
            <code className="mt-1 block break-all text-[var(--accent)]">{newInviteUrl}</code>
          </div>
        )}

        <ul className="mt-3 divide-y divide-[var(--border)]">
          {invites.map((inv) => {
            const expired = !inv.usedAt && new Date(inv.expiresAt) < new Date();
            return (
              <li key={inv.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--muted)]">
                    {inv.usedAt
                      ? `${inv.usedBy?.email ?? "알 수 없음"}이(가) 사용함`
                      : expired
                        ? "만료됨"
                        : `${new Date(inv.expiresAt).toLocaleDateString("ko-KR")}까지 유효`}
                  </p>
                </div>
                {!inv.usedAt && !expired && (
                  <Button variant="danger" onClick={() => revokeInvite(inv.id)}>
                    취소
                  </Button>
                )}
              </li>
            );
          })}
          {invites.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--muted)]">발급한 초대가 없습니다</p>
          )}
        </ul>
      </section>
    </div>
  );
}
