"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorText, Input, Spinner } from "@/components/ui";
import { VaultGate } from "@/components/VaultGate";
import { decrypt, encrypt, generateProjectKey, wrapProjectKeyFor, type VaultKey } from "@/lib/crypto-client";
import type { Keyring } from "@/lib/vault-keyring";
import type { ProjectMemberRow, ProjectSummary, SecretRow } from "@/lib/types";

const CLIPBOARD_CLEAR_MS = 30_000;

type Meta = { initialized: boolean; salt: string | null; checkCipher: string | null; checkIv: string | null };

export function SecretsVault() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [keyring, setKeyring] = useState<Keyring | null>(null);
  const [rows, setRows] = useState<SecretRow[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [showSharing, setShowSharing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/vault")
      .then((r) => r.json())
      .then(setMeta);
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProjects(d.projects));
  }, []);

  const load = useCallback(async () => {
    const url = new URL("/api/secrets", window.location.origin);
    if (query.trim()) url.searchParams.set("q", query.trim());
    const res = await fetch(url);
    if (res.ok) setRows((await res.json()).secrets);
  }, [query]);

  useEffect(() => {
    if (!keyring) return;
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [keyring, query, load]);

  /** Adds a newly-established (or newly-granted) project key without a full reload. */
  function addProjectKey(projectId: string, projectKey: VaultKey) {
    setKeyring((k) => (k ? { ...k, projectKeys: new Map(k.projectKeys).set(projectId, projectKey) } : k));
  }

  if (!meta) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!keyring) return <VaultGate meta={meta} onUnlocked={setKeyring} />;

  const sharableProjectIds = new Set(keyring.projectKeys.keys());

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">비밀번호</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowSharing((s) => !s)}>프로젝트 공유</Button>
          <Button onClick={() => setKeyring(null)}>잠그기</Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            새 항목
          </Button>
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--muted)]">
        프로젝트에 넣은 항목은 그 프로젝트 멤버 전원과 자동으로 공유됩니다. 미분류 항목은
        본인만 볼 수 있습니다 - 서버는 어느 쪽도 읽을 수 없습니다.
      </p>

      {showSharing && (
        <SharedVaultManager
          projects={projects}
          keyring={keyring}
          onGranted={addProjectKey}
          onError={setError}
        />
      )}

      <div className="mt-4">
        <Input
          type="search"
          placeholder="제목·계정·URL 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ErrorText>{error}</ErrorText>

      {adding && (
        <SecretForm
          keyring={keyring}
          projects={projects}
          sharableProjectIds={sharableProjectIds}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
          onError={setError}
        />
      )}

      <ul className="mt-6 divide-y divide-[var(--border)]">
        {rows.map((row) => (
          <SecretItem
            key={row.id}
            row={row}
            keyring={keyring}
            onChanged={load}
            onError={setError}
          />
        ))}
      </ul>
      {rows.length === 0 && (
        <p className="py-12 text-center text-sm text-[var(--muted)]">
          {query ? "검색 결과가 없습니다" : "저장된 항목이 없습니다"}
        </p>
      )}
    </div>
  );
}

/**
 * Turns sharing on for a project this viewer owns, and hands the resulting
 * key to any member who doesn't have it yet - typically someone added after
 * sharing was already turned on, or someone who just unlocked their vault
 * for the first time and only now has a public key on file.
 */
function SharedVaultManager({
  projects,
  keyring,
  onGranted,
  onError,
}: {
  projects: ProjectSummary[];
  keyring: Keyring;
  onGranted: (projectId: string, key: VaultKey) => void;
  onError: (msg: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMemberRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function openRoster(projectId: string) {
    setOpenId(projectId);
    setMembers(null);
    const res = await fetch(`/api/projects/${projectId}/members`);
    if (res.ok) setMembers((await res.json()).members);
  }

  async function enableSharing(project: ProjectSummary) {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/members`);
      if (!res.ok) throw new Error("멤버 목록을 불러오지 못했습니다");
      const { members: roster } = (await res.json()) as { members: ProjectMemberRow[] };

      const projectKey = await generateProjectKey();
      // 지금 이 화면을 보고 있다는 것 자체가 본인 vault가 이미 잠금 해제되어
      // 있다는 뜻 -> 본인의 vaultPublicKey도 서버에 이미 올라가 있으므로,
      // 멤버 목록에서 자신을 따로 가려낼 필요 없이 공개키가 있는 사람 전원을 돈다.
      const wraps: { userId: string; wrappedKey: string }[] = [];
      for (const m of roster) {
        if (!m.user.vaultPublicKey) continue; // 아직 보관함을 한 번도 안 연 멤버 - 나중에 grant로 전달
        wraps.push({ userId: m.user.id, wrappedKey: await wrapProjectKeyFor(projectKey, m.user.vaultPublicKey) });
      }

      const enableRes = await fetch(`/api/projects/${project.id}/shared-vault`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wraps }),
      });
      if (!enableRes.ok) throw new Error((await enableRes.json()).error ?? "공유 설정에 실패했습니다");

      onGranted(project.id, projectKey);
      await openRoster(project.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function grantMember(projectId: string, member: ProjectMemberRow) {
    const projectKey = keyring.projectKeys.get(projectId);
    if (!projectKey || !member.user.vaultPublicKey) return;
    setBusy(true);
    try {
      const wrappedKey = await wrapProjectKeyFor(projectKey, member.user.vaultPublicKey);
      const res = await fetch(`/api/projects/${projectId}/shared-vault/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.user.id, wrappedKey }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "전달에 실패했습니다");
      await openRoster(projectId);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const relevant = projects.filter((p) => p.myRole === "OWNER" || keyring.projectKeys.has(p.id));
  if (relevant.length === 0) {
    return (
      <p className="mt-3 text-xs text-[var(--muted)]">
        소유한 프로젝트가 없습니다. 프로젝트를 만들면 그 안에서 비밀번호를 공유할 수 있습니다.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] p-3">
      {relevant.map((p) => {
        const enabled = keyring.projectKeys.has(p.id);
        const isOwner = p.myRole === "OWNER";
        return (
          <div key={p.id}>
            <div className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: p.color ?? "var(--muted)" }}
              />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {enabled ? (
                <>
                  <span className="text-xs text-[var(--accent)]">공유 켜짐</span>
                  <Button onClick={() => (openId === p.id ? setOpenId(null) : openRoster(p.id))}>
                    멤버 키 관리
                  </Button>
                </>
              ) : isOwner ? (
                <Button onClick={() => enableSharing(p)} disabled={busy}>
                  {busy ? "설정 중…" : "공유 켜기"}
                </Button>
              ) : null}
            </div>

            {openId === p.id && (
              <div className="mt-1 ml-4 space-y-1">
                {members === null ? (
                  <Spinner />
                ) : (
                  members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span className="min-w-0 flex-1 truncate">{m.user.email}</span>
                      {m.hasSharedVaultAccess ? (
                        <span className="text-[var(--accent)]">키 있음</span>
                      ) : m.user.vaultPublicKey ? (
                        <Button onClick={() => grantMember(p.id, m)} disabled={busy}>
                          키 전달
                        </Button>
                      ) : (
                        <span>보관함 미설정 - 본인이 먼저 /secrets를 열어야 함</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SecretItem({
  row,
  keyring,
  onChanged,
  onError,
}: {
  row: SecretRow;
  keyring: Keyring;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const projectKey = row.project ? keyring.projectKeys.get(row.project.id) : undefined;
  const activeKey = row.shared ? projectKey : keyring.personalKey;
  const locked = row.shared && !activeKey;

  async function reveal() {
    if (revealed !== null) return setRevealed(null);
    if (!activeKey) return;
    try {
      setRevealed(await decrypt(activeKey, row.secretCipher, row.secretIv));
    } catch {
      onError(`"${row.title}" 복호화에 실패했습니다.`);
    }
  }

  async function copy() {
    if (!activeKey) return;
    try {
      const value = await decrypt(activeKey, row.secretCipher, row.secretIv);
      await navigator.clipboard.writeText(value);
      // wipe the clipboard, but only if it still holds this value
      setTimeout(async () => {
        const current = await navigator.clipboard.readText().catch(() => null);
        if (current === value) await navigator.clipboard.writeText("").catch(() => {});
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      onError("복사에 실패했습니다");
    }
  }

  async function remove() {
    if (!confirm(`"${row.title}" 항목을 삭제할까요?`)) return;
    const res = await fetch(`/api/secrets/${row.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  }

  if (editing) {
    return (
      <li className="py-3">
        <SecretForm
          keyring={keyring}
          secret={row}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            // the revealed plaintext may now be stale - hide it rather than
            // keep showing the previous password
            setRevealed(null);
            onChanged();
          }}
          onError={onError}
        />
      </li>
    );
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.title}
            {row.shared && <span className="ml-2 text-xs text-[var(--accent)]">공유</span>}
          </p>
          <p className="truncate text-xs text-[var(--muted)]">
            {[row.project?.name, row.username, row.url].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 gap-1">
          {locked ? (
            <span className="text-xs text-[var(--muted)]">키 없음 - 소유자에게 요청</span>
          ) : (
            <>
              <Button onClick={reveal}>{revealed === null ? "보기" : "숨기기"}</Button>
              <Button onClick={copy}>복사</Button>
            </>
          )}
          <Button onClick={() => setEditing(true)} disabled={locked}>
            수정
          </Button>
          <Button variant="danger" onClick={remove}>
            삭제
          </Button>
        </div>
      </div>
      {revealed !== null && (
        <p className="mt-2 rounded bg-[var(--surface)] px-3 py-2 font-mono text-sm break-all">
          {revealed}
        </p>
      )}
      {row.memo && <p className="mt-1 text-xs text-[var(--muted)]">{row.memo}</p>}
    </li>
  );
}

/**
 * Creates a new entry, or edits `secret` when one is given. Project (and so
 * shared/personal) is fixed at creation and never shown as an editable field.
 */
function SecretForm({
  keyring,
  projects,
  sharableProjectIds,
  secret,
  onCancel,
  onSaved,
  onError,
}: {
  keyring: Keyring;
  projects?: ProjectSummary[];
  sharableProjectIds?: Set<string>;
  secret?: SecretRow;
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const editing = secret !== undefined;
  const [form, setForm] = useState({
    title: secret?.title ?? "",
    username: secret?.username ?? "",
    url: secret?.url ?? "",
    memo: secret?.memo ?? "",
    secret: "",
  });
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // 새 항목에서만 선택 가능: 미분류(개인) 또는 이미 공유 키를 가진 프로젝트뿐 -
  // 공유가 꺼진 프로젝트는 애초에 암호화할 키가 없으므로 목록에서 뺀다.
  const shareable = projects?.filter((p) => sharableProjectIds?.has(p.id)) ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, string | boolean | null> = {
        title: form.title,
        username: form.username,
        url: form.url,
        memo: form.memo,
        ...(editing ? {} : { projectId: projectId || null }),
      };

      // when editing, an empty password field means "keep the existing one" -
      // we never decrypt just to re-encrypt an unchanged value
      if (!editing || form.secret) {
        const activeKey =
          editing && secret.shared
            ? keyring.projectKeys.get(secret.project!.id)
            : !editing && projectId
              ? keyring.projectKeys.get(projectId)
              : keyring.personalKey;
        if (!activeKey) throw new Error("이 프로젝트의 공유 키가 없어 암호화할 수 없습니다");

        const { cipher, iv } = await encrypt(activeKey, form.secret);
        body.secretCipher = cipher;
        body.secretIv = iv;
      }

      const res = await fetch(editing ? `/api/secrets/${secret.id}` : "/api/secrets", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "저장에 실패했습니다");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 rounded-lg border border-[var(--border)] p-4">
      {editing ? (
        <p className="text-xs text-[var(--muted)]">
          {secret.shared
            ? `공유 항목 (${secret.project?.name}) - 이 프로젝트 멤버 전원이 볼 수 있습니다.`
            : "개인 항목 - 본인만 볼 수 있습니다."}{" "}
          소속은 바꿀 수 없습니다.
        </p>
      ) : (
        <>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="프로젝트"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          >
            <option value="">미분류 (개인 전용)</option>
            {shareable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} (공유)
              </option>
            ))}
          </select>
          <p className="text-xs text-[var(--muted)]">
            프로젝트를 고르면 그 프로젝트 멤버 전원과 자동으로 공유됩니다. 공유가 아직 꺼진
            프로젝트는 위쪽 &apos;프로젝트 공유&apos;에서 먼저 켜야 목록에 나타납니다.
          </p>
        </>
      )}

      <Input placeholder="제목 *" value={form.title} onChange={set("title")} required />
      <Input placeholder="계정 / 아이디" value={form.username} onChange={set("username")} />
      <Input placeholder="URL" value={form.url} onChange={set("url")} />
      <Input
        type="password"
        placeholder={editing ? "새 비밀번호 (비우면 그대로 둡니다)" : "비밀번호 *"}
        autoComplete="off"
        value={form.secret}
        onChange={set("secret")}
        required={!editing}
      />
      <Input placeholder="메모 (평문으로 저장됩니다)" value={form.memo} onChange={set("memo")} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "저장 중…" : "저장"}
        </Button>
      </div>
    </form>
  );
}
