"use client";

import { useEffect, useState } from "react";
import { Button, ErrorText } from "@/components/ui";
import type { SessionInfo } from "@/lib/types";

export function SettingsView() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [issued, setIssued] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSession(d));
    void fetch("/api/mcp-token")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setIssued(d.issued));
  }, []);

  async function issueToken() {
    if (issued && !confirm("새로 발급하면 기존 토큰(등록해둔 Claude Code/Codex 연결)은 즉시 끊깁니다. 계속할까요?")) {
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/mcp-token", { method: "POST" });
    if (res.ok) {
      const { token } = await res.json();
      setNewToken(token);
      setIssued(true);
    } else {
      setError((await res.json()).error ?? "발급에 실패했습니다");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-bold">설정</h1>
      {session?.email && <p className="mt-1 text-sm text-[var(--muted)]">{session.email}</p>}

      <section className="mt-8 rounded-lg border border-[var(--border)] p-4">
        <h2 className="text-sm font-medium">MCP 토큰</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Claude Code · Codex 등 MCP 클라이언트를 이 계정으로 연결할 때 쓴다. 이 토큰으로 접근하는
          모든 내용은 이 계정이 볼 수 있는 것으로 한정된다 - 다른 사용자의 비공개 항목은 절대 보이지
          않는다.
        </p>

        <p className="mt-3 text-sm">
          현재 상태:{" "}
          {issued ? (
            <span className="text-[var(--accent)]">발급됨</span>
          ) : (
            <span className="text-[var(--muted)]">발급된 토큰 없음</span>
          )}
        </p>

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

        <Button variant="primary" onClick={issueToken} disabled={busy} className="mt-3">
          {busy ? "발급 중…" : issued ? "새로 발급 (기존 토큰 무효화)" : "토큰 발급"}
        </Button>
      </section>
    </div>
  );
}
