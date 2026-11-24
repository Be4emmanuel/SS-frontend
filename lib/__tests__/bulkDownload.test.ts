import { describe, expect, it, vi } from "vitest";
import {
  buildArchiveName,
  overallProgress,
  runBulkDownload,
  uniqueFileName,
  type BulkDocument,
  type FileProgress,
  type SignedLinksResponse,
} from "../bulkDownload";
import type { ZipEntry } from "../invoiceDocumentDownloads";

const SECRET_URL = "https://files.example.com/o/abc?X-Signature=TOPSECRET";
const NOW = new Date("2026-03-04T10:00:00Z");

const DOCS: BulkDocument[] = [
  { id: "d1", name: "invoice.pdf" },
  { id: "d2", name: "contract.pdf" },
  { id: "d3", name: "kyc.pdf" },
];

function body(text: string, status = 200): Response {
  return new Response(text, { status, headers: { "content-length": String(text.length) } });
}

function setup(
  links: SignedLinksResponse,
  files: Record<string, Response | (() => Response)> = {},
) {
  const zip = vi.fn(async (entries: ZipEntry[]) => new Blob([String(entries.length)]));
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const key = String(url);
    const hit = files[key];
    return typeof hit === "function" ? hit() : (hit ?? body("data-" + key.slice(-2)));
  }) as unknown as typeof fetch;
  return {
    zip,
    fetcher,
    base: {
      invoiceId: "inv-1",
      invoiceNumber: "INV-2026/001",
      documents: DOCS,
      now: NOW,
      requestLinks: vi.fn(async () => links),
      fetcher,
      zip,
      sha256: async (d: Uint8Array) => `hash-${d.length}`,
    },
  };
}

describe("buildArchiveName / uniqueFileName", () => {
  it("uses the invoice number and the date", () => {
    expect(buildArchiveName("INV-2026/001", NOW)).toBe("INV-2026-001_documents_2026-03-04.zip");
  });
  it("sanitises and de-duplicates entry names, reserving manifest.json", () => {
    const taken = new Set<string>();
    expect(uniqueFileName("../../etc/passwd", taken)).toBe("passwd");
    expect(uniqueFileName("a.pdf", taken)).toBe("a.pdf");
    expect(uniqueFileName("a.pdf", taken)).toBe("a-2.pdf");
    expect(uniqueFileName("manifest.json", taken)).toBe("manifest-2.json");
  });
});

describe("runBulkDownload — bundling", () => {
  it("bundles the selected documents with a manifest of names and hashes", async () => {
    const { base, zip } = setup({
      links: DOCS.map((d) => ({ id: d.id, url: `https://x/${d.id}`, name: d.name })),
    });
    const result = await runBulkDownload(base);

    expect(result.status).toBe("complete");
    expect(result.archiveName).toBe("INV-2026-001_documents_2026-03-04.zip");
    const entries = zip.mock.calls[0][0] as ZipEntry[];
    expect(entries.map((e) => e.path)).toEqual([
      "invoice.pdf",
      "contract.pdf",
      "kyc.pdf",
      "manifest.json",
    ]);
    const manifest = JSON.parse(new TextDecoder().decode(entries[3].data));
    expect(manifest.invoiceNumber).toBe("INV-2026/001");
    expect(manifest.files).toHaveLength(3);
    expect(manifest.files[0]).toMatchObject({ name: "invoice.pdf", sha256: expect.stringMatching(/^hash-/) });
  });
});

describe("runBulkDownload — skipping", () => {
  it("skips denied and missing documents and reports them", async () => {
    const { base, zip } = setup({
      links: [{ id: "d1", url: "https://x/d1" }],
      denied: [{ id: "d2", reason: "no access" }],
    });
    const result = await runBulkDownload(base);

    expect(result.status).toBe("complete");
    expect(result.included.map((f) => f.name)).toEqual(["invoice.pdf"]);
    expect(result.skipped).toEqual([
      { id: "d2", name: "contract.pdf", reason: "forbidden" },
      { id: "d3", name: "kyc.pdf", reason: "unavailable" },
    ]);
    const manifest = result.manifest!;
    expect(manifest.skipped).toHaveLength(2);
    expect((zip.mock.calls[0][0] as ZipEntry[]).length).toBe(2);
  });

  it("skips a file whose link answers 403 and keeps going", async () => {
    const { base } = setup(
      { links: DOCS.map((d) => ({ id: d.id, url: `https://x/${d.id}` })) },
      { "https://x/d2": body("no", 403) },
    );
    const result = await runBulkDownload(base);
    expect(result.included).toHaveLength(2);
    expect(result.skipped).toEqual([{ id: "d2", name: "contract.pdf", reason: "forbidden" }]);
  });

  it("skips a file that fails its integrity hash", async () => {
    const { base } = setup({
      links: [{ id: "d1", url: "https://x/d1", sha256: "not-the-hash" }],
    });
    const result = await runBulkDownload({ ...base, documents: [DOCS[0]] });
    expect(result.skipped[0].reason).toBe("integrity");
    expect(result.included).toHaveLength(0);
  });
});

describe("runBulkDownload — progress and cancel", () => {
  it("reports per-file progress through to done", async () => {
    const { base } = setup({
      links: DOCS.map((d) => ({ id: d.id, url: `https://x/${d.id}` })),
    });
    const snapshots: FileProgress[][] = [];
    await runBulkDownload({ ...base, onProgress: (f) => snapshots.push(f) });

    const states = snapshots.map((s) => s.map((f) => f.state).join(","));
    expect(states[0]).toBe("pending,pending,pending");
    expect(states).toContain("downloading,pending,pending");
    expect(states[states.length - 1]).toBe("done,done,done");
  });

  it("cancel stops the download, creates no archive and marks files cancelled", async () => {
    const controller = new AbortController();
    const { base, zip } = setup(
      { links: DOCS.map((d) => ({ id: d.id, url: `https://x/${d.id}` })) },
      {
        "https://x/d1": () => {
          controller.abort(); // user clicks Cancel while the first file is in flight
          return body("one");
        },
      },
    );
    const last: FileProgress[][] = [];
    const result = await runBulkDownload({
      ...base,
      signal: controller.signal,
      onProgress: (f) => last.push(f),
    });

    expect(result.status).toBe("cancelled");
    expect(result.blob).toBeUndefined();
    expect(zip).not.toHaveBeenCalled();
    expect(base.fetcher).toHaveBeenCalledTimes(1); // d2 / d3 never requested
    expect(last[last.length - 1].map((f) => f.state)).toEqual([
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
  });
});

describe("runBulkDownload — size limit", () => {
  it("refuses up front with a clear message when declared sizes exceed the limit", async () => {
    const { base, fetcher } = setup({
      links: [
        { id: "d1", url: "https://x/d1", size: 600 },
        { id: "d2", url: "https://x/d2", size: 600 },
      ],
    });
    const result = await runBulkDownload({ ...base, documents: DOCS.slice(0, 2), maxTotalBytes: 1000 });
    expect(result.status).toBe("too_large");
    expect(result.message).toMatch(/over the .* limit/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops mid-stream when the running total passes the limit", async () => {
    const { base } = setup(
      { links: [{ id: "d1", url: "https://x/d1" }] },
      { "https://x/d1": body("x".repeat(50)) },
    );
    const result = await runBulkDownload({ ...base, documents: [DOCS[0]], maxTotalBytes: 10 });
    expect(result.status).toBe("too_large");
  });
});

describe("runBulkDownload — signed links are never exposed", () => {
  it("keeps URLs out of progress, results and error text", async () => {
    const seen: unknown[] = [];
    const { base } = setup(
      { links: [{ id: "d1", url: SECRET_URL }] },
      {
        [SECRET_URL]: () => {
          throw new Error(`network error fetching ${SECRET_URL}`);
        },
      },
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runBulkDownload({
      ...base,
      documents: [DOCS[0]],
      onProgress: (f) => seen.push(f),
    });
    const everything = JSON.stringify([seen, { ...result, blob: undefined }]);
    expect(everything).not.toContain("TOPSECRET");
    expect(everything).not.toContain("X-Signature");
    expect(log).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
    log.mockRestore();
    err.mockRestore();
  });

  it("uses a fixed message when the link request fails", async () => {
    const { base } = setup({ links: [] });
    const result = await runBulkDownload({
      ...base,
      requestLinks: async () => {
        throw new Error(`boom ${SECRET_URL}`);
      },
    });
    expect(result.status).toBe("failed");
    expect(result.message).not.toContain("TOPSECRET");
  });
});

describe("overallProgress", () => {
  const f = (state: FileProgress["state"], loaded: number, total: number | null): FileProgress => ({
    id: String(loaded),
    name: "x",
    state,
    loaded,
    total,
  });
  it("weights by bytes when sizes are known", () => {
    expect(overallProgress([f("done", 100, 100), f("downloading", 50, 300)])).toBeCloseTo(150 / 400);
  });
  it("falls back to file counts when a size is unknown", () => {
    expect(overallProgress([f("done", 1, 1), f("pending", 0, null)])).toBe(0.5);
  });
});
