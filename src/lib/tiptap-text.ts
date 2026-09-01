/**
 * Flattens a ProseMirror/TipTap document to plain text.
 *
 * The result is stored in `Note.contentText` so Postgres can search it with a
 * trigram index - searching inside the JSON document directly would not use one.
 */
export function docToText(doc: unknown): string {
  const parts: string[] = [];

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") parts.push(n.text);
    if (Array.isArray(n.content)) {
      n.content.forEach(walk);
      // keep block boundaries from gluing words together
      if (n.type && n.type !== "text") parts.push("\n");
    }
  };

  walk(doc);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** First non-empty line, used as a fallback title for untitled notes. */
export function deriveTitle(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line ? line.slice(0, 120) : "제목 없음";
}
