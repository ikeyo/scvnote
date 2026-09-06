"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ErrorText, Input, Spinner } from "@/components/ui";
import type { TagSummary } from "@/lib/types";

export function TagManager() {
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [unusedCount, setUnusedCount] = useState(0);
  const [showUnused, setShowUnused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const url = `/api/tags${showUnused ? "?unused=1" : ""}`;

  const load = useCallback(async () => {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    setTags(data.tags);
    setUnusedCount(data.unusedCount);
    setLoading(false);
  }, [url]);

  useEffect(() => {
    // promise-chain form: setState lands in a callback, not in the effect body
    void fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setTags(d.tags);
        setUnusedCount(d.unusedCount);
        setLoading(false);
      });
  }, [url]);

  async function rename(tag: TagSummary, name: string) {
    setError("");
    let res = await fetch(`/api/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    // 409 means the target name exists - merging is destructive, so ask first
    if (res.status === 409) {
      const ok = confirm(
        `"${name}" 태그가 이미 있습니다.\n\n"${tag.name}"이 붙은 노트 ${tag._count.notes}건을 "${name}"으로 옮기고 "${tag.name}"을 지울까요?`,
      );
      if (!ok) return;
      res = await fetch(`/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, merge: true }),
      });
    }

    if (!res.ok) setError((await res.json()).error ?? "수정에 실패했습니다");
    setEditingId(null);
    await load();
  }

  async function remove(tag: TagSummary) {
    const warning =
      tag._count.notes > 0
        ? `노트 ${tag._count.notes}건에서 이 태그가 떨어집니다. 노트 자체는 지워지지 않습니다.\n\n`
        : "";
    if (!confirm(`${warning}"${tag.name}" 태그를 삭제할까요?`)) return;

    const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "삭제에 실패했습니다");
    await load();
  }

  async function sweepUnused() {
    if (!confirm(`어떤 노트에도 붙어 있지 않은 태그 ${unusedCount}개를 지울까요?`)) return;
    const res = await fetch("/api/tags", { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "정리에 실패했습니다");
    await load();
  }

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">태그</h1>
        {unusedCount > 0 && <Button onClick={sweepUnused}>미사용 {unusedCount}개 정리</Button>}
      </div>
      <p className="mt-1 text-sm text-[var(--muted)]">
        이름을 바꾸면 그 태그가 붙은 노트 전체에 반영됩니다. 이미 있는 이름으로 바꾸면 두 태그를
        합칠지 물어봅니다.
      </p>

      <ErrorText>{error}</ErrorText>

      <label className="mt-6 flex items-center gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={showUnused}
          onChange={(e) => setShowUnused(e.target.checked)}
        />
        노트에 붙어 있지 않은 태그도 보기
      </label>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : tags.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted)]">아직 태그가 없습니다</p>
      ) : (
        <ul className="mt-2 divide-y divide-[var(--border)]">
          {tags.map((tag) =>
            editingId === tag.id ? (
              <li key={tag.id} className="py-3">
                <TagEditForm
                  tag={tag}
                  onCancel={() => setEditingId(null)}
                  onSave={(name) => rename(tag, name)}
                />
              </li>
            ) : (
              <li key={tag.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/notes?tag=${encodeURIComponent(tag.name)}`}
                    className="font-medium hover:underline"
                  >
                    #{tag.name}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">
                    {tag._count.notes > 0 ? `노트 ${tag._count.notes}` : "사용 중인 노트 없음"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button onClick={() => setEditingId(tag.id)}>수정</Button>
                  <Button variant="danger" onClick={() => remove(tag)}>
                    삭제
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function TagEditForm({
  tag,
  onCancel,
  onSave,
}: {
  tag: TagSummary;
  onCancel: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(tag.name);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave(name);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      <Button type="button" onClick={onCancel}>
        취소
      </Button>
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "저장 중…" : "저장"}
      </Button>
    </form>
  );
}
