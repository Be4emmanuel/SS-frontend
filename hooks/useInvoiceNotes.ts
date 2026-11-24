"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchInvoiceNote,
  saveInvoiceNote,
  NoteConflictError,
} from "@/lib/api/invoiceNotes";
import { MAX_NOTE_LENGTH, type InvoiceNote } from "@/lib/invoiceNotes";
import { NOTE_INDEX_QUERY_KEY } from "@/hooks/useNoteIndex";

export const INVOICE_NOTE_QUERY_KEY = (invoiceId: string) =>
  ["invoice-notes", invoiceId] as const;

export type NoteSaveStatus = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export const NOTE_AUTOSAVE_DELAY_MS = 1000;

export interface UseInvoiceNotesOptions {
  debounceMs?: number;
}

/**
 * Private notes + tags for one invoice (#777).
 *
 * Edits are held locally and saved `debounceMs` after typing stops, using the
 * last server version as `baseVersion`. A 409 puts the hook in `conflict`
 * with the server's copy so the user can keep theirs or take the server's.
 * Pending edits are flushed when the component unmounts.
 */
export function useInvoiceNotes(
  invoiceId: string,
  { debounceMs = NOTE_AUTOSAVE_DELAY_MS }: UseInvoiceNotesOptions = {},
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: INVOICE_NOTE_QUERY_KEY(invoiceId),
    queryFn: () => fetchInvoiceNote(invoiceId),
    enabled: Boolean(invoiceId),
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState<{ body: string; tags: string[] } | null>(null);
  const [status, setStatus] = useState<NoteSaveStatus>("idle");
  const [conflict, setConflict] = useState<InvoiceNote | null>(null);

  const draftRef = useRef(draft);
  const versionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (query.data && !dirtyRef.current) versionRef.current = query.data.version;
  }, [query.data]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const save = useCallback(async () => {
    clearTimer();
    const pending = draftRef.current;
    if (!pending || savingRef.current) return;
    savingRef.current = true;
    setStatus("saving");
    try {
      const saved = await saveInvoiceNote(invoiceId, {
        body: pending.body,
        tags: pending.tags,
        baseVersion: versionRef.current,
      });
      versionRef.current = saved.version;
      queryClient.setQueryData(INVOICE_NOTE_QUERY_KEY(invoiceId), saved);
      void queryClient.invalidateQueries({ queryKey: NOTE_INDEX_QUERY_KEY });
      // New edits may have arrived while the request was in flight.
      if (draftRef.current === pending) {
        dirtyRef.current = false;
        setStatus("saved");
      } else {
        setStatus("dirty");
        timerRef.current = setTimeout(() => void save(), debounceMs);
      }
    } catch (error) {
      if (error instanceof NoteConflictError) {
        setConflict(error.current);
        setStatus("conflict");
      } else {
        setStatus("error");
      }
    } finally {
      savingRef.current = false;
    }
  }, [debounceMs, invoiceId, queryClient]);

  const edit = useCallback(
    (patch: Partial<{ body: string; tags: string[] }>) => {
      const base = draftRef.current ?? {
        body: query.data?.body ?? "",
        tags: query.data?.tags ?? [],
      };
      const next = {
        body: (patch.body ?? base.body).slice(0, MAX_NOTE_LENGTH),
        tags: patch.tags ?? base.tags,
      };
      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);
      if (status === "conflict") return; // hold edits until the user resolves it
      setStatus("dirty");
      clearTimer();
      timerRef.current = setTimeout(() => void save(), debounceMs);
    },
    [debounceMs, query.data, save, status],
  );

  /** Keep my text, overwriting the other version. */
  const keepMine = useCallback(() => {
    if (!conflict) return;
    versionRef.current = conflict.version;
    setConflict(null);
    setStatus("dirty");
    void save();
  }, [conflict, save]);

  /** Discard my edits and take the server's copy. */
  const takeTheirs = useCallback(() => {
    if (!conflict) return;
    versionRef.current = conflict.version;
    draftRef.current = null;
    dirtyRef.current = false;
    setDraft(null);
    setConflict(null);
    queryClient.setQueryData(INVOICE_NOTE_QUERY_KEY(invoiceId), conflict);
    setStatus("idle");
  }, [conflict, invoiceId, queryClient]);

  // Flush unsaved edits when leaving the page.
  useEffect(
    () => () => {
      if (dirtyRef.current && !savingRef.current && timerRef.current) {
        clearTimer();
        void saveInvoiceNote(invoiceId, {
          body: draftRef.current?.body ?? "",
          tags: draftRef.current?.tags ?? [],
          baseVersion: versionRef.current,
        }).catch(() => {});
      }
    },
    [invoiceId],
  );

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    body: draft?.body ?? query.data?.body ?? "",
    tags: draft?.tags ?? query.data?.tags ?? [],
    updatedAt: query.data?.updatedAt ?? null,
    status,
    conflict,
    setBody: (body: string) => edit({ body }),
    setTags: (tags: string[]) => edit({ tags }),
    saveNow: save,
    keepMine,
    takeTheirs,
  };
}
