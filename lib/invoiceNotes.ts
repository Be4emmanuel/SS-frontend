/**
 * Private investor notes and tags on invoices (#777).
 *
 * Notes and tags are private to the investor who wrote them. They are only
 * ever read through the authenticated `/invoices/:id/notes` and
 * `/me/invoice-notes` endpoints and are never merged into the invoice object,
 * so they cannot leak into share links, meta tags or public pages.
 */

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;
export const MAX_NOTE_LENGTH = 10_000;

export interface InvoiceNote {
  invoiceId: string;
  body: string;
  tags: string[];
  /** Monotonic server version used for conflict detection. */
  version: number;
  updatedAt: string | null;
}

export interface NoteIndexEntry {
  invoiceId: string;
  hasNote: boolean;
  tags: string[];
}

export type NoteIndex = Record<string, NoteIndexEntry>;

export const EMPTY_NOTE = (invoiceId: string): InvoiceNote => ({
  invoiceId,
  body: "",
  tags: [],
  version: 0,
  updatedAt: null,
});

/** Lower-case, trimmed, single-spaced, length-capped; "" when nothing is left. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

export type AddTagResult =
  | { ok: true; tags: string[] }
  | { ok: false; reason: "empty" | "duplicate" | "limit"; tags: string[] };

export function addTag(tags: string[], raw: string): AddTagResult {
  const tag = normalizeTag(raw);
  if (!tag) return { ok: false, reason: "empty", tags };
  if (tags.includes(tag)) return { ok: false, reason: "duplicate", tags };
  if (tags.length >= MAX_TAGS) return { ok: false, reason: "limit", tags };
  return { ok: true, tags: [...tags, tag] };
}

export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}

/** Every distinct tag the user has used, most frequent first. */
export function collectTags(index: NoteIndex): string[] {
  const counts = new Map<string, number>();
  for (const entry of Object.values(index)) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag);
}

/**
 * Autocomplete from the user's own tags: prefix matches first, then
 * substring matches, never ones already applied.
 */
export function suggestTags(
  allTags: string[],
  query: string,
  applied: string[],
  limit = 6,
): string[] {
  const q = normalizeTag(query);
  const pool = allTags.filter((t) => !applied.includes(t));
  if (!q) return pool.slice(0, limit);
  const starts = pool.filter((t) => t.startsWith(q));
  const contains = pool.filter((t) => !t.startsWith(q) && t.includes(q));
  return [...starts, ...contains].slice(0, limit);
}

/**
 * Keep only invoices carrying every selected tag. No tags selected means no
 * filtering. Invoices the user has not tagged never match a tag filter.
 */
export function filterByTags<T extends { id: string }>(
  invoices: T[],
  index: NoteIndex,
  selected: string[],
): T[] {
  if (selected.length === 0) return invoices;
  return invoices.filter((invoice) => {
    const tags = index[invoice.id]?.tags ?? [];
    return selected.every((tag) => tags.includes(tag));
  });
}

export function hasNote(index: NoteIndex, invoiceId: string): boolean {
  return Boolean(index[invoiceId]?.hasNote);
}

// ── Markdown-lite ────────────────────────────────────────────────────────────

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

export type BlockNode =
  | { type: "paragraph"; inline: InlineNode[] }
  | { type: "list"; items: InlineNode[][] }
  | { type: "heading"; inline: InlineNode[] };

/** **bold**, *italic* and `code`. Everything else is literal text. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: "text", text: text.slice(last, index) });
    const token = match[0];
    if (token.startsWith("**")) nodes.push({ type: "bold", text: token.slice(2, -2) });
    else if (token.startsWith("`")) nodes.push({ type: "code", text: token.slice(1, -1) });
    else nodes.push({ type: "italic", text: token.slice(1, -1) });
    last = index + token.length;
  }
  if (last < text.length) nodes.push({ type: "text", text: text.slice(last) });
  return nodes;
}

/**
 * Parses a tiny markdown subset into a structure React renders as elements,
 * so user text is never injected as HTML.
 */
export function parseMarkdownLite(source: string): BlockNode[] {
  const blocks: BlockNode[] = [];
  let list: InlineNode[][] | null = null;
  for (const line of source.split(/\r?\n/)) {
    const item = line.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      list ??= [];
      list.push(parseInline(item[1]));
      continue;
    }
    if (list) {
      blocks.push({ type: "list", items: list });
      list = null;
    }
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    blocks.push(
      heading
        ? { type: "heading", inline: parseInline(heading[1]) }
        : { type: "paragraph", inline: parseInline(line) },
    );
  }
  if (list) blocks.push({ type: "list", items: list });
  return blocks;
}
