import { describe, expect, it } from "vitest";
import {
  MAX_TAGS,
  addTag,
  collectTags,
  filterByTags,
  hasNote,
  normalizeTag,
  parseMarkdownLite,
  suggestTags,
  type NoteIndex,
} from "../invoiceNotes";

const INDEX: NoteIndex = {
  a: { invoiceId: "a", hasNote: true, tags: ["energy", "q3"] },
  b: { invoiceId: "b", hasNote: false, tags: ["energy"] },
  c: { invoiceId: "c", hasNote: true, tags: ["retail"] },
};

describe("tags", () => {
  it("normalises tags", () => {
    expect(normalizeTag("  Big   Risk! ")).toBe("big risk");
    expect(normalizeTag("!!!")).toBe("");
  });

  it("allows up to 10 tags and rejects the 11th, empties and duplicates", () => {
    let tags: string[] = [];
    for (let i = 0; i < MAX_TAGS; i++) {
      const r = addTag(tags, `tag${i}`);
      expect(r.ok).toBe(true);
      tags = r.tags;
    }
    expect(tags).toHaveLength(10);
    expect(addTag(tags, "one-more")).toMatchObject({ ok: false, reason: "limit" });
    expect(addTag(["a"], "A")).toMatchObject({ ok: false, reason: "duplicate" });
    expect(addTag([], "   ")).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("autocomplete from the user's existing tags", () => {
  it("collects tags most-used first", () => {
    expect(collectTags(INDEX)).toEqual(["energy", "q3", "retail"]);
  });

  it("suggests prefix matches before substring matches and skips applied tags", () => {
    const all = ["energy", "green energy", "retail", "q3"];
    expect(suggestTags(all, "en", [])).toEqual(["energy", "green energy"]);
    expect(suggestTags(all, "en", ["energy"])).toEqual(["green energy"]);
    expect(suggestTags(all, "zzz", [])).toEqual([]);
  });
});

describe("filtering by tag", () => {
  const invoices = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "untagged" }];

  it("shows only matching invoices", () => {
    expect(filterByTags(invoices, INDEX, ["energy"]).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("requires every selected tag", () => {
    expect(filterByTags(invoices, INDEX, ["energy", "q3"]).map((i) => i.id)).toEqual(["a"]);
  });

  it("never matches untagged invoices, and no tags means no filtering", () => {
    expect(filterByTags(invoices, INDEX, ["retail"]).map((i) => i.id)).toEqual(["c"]);
    expect(filterByTags(invoices, INDEX, [])).toBe(invoices);
  });
});

describe("note indicator source", () => {
  it("reports which invoices have notes", () => {
    expect(hasNote(INDEX, "a")).toBe(true);
    expect(hasNote(INDEX, "b")).toBe(false);
    expect(hasNote(INDEX, "missing")).toBe(false);
  });
});

describe("markdown-lite", () => {
  it("parses inline emphasis, headings and lists, and leaves HTML as literal text", () => {
    const blocks = parseMarkdownLite("# Title\n**bold** and *it*\n- one\n- two\n<script>x</script>");
    expect(blocks[0]).toMatchObject({ type: "heading" });
    expect(blocks[1]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "bold" }, { type: "text" }, { type: "italic" }],
    });
    expect(blocks[2]).toMatchObject({ type: "list" });
    expect((blocks[2] as { items: unknown[] }).items).toHaveLength(2);
    expect(blocks[3]).toMatchObject({
      type: "paragraph",
      inline: [{ type: "text", text: "<script>x</script>" }],
    });
  });
});
