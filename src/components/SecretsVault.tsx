"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorText, Input, Spinner } from "@/components/ui";
import { VaultGate } from "@/components/VaultGate";
import { decrypt, encrypt } from "@/lib/crypto-client";
import type { ProjectSummary, SecretRow } from "@/lib/types";

const CLIPBOARD_CLEAR_MS = 30_000;

type Meta = { initialized: boolean; salt: string | null; checkCipher: string | null; checkIv: string | null };

export function SecretsVault() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [rows, setRows] = useState<SecretRow[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
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
    if (!key) return;
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [key, query, load]);

  if (!meta) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!key) return <VaultGate meta={meta} onUnlocked={setKey} />;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">비밀번호</h1>
        <div className="flex gap-2">
          <Button onClick={() => setKey(null)}>잠그기</Button>
          <Button variant="primary" onClick={() => setAdding(true)}>
            새 항목
          </Button>
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--muted)]">
        비밀번호는 이 브라우저에서만 복호화됩니다. 서버와 MCP는 값을 읽을 수 없습니다.
      </p>

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
          cryptoKey={key}
          projects={projects}
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
            cryptoKey={key}
            projects={projects}
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

function SecretItem({
  row,
  cryptoKey,
  projects,
  onChanged,
  onError,
}: {
  row: SecretRow;
  cryptoKey: CryptoKey;
  projects: ProjectSummary[];
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function reveal() {
    if (revealed !== null) return setRevealed(null);
    try {
      setRevealed(await decrypt(cryptoKey, row.secretCipher, row.secretIv));
    } catch {
      onError(`"${row.title}" 복호화에 실패했습니다. 다른 마스터 패스워드로 저장된 항목입니다.`);
    }
  }

  async function copy() {
    try {
      const value = await decrypt(cryptoKey, row.secretCipher, row.secretIv);
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
          cryptoKey={cryptoKey}
          projects={projects}
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
          <p className="truncate font-medium">{row.title}</p>
          <p className="truncate text-xs text-[var(--muted)]">
            {[row.project?.name, row.username, row.url].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 gap-1">
          <Button onClick={reveal}>{revealed === null ? "보기" : "숨기기"}</Button>
          <Button onClick={copy}>복사</Button>
          <Button onClick={() => setEditing(true)}>수정</Button>
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

/** Creates a new entry, or edits `secret` when one is given. */
function SecretForm({
  cryptoKey,
  projects,
  secret,
  onCancel,
  onSaved,
  onError,
}: {
  cryptoKey: CryptoKey;
  projects: ProjectSummary[];
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
  const [projectId, setProjectId] = useState(secret?.project?.id ?? "");
  const [busy, setBusy] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, string | null> = {
        title: form.title,
        username: form.username,
        url: form.url,
        memo: form.memo,
        projectId: projectId || null,
      };

      // when editing, an empty password field means "keep the existing one" -
      // we never decrypt just to re-encrypt an unchanged value
      if (!editing || form.secret) {
        const { cipher, iv } = await encrypt(cryptoKey, form.secret);
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
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        aria-label="프로젝트"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
      >
        <option value="">미분류</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
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
