"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNoteIndex } from "@/lib/api/invoiceNotes";
import { collectTags, type NoteIndex } from "@/lib/invoiceNotes";

const EMPTY_INDEX: NoteIndex = {};

export const NOTE_INDEX_QUERY_KEY = ["invoice-notes", "index"] as const;

/**
 * The caller's own note/tag index (#777): which invoices have a note, and
 * every tag they have used (the autocomplete and filter source).
 */
export function useNoteIndex() {
  const query = useQuery({
    queryKey: NOTE_INDEX_QUERY_KEY,
    queryFn: fetchNoteIndex,
    staleTime: 60_000,
    retry: false,
  });
  const index: NoteIndex = query.data ?? EMPTY_INDEX;
  const allTags = useMemo(() => collectTags(index), [index]);
  return { index, allTags, isLoading: query.isLoading };
}
