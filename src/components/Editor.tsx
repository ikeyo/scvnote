"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { renderNoteHtml } from "@/lib/note-render";

export type UploadResult = { url: string; originalName: string };

/** Lets the page jump the editor to a passage a todo is anchored to. */
export type EditorHandle = { selectText: (quote: string) => boolean };

/** Anchors quote at most this much, so a todo row stays readable. */
const MAX_ANCHOR = 300;

/** Selects `quote` inside the textarea and scrolls the page to it. */
function selectQuote(el: HTMLTextAreaElement, body: string, quote: string) {
  const at = body.indexOf(quote);
  if (at === -1) return;
  el.focus();
  el.setSelectionRange(at, at + quote.length);
  // the textarea is as tall as its content, so scrolling the page is what
  // actually brings the passage into view
  const ratio = at / Math.max(body.length, 1);
  window.scrollTo({ top: el.offsetTop + el.offsetHeight * ratio - 150, behavior: "smooth" });
}

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
  onSelect,
  ref,
}: {
  value: string;
  onChange: (body: string) => void;
  /** Called for pasted/dropped files; returns the URL to embed. */
  onUpload: (file: File) => Promise<UploadResult | null>;
  /** The currently selected passage, "" when nothing is selected. */
  onSelect?: (quote: string) => void;
  ref?: React.Ref<EditorHandle>;
}) {
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // set when a jump arrives while the preview is open - the textarea has to
  // exist before it can be selected, so the effect below finishes the job
  const pendingJump = useRef<string | null>(null);

  // Grow to fit the text instead of scrolling inside a fixed box - a long note
  // then scrolls with the page, and the todos and attachments below it stay
  // reachable rather than being stranded under a nested scrollbar.
  useEffect(() => {
    const el = textarea.current;
    if (!el || preview) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;

    if (pendingJump.current) {
      const quote = pendingJump.current;
      pendingJump.current = null;
      selectQuote(el, value, quote);
    }
  }, [value, preview]);

  useImperativeHandle(ref, () => ({
    selectText(quote) {
      if (!value.includes(quote)) return false;
      if (preview) {
        // leave the preview first; the effect above runs the jump after render
        pendingJump.current = quote;
        setPreview(false);
        return true;
      }
      const el = textarea.current;
      if (el) selectQuote(el, value, quote);
      return true;
    },
  }));

  /** Works the same in both modes - the textarea has its own selection API. */
  function reportSelection() {
    if (!onSelect) return;
    if (preview) {
      onSelect((window.getSelection()?.toString() ?? "").trim().slice(0, MAX_ANCHOR));
      return;
    }
    const el = textarea.current;
    if (!el) return;
    onSelect(value.slice(el.selectionStart, el.selectionEnd).trim().slice(0, MAX_ANCHOR));
  }

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
          onClick={() => {
            setPreview((p) => !p);
            onSelect?.("");
          }}
          className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface)]"
        >
          {preview ? "편집" : "미리보기"}
        </button>
        <span>본문을 선택하면 그 대목에 할 일을 달 수 있습니다. 스크린샷은 Ctrl+V.</span>
        {uploading && <span className="text-[var(--accent)]">올리는 중…</span>}
      </div>

      {preview ? (
        <div
          // renderNoteHtml is an allowlist renderer (src/lib/note-render.ts) -
          // every tag is chosen explicitly and all text is escaped, so this is
          // not raw user HTML
          className="note-body min-h-[60vh]"
          onMouseUp={reportSelection}
          onKeyUp={reportSelection}
          dangerouslySetInnerHTML={{ __html: renderNoteHtml(value) }}
        />
      ) : (
        <textarea
          ref={textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={reportSelection}
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
          className="min-h-[60vh] w-full resize-none overflow-hidden bg-transparent font-mono text-sm leading-relaxed outline-none placeholder:text-[var(--muted)]"
        />
      )}
    </div>
  );
}
