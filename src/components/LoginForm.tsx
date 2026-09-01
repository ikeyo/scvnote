"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Input } from "@/components/ui";

export function LoginForm({ setup }: { setup: boolean }) {
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
      const res = await fetch(setup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "로그인에 실패했습니다");
      router.replace("/notes");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">ScvNote</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {setup
          ? "첫 계정을 만듭니다. 이후 새 계정은 관리자의 초대 링크로만 늘어납니다."
          : "로그인"}
      </p>

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
          placeholder={setup ? "비밀번호 (8자 이상)" : "비밀번호"}
          autoComplete={setup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? "처리 중…" : setup ? "계정 만들기" : "로그인"}
        </Button>
      </form>
    </main>
  );
}
