"use client";

import { useRef, useState } from "react";
import { renderNoteHtml } from "@/lib/note-render";

export type UploadResult = { url: string; originalName: string };

/**
 * Markdown editor. The body is stored as markdown exactly as typed, so this is
 * a plain textarea rather than a WYSIWYG surface - what you see here is what
 * MCP sends and receives.
 *
 * Pasting or dropping an image still uploads it and drops an `![](...)` link
 * in at the cursor, which is the part of the old editor worth keeping.
 */
export function Editor({
  value,
  onChange,
  onUpload,
}: {
  value: string;
  onChange: (body: string) => void;
  /** Called for pasted/dropped files; returns the URL to embed. */
  onUpload: (file: File) => Promise<UploadResult | null>;
}) {
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(snippet: string) {
    const el = textarea.current;
    if (!el) return onChange(value + snippet);

    const { selectionStart: start, selectionEnd: end } = el;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    // put the caret after what we just inserted, once React has re-rendered
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + snippet.length;
    });
  }

  async function insertFiles(files: File[]) {
    setUploading(true);
    for (const file of files) {
      const result = await onUpload(file);
      if (!result) continue;
      const isImage = file.type.startsWith("image/");
      insertAtCursor(`\n${isImage ? "!" : ""}[${result.originalName}](${result.url})\n`);
    }
    setUploading(false);
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-3 text-xs text-[var(--muted)]">
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface)]"
        >
          {preview ? "편집" : "미리보기"}
        </button>
        <span>마크다운으로 저장됩니다. 스크린샷은 Ctrl+V로 붙여넣습니다.</span>
        {uploading && <span className="text-[var(--accent)]">올리는 중…</span>}
      </div>

      {preview ? (
        <div
          // renderNoteHtml is an allowlist renderer (src/lib/note-render.ts) -
          // every tag is chosen explicitly and all text is escaped, so this is
          // not raw user HTML
          className="note-body min-h-[24rem]"
          dangerouslySetInnerHTML={{ __html: renderNoteHtml(value) }}
        />
      ) : (
        <textarea
          ref={textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length === 0) return;
            e.preventDefault();
            void insertFiles(files);
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length === 0) return;
            e.preventDefault();
            void insertFiles(files);
          }}
          placeholder="여기에 마크다운으로 작성하세요. 스크린샷은 Ctrl+V로 붙여넣습니다."
          spellCheck={false}
          className="min-h-[24rem] w-full resize-y bg-transparent font-mono text-sm leading-relaxed outline-none placeholder:text-[var(--muted)]"
        />
      )}
    </div>
  );
}
