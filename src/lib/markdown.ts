/**
 * Parses markdown into a small block tree, for rendering.
 *
 * Note bodies are stored as markdown exactly as written - nothing converts them
 * on the way in or out, so a document sent from Claude Code comes back byte for
 * byte. This parser exists only for *display*: the public share page and the
 * editor's preview both turn a body into HTML through `note-render.ts`.
 *
 * Hand-written rather than pulled from a library because the output feeds an
 * allowlist renderer with a small fixed vocabulary, and because that renderer is
 * the boundary where anonymous visitors see other people's content. Markdown
 * this doesn't know (tables, footnotes) degrades to plain text rather than
 * reaching the renderer as something it can't check.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
export type Node = {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: Node[];
};

/** First non-blank line, with markdown markers stripped - the fallback title. */
export function deriveTitle(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "제목 없음";
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/[*_`~]/g, "")
    .trim()
    .slice(0, 120) || "제목 없음";
}

/* ------------------------------- markdown -> doc ------------------------------ */

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^```(\S*)\s*$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

/** One flat list entry, before nesting is rebuilt from the indent. */
type ListEntry = { indent: number; ordered: boolean; checked?: boolean; lines: string[] };

const TASK_MARK = /^\[([ xX])\]\s+(.*)$/;

export function markdownToDoc(markdown: string): { type: "doc"; content: Node[] } {
  const content = parseBlocks(markdown.replace(/\r\n?/g, "\n").split("\n"));
  // ProseMirror rejects a completely empty doc
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

function parseBlocks(lines: string[]): Node[] {
  const out: Node[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line.trim());
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      out.push({
        type: "codeBlock",
        attrs: { language: fence[1] || null },
        content: body.length > 0 ? [{ type: "text", text: body.join("\n") }] : [],
      });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      out.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (RULE.test(line.trim())) {
      out.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    const image = IMAGE_LINE.exec(line.trim());
    if (image) {
      out.push({ type: "image", attrs: { src: image[2], alt: image[1] || null } });
      i++;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && (lines[i].trimStart().startsWith(">") || lines[i].trim())) {
        if (!lines[i].trimStart().startsWith(">") && quoted.length === 0) break;
        if (!lines[i].trimStart().startsWith(">")) break;
        quoted.push(lines[i].trimStart().replace(/^>\s?/, ""));
        i++;
      }
      out.push({ type: "blockquote", content: parseBlocks(quoted) });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const { entries, next } = collectList(lines, i);
      out.push(buildList(entries, 0));
      i = next;
      continue;
    }

    // paragraph: soft-wrapped lines join into one, as in markdown
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !FENCE.test(lines[i].trim()) &&
      !RULE.test(lines[i].trim()) &&
      !LIST_ITEM.test(lines[i]) &&
      !lines[i].trimStart().startsWith(">")
    ) {
      paragraph.push(lines[i++]);
    }
    out.push({ type: "paragraph", content: parseParagraph(paragraph) });
  }

  return out;
}

/** Trailing double space means a hard break; otherwise lines join with a space. */
function parseParagraph(lines: string[]): Node[] {
  const content: Node[] = [];
  lines.forEach((line, idx) => {
    const hardBreak = /\s\s$/.test(line);
    const text = line.trim();
    content.push(...parseInline(text));
    if (idx < lines.length - 1) {
      if (hardBreak) content.push({ type: "hardBreak" });
      else content.push({ type: "text", text: " " });
    }
  });
  return content;
}

function collectList(lines: string[], start: number): { entries: ListEntry[]; next: number } {
  const entries: ListEntry[] = [];
  let baseIndent = -1;
  let baseOrdered = false;
  let i = start;

  while (i < lines.length) {
    const match = LIST_ITEM.exec(lines[i]);
    if (match) {
      const indent = match[1].length;
      const ordered = /\d/.test(match[2]);
      if (baseIndent === -1) {
        baseIndent = indent;
        baseOrdered = ordered;
      } else if (indent <= baseIndent && ordered !== baseOrdered) {
        // "- a" then "1. b" is two lists, not one - leave the rest to the caller
        break;
      }
      // "- [ ] 할 일" / "- [x] 끝난 일"
      const task = TASK_MARK.exec(match[3]);
      entries.push({
        indent,
        ordered,
        ...(task ? { checked: task[1] !== " " } : {}),
        lines: [task ? task[2] : match[3]],
      });
      i++;
      continue;
    }
    // an indented, non-item line continues the previous item
    if (lines[i].trim() && /^\s+/.test(lines[i]) && entries.length > 0) {
      entries[entries.length - 1].lines.push(lines[i].trim());
      i++;
      continue;
    }
    // a blank line only continues the list if another item follows
    if (!lines[i].trim() && i + 1 < lines.length && LIST_ITEM.test(lines[i + 1])) {
      i++;
      continue;
    }
    break;
  }

  return { entries, next: i };
}

/** Rebuilds nesting from each entry's indent. */
function buildList(entries: ListEntry[], from: number): Node {
  const baseIndent = entries[from].indent;
  const ordered = entries[from].ordered;
  const items: Node[] = [];
  let i = from;

  while (i < entries.length && entries[i].indent >= baseIndent) {
    if (entries[i].indent > baseIndent) {
      // deeper items belong to the item just added
      const nested = buildList(entries, i);
      const parent = items[items.length - 1];
      if (parent) parent.content = [...(parent.content ?? []), nested];
      while (i < entries.length && entries[i].indent > baseIndent) i++;
      continue;
    }
    items.push({
      type: "listItem",
      ...(entries[i].checked === undefined ? {} : { attrs: { checked: entries[i].checked } }),
      content: [{ type: "paragraph", content: parseParagraph(entries[i].lines) }],
    });
    i++;
  }

  return { type: ordered ? "orderedList" : "bulletList", content: items };
}

/** Inline patterns, tried at every position - the earliest match wins, ties by order. */
const INLINE_RULES: { re: RegExp; build: (m: RegExpExecArray) => Node[] }[] = [
  // a backslash makes the next punctuation literal: "\*" is an asterisk, not
  // the start of emphasis. First in the list so a tie goes to the escape.
  { re: /\\([\\`*_~[\]()#+\-.!>])/, build: (m) => [{ type: "text", text: m[1] }] },
  // code next: nothing else applies inside a code span
  { re: /`([^`\n]+)`/, build: (m) => [{ type: "text", text: m[1], marks: [{ type: "code" }] }] },
  {
    // the URL may itself contain one level of parens - "…/Foo_(bar)" and, less
    // happily, "javascript:alert(1)", which the renderer refuses by scheme
    re: /\[([^\]]+)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)\)/,
    build: (m) => withMark(parseInline(m[1]), { type: "link", attrs: { href: m[2] } }),
  },
  // Emphasis never opens on whitespace and never closes on it, so "2 * 3 * 4"
  // and "rm -rf *" stay literal. The bold patterns are lazy and allow inner
  // markers, so "**굵은 데 *기울임* 도**" keeps its nested emphasis.
  { re: /\*\*(?!\s)([\s\S]+?)\*\*/, build: (m) => withMark(parseInline(m[1]), { type: "bold" }) },
  { re: /__(?!\s)([\s\S]+?)__/, build: (m) => withMark(parseInline(m[1]), { type: "bold" }) },
  { re: /~~(?!\s)([^~]*[^\s~])~~/, build: (m) => withMark(parseInline(m[1]), { type: "strike" }) },
  { re: /\*(?!\s)([^*\n]*[^\s*])\*/, build: (m) => withMark(parseInline(m[1]), { type: "italic" }) },
  {
    re: /(?<!\w)_(?!\s)([^_\n]*[^\s_])_(?!\w)/,
    build: (m) => withMark(parseInline(m[1]), { type: "italic" }),
  },
];

function withMark(nodes: Node[], mark: Mark): Node[] {
  return nodes.map((node) =>
    node.type === "text" ? { ...node, marks: [...(node.marks ?? []), mark] } : node,
  );
}

function parseInline(text: string): Node[] {
  if (!text) return [];
  const out: Node[] = [];
  let rest = text;

  while (rest) {
    let best: { index: number; length: number; nodes: Node[] } | null = null;
    for (const rule of INLINE_RULES) {
      const match = rule.re.exec(rest);
      if (match && (best === null || match.index < best.index)) {
        best = { index: match.index, length: match[0].length, nodes: rule.build(match) };
      }
    }
    if (!best) break;

    if (best.index > 0) out.push({ type: "text", text: rest.slice(0, best.index) });
    out.push(...best.nodes);
    rest = rest.slice(best.index + best.length);
  }

  if (rest) out.push({ type: "text", text: rest });
  return out;
}
