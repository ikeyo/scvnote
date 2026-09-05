"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Input } from "@/components/ui";

export function InviteAcceptForm({ token, invitedBy }: { token: string; invitedBy: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "가입에 실패했습니다");
      router.replace("/notes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">ScvNote 초대</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{invitedBy}님이 초대했습니다. 계정을 만드세요.</p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <Input
          type="email"
          placeholder="이메일"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="비밀번호"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? "처리 중…" : "계정 만들기"}
        </Button>
      </form>
    </main>
  );
}
