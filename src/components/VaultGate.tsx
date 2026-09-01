"use client";

import { useState } from "react";
import { Button, ErrorText, Input } from "@/components/ui";
import { initVault, unlockVault } from "@/lib/crypto-client";

type VaultMeta = {
  initialized: boolean;
  salt: string | null;
  checkCipher: string | null;
  checkIv: string | null;
};

/** Collects the master password and hands back the derived key (memory only). */
export function VaultGate({
  meta,
  onUnlocked,
}: {
  meta: VaultMeta;
  onUnlocked: (key: CryptoKey) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!meta.initialized) {
        if (password.length < 10) throw new Error("마스터 패스워드는 10자 이상이어야 합니다");
        if (password !== confirm) throw new Error("두 입력이 일치하지 않습니다");

        const { salt, checkCipher, checkIv, key } = await initVault(password);
        const res = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ salt, checkCipher, checkIv }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "설정에 실패했습니다");
        onUnlocked(key);
        return;
      }

      const key = await unlockVault(password, meta.salt!, meta.checkCipher!, meta.checkIv!);
      if (!key) throw new Error("마스터 패스워드가 올바르지 않습니다");
      onUnlocked(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-24 max-w-sm space-y-3">
      <h1 className="text-xl font-bold">
        {meta.initialized ? "보관함 잠금 해제" : "마스터 패스워드 설정"}
      </h1>
      <p className="text-sm text-[var(--muted)]">
        {meta.initialized
          ? "이 비밀번호는 서버로 전송되지 않습니다. 탭을 닫으면 다시 입력해야 합니다."
          : "이 비밀번호를 잊으면 저장된 비밀번호를 영구히 열 수 없습니다. 복구 수단은 없습니다."}
      </p>

      <Input
        type="password"
        autoComplete="off"
        placeholder="마스터 패스워드"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {!meta.initialized && (
        <Input
          type="password"
          autoComplete="off"
          placeholder="다시 입력"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      )}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? "처리 중…" : meta.initialized ? "잠금 해제" : "설정하기"}
      </Button>
    </form>
  );
}
