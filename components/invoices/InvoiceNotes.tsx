"use client";

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TagEditor } from "@/components/invoices/TagEditor";
import { useInvoiceNotes, type NoteSaveStatus } from "@/hooks/useInvoiceNotes";
import { useNoteIndex } from "@/hooks/useNoteIndex";
import {
  MAX_NOTE_LENGTH,
  parseMarkdownLite,
  type InlineNode,
} from "@/lib/invoiceNotes";

const STATUS_TEXT: Record<NoteSaveStatus, string> = {
  idle: "",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  saved: "Saved",
  conflict: "Conflict",
  error: "Couldn't save. Your text is kept; we'll retry on your next edit.",
};

function renderInline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "bold":
        return <strong key={i}>{node.text}</strong>;
      case "italic":
        return <em key={i}>{node.text}</em>;
      case "code":
        return (
          <code key={i} className="rounded bg-muted px-1 text-xs">
            {node.text}
          </code>
        );
      default:
        return <span key={i}>{node.text}</span>;
    }
  });
}

/** Rendered as React elements, never as HTML, so note text cannot inject markup. */
export function MarkdownLite({ source }: { source: string }) {
  const blocks = parseMarkdownLite(source);
  return (
    <div className="space-y-2 text-sm" data-testid="notes-preview">
      {blocks.map((block, i) => {
        if (block.type === "list") {
          return (
            <ul key={i} className="list-disc pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "heading") {
          return (
            <p key={i} className="font-semibold">
              {renderInline(block.inline)}
            </p>
          );
        }
        return <p key={i}>{renderInline(block.inline)}</p>;
      })}
    </div>
  );
}

/**
 * Private notes and tags on the invoice detail page (#777). Autosaves after
 * typing stops. Only the signed-in investor can read or write them.
 */
export function InvoiceNotes({ invoiceId }: { invoiceId: string }) {
  const notes = useInvoiceNotes(invoiceId);
  const { allTags } = useNoteIndex();
  const [preview, setPreview] = useState(false);

  return (
    <Card data-testid="invoice-notes">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">My notes</h2>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Private — only you can see this. Never included in shared links.
          </p>
        </div>
        <span
          className="text-xs text-muted-foreground"
          role="status"
          data-testid="notes-status"
        >
          {STATUS_TEXT[notes.status]}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {notes.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : notes.isError ? (
          <p className="text-sm text-destructive" role="alert">
            Couldn&apos;t load your notes.
          </p>
        ) : (
          <>
            {notes.status === "conflict" && notes.conflict && (
              <div
                className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
                role="alert"
                data-testid="notes-conflict"
              >
                <p>
                  These notes were changed in another tab or device. Keep your
                  version, or load the other one (your edits will be discarded).
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={notes.keepMine} data-testid="notes-keep-mine">
                    Keep mine
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={notes.takeTheirs}
                    data-testid="notes-use-theirs"
                  >
                    Load other version
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreview((p) => !p)}
                aria-pressed={preview}
              >
                {preview ? "Edit" : "Preview"}
              </Button>
            </div>

            {preview ? (
              <MarkdownLite source={notes.body} />
            ) : (
              <Textarea
                value={notes.body}
                onChange={(e) => notes.setBody(e.target.value)}
                rows={6}
                maxLength={MAX_NOTE_LENGTH}
                placeholder="Due-diligence notes. Supports **bold**, *italic*, `code` and - lists."
                aria-label="Private notes"
                data-testid="notes-textarea"
              />
            )}

            <TagEditor tags={notes.tags} onChange={notes.setTags} knownTags={allTags} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
