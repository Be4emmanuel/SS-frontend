/**
 * Bulk data-room download (#778).
 *
 * Requests short-lived signed links for the selected documents, streams each
 * file with progress, skips documents the user cannot access, and bundles the
 * rest plus a manifest into one ZIP.
 *
 * Signed links are credentials. They are used for exactly one fetch and are
 * never logged, stored, put in progress state, results or error messages.
 */

import { API_BASE } from "@/lib/api/shared";
import { createStoredZip, type ZipEntry } from "@/lib/invoiceDocumentDownloads";

/** Default cap on the total archive size (200 MiB), held in memory. */
export const DEFAULT_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export interface BulkDocument {
  id: string;
  name: string;
  /** Size in bytes, when known up front. */
  size?: number;
}

export interface SignedLink {
  id: string;
  url: string;
  name?: string;
  size?: number;
  sha256?: string;
}

export interface SignedLinksResponse {
  links: SignedLink[];
  /** Documents the caller is not allowed to see. */
  denied?: Array<{ id: string; reason?: string }>;
}

export type SkipReason = "forbidden" | "unavailable" | "integrity";

export interface SkippedDocument {
  id: string;
  name: string;
  reason: SkipReason;
}

export type FileState =
  | "pending"
  | "downloading"
  | "done"
  | "skipped"
  | "cancelled";

export interface FileProgress {
  id: string;
  name: string;
  loaded: number;
  total: number | null;
  state: FileState;
}

export interface ManifestEntry {
  name: string;
  sha256: string;
  size: number;
}

export interface Manifest {
  invoiceNumber: string;
  generatedAt: string;
  files: ManifestEntry[];
  skipped: SkippedDocument[];
}

export type BulkDownloadStatus =
  | "complete"
  | "cancelled"
  | "too_large"
  | "failed";

export interface BulkDownloadResult {
  status: BulkDownloadStatus;
  archiveName: string;
  blob?: Blob;
  manifest?: Manifest;
  included: ManifestEntry[];
  skipped: SkippedDocument[];
  /** Human-readable explanation for non-complete outcomes. Never contains a URL. */
  message?: string;
  limitBytes?: number;
}

export interface BulkDownloadOptions {
  invoiceId: string;
  invoiceNumber: string;
  documents: BulkDocument[];
  signal?: AbortSignal;
  maxTotalBytes?: number;
  now?: Date;
  onProgress?: (files: FileProgress[]) => void;
  requestLinks?: (
    invoiceId: string,
    documentIds: string[],
    signal?: AbortSignal,
  ) => Promise<SignedLinksResponse>;
  fetcher?: typeof fetch;
  zip?: (entries: ZipEntry[]) => Promise<Blob>;
  sha256?: (data: Uint8Array) => Promise<string>;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function safeSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned || fallback;
}

/** `<invoice-number>_documents_<YYYY-MM-DD>.zip` */
export function buildArchiveName(invoiceNumber: string, date = new Date()): string {
  return `${safeSegment(invoiceNumber, "invoice")}_documents_${date
    .toISOString()
    .slice(0, 10)}.zip`;
}

/** Strip any path, keep a safe file name, and make it unique within `taken`. */
export function uniqueFileName(name: string, taken: Set<string>): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  const stem = safeSegment(dot > 0 ? base.slice(0, dot) : base, "document");
  const ext = dot > 0 ? base.slice(dot).replace(/[^a-zA-Z0-9.]/g, "") : "";
  let candidate = `${stem}${ext}`;
  let n = 2;
  while (taken.has(candidate.toLowerCase()) || candidate.toLowerCase() === "manifest.json") {
    candidate = `${stem}-${n}${ext}`;
    n += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function buildManifest(
  invoiceNumber: string,
  files: ManifestEntry[],
  skipped: SkippedDocument[],
  now = new Date(),
): Manifest {
  return { invoiceNumber, generatedAt: now.toISOString(), files, skipped };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

export function sizeLimitMessage(totalBytes: number, limitBytes: number): string {
  return (
    `The selected documents total ${formatBytes(totalBytes)}, which is over the ` +
    `${formatBytes(limitBytes)} limit for a single download. The archive is built in ` +
    `your browser's memory, so large bundles can fail. Deselect some documents and download ` +
    `them in smaller batches.`
  );
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Signed links ─────────────────────────────────────────────────────────────

/** Ask the API for signed links. The response is used in memory only. */
export async function requestSignedLinks(
  invoiceId: string,
  documentIds: string[],
  signal?: AbortSignal,
): Promise<SignedLinksResponse> {
  const response = await fetch(
    `${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/documents/signed-links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds }),
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Could not get download links (${response.status}).`);
  }
  return (await response.json()) as SignedLinksResponse;
}

/** Build the ZIP in a worker when available, else on the calling thread. */
export async function zipInWorker(entries: ZipEntry[]): Promise<Blob> {
  if (typeof Worker === "undefined") return createStoredZip(entries);
  return new Promise<Blob>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./bulkDownload.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      resolve(createStoredZip(entries));
      return;
    }
    worker.onmessage = (event: MessageEvent<{ blob?: Blob; error?: string }>) => {
      worker.terminate();
      if (event.data.blob) resolve(event.data.blob);
      else reject(new Error(event.data.error ?? "Could not build the archive."));
    };
    worker.onerror = () => {
      worker.terminate();
      // Fall back rather than fail the whole download.
      try {
        resolve(createStoredZip(entries));
      } catch (error) {
        reject(error);
      }
    };
    worker.postMessage({ entries });
  });
}

// ── Engine ───────────────────────────────────────────────────────────────────

class CancelledError extends Error {}
class TooLargeError extends Error {
  constructor(readonly totalBytes: number) {
    super("too large");
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new CancelledError("cancelled");
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof CancelledError ||
    (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError")
  );
}

export async function runBulkDownload(
  options: BulkDownloadOptions,
): Promise<BulkDownloadResult> {
  const {
    invoiceId,
    invoiceNumber,
    documents,
    signal,
    onProgress,
    maxTotalBytes = DEFAULT_MAX_TOTAL_BYTES,
    now = new Date(),
    requestLinks = requestSignedLinks,
    fetcher = fetch,
    zip = zipInWorker,
    sha256 = sha256Hex,
  } = options;

  const archiveName = buildArchiveName(invoiceNumber, now);
  const skipped: SkippedDocument[] = [];
  const included: ManifestEntry[] = [];
  const progress = new Map<string, FileProgress>(
    documents.map((d) => [
      d.id,
      { id: d.id, name: d.name, loaded: 0, total: d.size ?? null, state: "pending" },
    ]),
  );
  const emit = () => onProgress?.([...progress.values()].map((p) => ({ ...p })));
  const setState = (id: string, patch: Partial<FileProgress>) => {
    const current = progress.get(id);
    if (current) progress.set(id, { ...current, ...patch });
  };
  const skip = (doc: BulkDocument, reason: SkipReason) => {
    skipped.push({ id: doc.id, name: doc.name, reason });
    setState(doc.id, { state: "skipped" });
  };
  emit();

  try {
    throwIfAborted(signal);
    const response = await requestLinks(invoiceId, documents.map((d) => d.id), signal);
    throwIfAborted(signal);

    const links = new Map<string, SignedLink>(
      response.links.map((l): [string, SignedLink] => [l.id, l]),
    );
    const denied = new Set((response.denied ?? []).map((d) => d.id));

    const downloadable: Array<{ doc: BulkDocument; link: SignedLink }> = [];
    for (const doc of documents) {
      const link = links.get(doc.id);
      if (denied.has(doc.id)) skip(doc, "forbidden");
      else if (!link) skip(doc, "unavailable");
      else downloadable.push({ doc, link });
    }
    emit();

    // Reject up front when the declared sizes already exceed the limit.
    const declared = downloadable.reduce(
      (sum, { doc, link }) => sum + (link.size ?? doc.size ?? 0),
      0,
    );
    if (declared > maxTotalBytes) throw new TooLargeError(declared);

    const taken = new Set<string>();
    const entries: ZipEntry[] = [];
    let running = 0;

    for (const { doc, link } of downloadable) {
      throwIfAborted(signal);
      setState(doc.id, { state: "downloading", total: link.size ?? doc.size ?? null });
      emit();

      let bytes: Uint8Array;
      try {
        const res = await fetcher(link.url, { signal, credentials: "omit", cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          skip(doc, "forbidden");
          emit();
          continue;
        }
        if (!res.ok) {
          skip(doc, "unavailable");
          emit();
          continue;
        }
        const header = Number(res.headers.get("content-length"));
        const total = Number.isFinite(header) && header > 0 ? header : (link.size ?? doc.size ?? null);
        bytes = await readStream(res, signal, (loaded) => {
          if (running + loaded > maxTotalBytes) throw new TooLargeError(running + loaded);
          setState(doc.id, { loaded, total });
          emit();
        });
      } catch (error) {
        if (isAbort(error) || error instanceof TooLargeError) throw error;
        // Network failure on one file: skip it and keep going. The message is
        // deliberately not propagated, since it may embed the signed URL.
        skip(doc, "unavailable");
        emit();
        continue;
      }

      const hash = await sha256(bytes);
      if (link.sha256 && link.sha256.toLowerCase() !== hash) {
        skip(doc, "integrity");
        emit();
        continue;
      }

      running += bytes.length;
      const fileName = uniqueFileName(link.name ?? doc.name, taken);
      entries.push({ path: fileName, data: bytes });
      included.push({ name: fileName, sha256: hash, size: bytes.length });
      setState(doc.id, { state: "done", loaded: bytes.length, total: bytes.length });
      emit();
    }

    throwIfAborted(signal);
    const manifest = buildManifest(invoiceNumber, included, skipped, now);
    entries.push({
      path: "manifest.json",
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    });
    const blob = await zip(entries);
    throwIfAborted(signal);

    return { status: "complete", archiveName, blob, manifest, included, skipped };
  } catch (error) {
    if (isAbort(error)) {
      for (const p of progress.values()) {
        if (p.state === "pending" || p.state === "downloading") {
          setState(p.id, { state: "cancelled" });
        }
      }
      emit();
      return {
        status: "cancelled",
        archiveName,
        included,
        skipped,
        message: "Download cancelled. No archive was created.",
      };
    }
    if (error instanceof TooLargeError) {
      return {
        status: "too_large",
        archiveName,
        included: [],
        skipped,
        limitBytes: maxTotalBytes,
        message: sizeLimitMessage(error.totalBytes, maxTotalBytes),
      };
    }
    return {
      status: "failed",
      archiveName,
      included,
      skipped,
      // Fixed text: the underlying error can contain a signed URL.
      message: "The download could not be completed. Please try again.",
    };
  }
}

async function readStream(
  response: Response,
  signal: AbortSignal | undefined,
  onChunk: (loaded: number) => void,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const data = new Uint8Array(await response.arrayBuffer());
    throwIfAborted(signal);
    onChunk(data.length);
    return data;
  }
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    throwIfAborted(signal);
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onChunk(loaded);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Fraction 0..1 across all files, using bytes when sizes are known. */
export function overallProgress(files: FileProgress[]): number {
  if (files.length === 0) return 0;
  const knownTotal = files.every((f) => f.total && f.total > 0);
  if (knownTotal) {
    const total = files.reduce((s, f) => s + (f.total ?? 0), 0);
    const loaded = files.reduce((s, f) => {
      const done = f.state === "done" || f.state === "skipped";
      return s + (done ? (f.total ?? 0) : Math.min(f.loaded, f.total ?? 0));
    }, 0);
    return total > 0 ? Math.min(1, loaded / total) : 0;
  }
  const finished = files.filter((f) => f.state === "done" || f.state === "skipped").length;
  return finished / files.length;
}
