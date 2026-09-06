/**
 * Renders a markdown note body to HTML, for the public share page and the
 * editor's preview.
 *
 * An allowlist renderer rather than a markdown-to-HTML library: a body can
 * come from a direct API call (any project member, bypassing the editor UI),
 * and the share page serves the result to anonymous visitors. Every tag here
 * is chosen explicitly, every text node is escaped, and both image `src` and
 * link `href` are restricted to schemes that can't execute. Nothing else
 * gets through - markdown's own raw-HTML passthrough included, since the
 * parser never produces raw HTML nodes in the first place.
 */
import { markdownToDoc } from "@/lib/markdown";

type Node = { type?: string; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[]; attrs?: Record<string, unknown>; content?: Node[] };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/** Only our own attachment path or a plain http(s) URL - never `javascript:` etc. */
function safeImageSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  if (src.startsWith("/api/attachments/")) return src;
  if (/^https?:\/\//i.test(src)) return src;
  return null;
}

/** Same idea for links, plus mailto. Anything else renders as plain text. */
function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  return null;
}

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  code: "code",
  strike: "s",
};

function renderMarks(text: string, marks: Node["marks"]): string {
  let html = escapeHtml(text);
  for (const mark of marks ?? []) {
    const tag = MARK_TAGS[mark.type];
    if (tag) {
      html = `<${tag}>${html}</${tag}>`;
    } else if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      // rel/target because a shared note's links are followed by strangers
      if (href) html = `<a href="${escapeAttr(href)}" rel="nofollow noreferrer" target="_blank">${html}</a>`;
    }
  }
  return html;
}

function renderChildren(nodes: Node[] | undefined): string {
  return (nodes ?? []).map(renderNode).join("");
}

function renderNode(node: Node): string {
  switch (node.type) {
    case "text":
      return renderMarks(node.text ?? "", node.marks);
    case "paragraph":
      return `<p>${renderChildren(node.content)}</p>`;
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      return `<h${level}>${renderChildren(node.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderChildren(node.content)}</ul>`;
    case "orderedList":
      return `<ol>${renderChildren(node.content)}</ol>`;
    case "listItem": {
      // "- [x] 한 일" keeps its box, read-only: editing happens in the markdown
      const checked = node.attrs?.checked;
      if (typeof checked !== "boolean") return `<li>${renderChildren(node.content)}</li>`;
      return `<li class="task"><span class="box" aria-hidden="true">${
        checked ? "☑" : "☐"
      }</span>${renderChildren(node.content)}</li>`;
    }
    case "blockquote":
      return `<blockquote>${renderChildren(node.content)}</blockquote>`;
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const langClass = lang ? ` class="language-${escapeAttr(lang)}"` : "";
      return `<pre><code${langClass}>${escapeHtml(
        (node.content ?? []).map((c) => c.text ?? "").join(""),
      )}</code></pre>`;
    }
    case "image": {
      const src = safeImageSrc(node.attrs?.src);
      if (!src) return "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" />`;
    }
    case "horizontalRule":
      return "<hr />";
    case "hardBreak":
      return "<br />";
    case "doc":
      return renderChildren(node.content);
    default:
      // unknown node type: render children as plain paragraphs rather than
      // dropping the content silently or emitting an unrecognized tag
      return node.content ? renderChildren(node.content) : "";
  }
}

/** Markdown body -> HTML. Safe to insert with `dangerouslySetInnerHTML`. */
export function renderNoteHtml(markdown: string): string {
  if (!markdown) return "";
  return renderNode(markdownToDoc(markdown) as Node);
}
