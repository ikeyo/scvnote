"use client";

import { useEffect, useState } from "react";
import { Button, ErrorText, Input } from "@/components/ui";
import type { McpTokenRow, SessionInfo } from "@/lib/types";

export function SettingsView() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [tokens, setTokens] = useState<McpTokenRow[]>([]);
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSession(d));
    void fetch("/api/mcp-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTokens(d.tokens));
  }, []);

  async function reload() {
    const res = await fetch("/api/mcp-token");
    if (res.ok) setTokens((await res.json()).tokens);
  }

  async function issueToken(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/mcp-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      setNewToken((await res.json()).token);
      setLabel("");
      await reload();
    } else {
      setError((await res.json()).error ?? "발급에 실패했습니다");
    }
    setBusy(false);
  }

  async function revoke(token: McpTokenRow) {
    if (!confirm(`"${token.label}" 토큰을 지울까요?\n\n그 기기의 연결이 즉시 끊깁니다.`)) return;
    const res = await fetch(`/api/mcp-token?id=${token.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "삭제에 실패했습니다");
    await reload();
  }

  return (
    <div className="page">
      <h1 className="text-xl font-bold">설정</h1>
      {session?.email && <p className="mt-1 text-sm text-[var(--muted)]">{session.email}</p>}

      <section className="mt-8 rounded-lg border border-[var(--border)] p-4">
        <h2 className="text-sm font-medium">MCP 토큰</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Claude Code · Codex 등 MCP 클라이언트를 이 계정으로 연결할 때 쓴다. 이 토큰으로 접근하는
          모든 내용은 이 계정이 볼 수 있는 것으로 한정된다 - 다른 사용자의 비공개 항목은 절대 보이지
          않는다.
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          <strong>기기마다 하나씩 발급한다.</strong> 새 PC를 붙일 때 기존 토큰을 다시 쓰지 말고 새로
          발급하면, 이미 연결된 기기는 그대로 두고 잃어버린 기기 것만 골라 지울 수 있다.
        </p>

        {tokens.length > 0 && (
          <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{t.label}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {t.lastUsedAt
                    ? `마지막 사용 ${new Date(t.lastUsedAt).toLocaleDateString("ko-KR")}`
                    : "사용 기록 없음"}
                </span>
                <button
                  onClick={() => revoke(t)}
                  className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}

        {newToken && (
          <div className="mt-3 rounded-md border border-[var(--accent)] bg-[var(--surface)] p-3">
            <p className="text-xs text-[var(--muted)]">
              지금만 보입니다. 안전한 곳에 옮겨 적으세요 - 다시 볼 수 없습니다.
            </p>
            <code className="mt-1 block break-all text-sm text-[var(--accent)]">{newToken}</code>
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--background)] p-2 text-xs">
{`claude mcp add --transport http scvnote ${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp \\
  --header "Authorization: Bearer ${newToken}"`}
            </pre>
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        <form onSubmit={issueToken} className="mt-3 flex gap-2">
          <Input
            placeholder="기기 이름 (예: 집 PC, 노트북)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy} className="shrink-0">
            {busy ? "발급 중…" : "토큰 발급"}
          </Button>
        </form>
      </section>
    </div>
  );
}
