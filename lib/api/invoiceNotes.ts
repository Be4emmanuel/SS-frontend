/**
 * Private notes and tags API client (#777).
 *
 *   GET /invoices/:id/notes       -> { body, tags, version, updated_at }   (404 = no note yet)
 *   PUT /invoices/:id/notes       { body, tags, base_version }
 *                                 -> 200 note | 409 { current: note } when base_version is stale
 *   GET /me/invoice-notes         -> { items: [{ invoice_id, has_note, tags }] }
 *
 * All three are authenticated and scoped to the caller; nothing here is ever
 * requested for another user's notes.
 */

import {
  EMPTY_NOTE,
  type InvoiceNote,
  type NoteIndex,
} from "@/lib/invoiceNotes";
import { API_BASE, ApiError, isNotFound, readApiJson } from "./shared";

function toNote(invoiceId: string, raw: unknown): InvoiceNote {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    invoiceId,
    body: typeof value.body === "string" ? value.body : "",
    tags: Array.isArray(value.tags)
      ? value.tags.filter((t): t is string => typeof t === "string")
      : [],
    version: typeof value.version === "number" ? value.version : 0,
    updatedAt:
      typeof value.updated_at === "string"
        ? value.updated_at
        : typeof value.updatedAt === "string"
          ? value.updatedAt
          : null,
  };
}

export class NoteConflictError extends Error {
  constructor(readonly current: InvoiceNote) {
    super("The note was changed elsewhere.");
    this.name = "NoteConflictError";
  }
}

const url = (invoiceId: string) =>
  `${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/notes`;

export async function fetchInvoiceNote(invoiceId: string): Promise<InvoiceNote> {
  const res = await fetch(url(invoiceId), { credentials: "include", cache: "no-store" });
  if (res.status === 404) return EMPTY_NOTE(invoiceId);
  if (!res.ok) throw new ApiError(res.status, "Failed to load notes");
  return toNote(invoiceId, await readApiJson<unknown>(res));
}

export async function saveInvoiceNote(
  invoiceId: string,
  input: { body: string; tags: string[]; baseVersion: number },
): Promise<InvoiceNote> {
  const res = await fetch(url(invoiceId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      body: input.body,
      tags: input.tags,
      base_version: input.baseVersion,
    }),
  });
  if (res.status === 409) {
    const payload = await readApiJson<{ current?: unknown }>(res);
    throw new NoteConflictError(toNote(invoiceId, payload.current));
  }
  if (!res.ok) throw new ApiError(res.status, "Failed to save notes");
  return toNote(invoiceId, await readApiJson<unknown>(res));
}

export async function fetchNoteIndex(): Promise<NoteIndex> {
  try {
    const res = await fetch(`${API_BASE}/me/invoice-notes`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) throw new ApiError(res.status, "Failed to load note index");
    const payload = await readApiJson<{ items?: unknown[] }>(res);
    const index: NoteIndex = {};
    for (const raw of payload.items ?? []) {
      const item = raw as Record<string, unknown>;
      const id = item.invoice_id ?? item.invoiceId;
      if (typeof id !== "string") continue;
      index[id] = {
        invoiceId: id,
        hasNote: Boolean(item.has_note ?? item.hasNote),
        tags: Array.isArray(item.tags)
          ? item.tags.filter((t): t is string => typeof t === "string")
          : [],
      };
    }
    return index;
  } catch (error) {
    // Unauthenticated or endpoint missing: behave as "no notes", not a crash.
    if (isNotFound(error)) return {};
    throw error;
  }
}
