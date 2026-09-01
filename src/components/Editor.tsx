"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";

const lowlight = createLowlight(common);

export type UploadResult = { url: string; originalName: string };

export function Editor({
  content,
  onChange,
  onUpload,
}: {
  content: unknown;
  onChange: (doc: unknown) => void;
  /** Called for pasted/dropped files; returns the URL to embed. */
  onUpload: (file: File) => Promise<UploadResult | null>;
}) {
  const editor = useEditor({
    // rendering on the server would mismatch the client's first paint
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
      Image.configure({ inline: false }),
      Placeholder.configure({
        placeholder: "여기에 작성하세요. 스크린샷은 Ctrl+V로 붙여넣습니다.",
      }),
    ],
    content: (content ?? { type: "doc", content: [{ type: "paragraph" }] }) as never,
    editorProps: {
      attributes: { class: "max-w-none" },
      handlePaste(view, event) {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
      handleDrop(view, event) {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  async function insertFiles(files: File[]) {
    for (const file of files) {
      const result = await onUpload(file);
      if (!result || !editor) continue;
      if (file.type.startsWith("image/")) {
        editor.chain().focus().setImage({ src: result.url, alt: result.originalName }).run();
      } else {
        // non-images become a link line rather than a broken <img>
        editor
          .chain()
          .focus()
          .insertContent(`<p><a href="${result.url}">📎 ${result.originalName}</a></p>`)
          .run();
      }
    }
  }

  // keep the document in sync when the parent swaps to a different note
  useEffect(() => {
    if (!editor || !content) return;
    const current = JSON.stringify(editor.getJSON());
    if (current !== JSON.stringify(content)) {
      editor.commands.setContent(content as never, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return <div className="h-96" />;

  return (
    <div className="mt-4">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="mt-3" />
    </div>
  );
}

function Toolbar({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
  const items = [
    { label: "H1", run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive("heading", { level: 1 }) },
    { label: "H2", run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive("heading", { level: 2 }) },
    { label: "B", run: () => editor.chain().focus().toggleBold().run(), active: editor.isActive("bold") },
    { label: "I", run: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive("italic") },
    { label: "목록", run: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive("bulletList") },
    { label: "번호", run: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive("orderedList") },
    { label: "인용", run: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive("blockquote") },
    { label: "코드", run: () => editor.chain().focus().toggleCode().run(), active: editor.isActive("code") },
    { label: "코드블록", run: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive("codeBlock") },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.run}
          className={`rounded px-2 py-1 text-xs transition ${
            item.active
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:bg-[var(--surface)]"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
