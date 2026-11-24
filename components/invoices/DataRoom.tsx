"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes, type BulkDocument, type SkipReason } from "@/lib/bulkDownload";
import { useBulkDownload, type UseBulkDownloadOptions } from "@/hooks/useBulkDownload";

const SKIP_LABELS: Record<SkipReason, string> = {
  forbidden: "You don't have access to this document",
  unavailable: "The document could not be retrieved",
  integrity: "The file failed its integrity check",
};

export interface DataRoomProps {
  invoiceId: string;
  invoiceNumber: string;
  documents: BulkDocument[];
  /** Test seam: forwarded to useBulkDownload. */
  downloadOptions?: Partial<UseBulkDownloadOptions>;
}

/**
 * Data room "Download all" (#778): a checklist of documents, one button that
 * bundles the selection into a ZIP, per-file and overall progress with
 * Cancel, and a summary of anything that was skipped.
 */
export function DataRoom({
  invoiceId,
  invoiceNumber,
  documents,
  downloadOptions,
}: DataRoomProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(documents.map((d) => d.id)),
  );
  const { phase, isRunning, files, overall, result, start, cancel, reset } =
    useBulkDownload(invoiceId, { invoiceNumber, ...downloadOptions });

  const chosen = useMemo(
    () => documents.filter((d) => selected.has(d.id)),
    [documents, selected],
  );
  const allSelected = chosen.length === documents.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (documents.length === 0) return null;

  return (
    <section
      className="space-y-3 rounded-md border bg-muted/20 p-4"
      aria-labelledby="data-room-heading"
      data-testid="data-room"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="data-room-heading" className="text-sm font-semibold">
          Data room
        </h3>
        <div className="flex items-center gap-2">
          {isRunning && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cancel}
              data-testid="data-room-cancel"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={isRunning || chosen.length === 0}
            onClick={() => {
              reset();
              void start(chosen);
            }}
            data-testid="data-room-download-all"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {allSelected ? "Download all" : `Download selected (${chosen.length})`}
          </Button>
        </div>
      </div>

      <fieldset disabled={isRunning} className="space-y-1">
        <legend className="sr-only">Documents to include</legend>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.id)))
            }
            data-testid="data-room-select-all"
          />
          Select all ({documents.length})
        </label>
        <ul className="space-y-1">
          {documents.map((doc) => (
            <li key={doc.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  onChange={() => toggle(doc.id)}
                  data-testid={`data-room-check-${doc.id}`}
                />
                <span className="truncate">{doc.name}</span>
                {doc.size != null && (
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(doc.size)}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {isRunning && (
        <div className="space-y-2" data-testid="data-room-progress">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Overall</span>
              <span>{Math.round(overall * 100)}%</span>
            </div>
            <Progress
              value={overall * 100}
              className="h-2"
              aria-label="Overall download progress"
              data-testid="data-room-overall"
            />
          </div>
          <ul className="space-y-1">
            {files.map((file) => {
              const pct =
                file.state === "done" || file.state === "skipped"
                  ? 100
                  : file.total
                    ? Math.min(100, (file.loaded / file.total) * 100)
                    : 0;
              return (
                <li key={file.id} data-testid={`data-room-file-${file.id}`}>
                  <div className="flex justify-between text-xs">
                    <span className="truncate">{file.name}</span>
                    <span className="text-muted-foreground">{file.state}</span>
                  </div>
                  <Progress value={pct} className="h-1" aria-label={`${file.name} progress`} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-2 text-sm" role="status" data-testid="data-room-summary">
          {result.status === "complete" && (
            <p className="text-emerald-700">
              Downloaded {result.included.length} document
              {result.included.length === 1 ? "" : "s"} as{" "}
              <span className="font-mono">{result.archiveName}</span>.
            </p>
          )}
          {result.status === "cancelled" && (
            <p data-testid="data-room-cancelled">{result.message}</p>
          )}
          {result.status === "too_large" && (
            <p className="text-destructive" role="alert" data-testid="data-room-too-large">
              {result.message}
            </p>
          )}
          {result.status === "failed" && (
            <p className="text-destructive" role="alert">
              {result.message}
            </p>
          )}
          {result.skipped.length > 0 && (
            <div data-testid="data-room-skipped">
              <p className="font-medium">
                {result.skipped.length} document
                {result.skipped.length === 1 ? " was" : "s were"} skipped:
              </p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {result.skipped.map((s) => (
                  <li key={s.id}>
                    {s.name} — {SKIP_LABELS[s.reason]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
