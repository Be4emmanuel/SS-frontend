"use client";

import { StickyNote } from "lucide-react";
import { useNoteIndex } from "@/hooks/useNoteIndex";
import { hasNote } from "@/lib/invoiceNotes";

/** Small marker on an invoice card when the user has a private note on it (#777). */
export function NoteIndicator({ invoiceId }: { invoiceId: string }) {
  const { index } = useNoteIndex();
  if (!hasNote(index, invoiceId)) return null;
  return (
    <span
      className="inline-flex items-center text-muted-foreground"
      title="You have a private note on this invoice"
      data-testid={`note-indicator-${invoiceId}`}
    >
      <StickyNote className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Has private note</span>
    </span>
  );
}
