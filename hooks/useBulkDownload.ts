"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  overallProgress,
  runBulkDownload,
  type BulkDocument,
  type BulkDownloadOptions,
  type BulkDownloadResult,
  type FileProgress,
} from "@/lib/bulkDownload";

export type BulkDownloadPhase = "idle" | "running" | "done";

export interface UseBulkDownloadOptions {
  invoiceNumber: string;
  maxTotalBytes?: number;
  /** Injection points for tests. */
  engine?: typeof runBulkDownload;
  save?: (blob: Blob, fileName: string) => void;
  engineOverrides?: Partial<
    Pick<BulkDownloadOptions, "requestLinks" | "fetcher" | "zip" | "sha256" | "now">
  >;
}

/** Saves a blob through a temporary object URL. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Bundles an invoice's data-room documents into one ZIP (#778).
 *
 * Signed links stay inside `runBulkDownload`; this hook only ever holds file
 * names, byte counts and states.
 */
export function useBulkDownload(invoiceId: string, options: UseBulkDownloadOptions) {
  const {
    invoiceNumber,
    maxTotalBytes,
    engine = runBulkDownload,
    save = saveBlob,
    engineOverrides,
  } = options;

  const [phase, setPhase] = useState<BulkDownloadPhase>("idle");
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [result, setResult] = useState<BulkDownloadResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    async (documents: BulkDocument[]) => {
      if (controllerRef.current || documents.length === 0) return null;
      const controller = new AbortController();
      controllerRef.current = controller;
      setPhase("running");
      setResult(null);
      setFiles([]);

      const outcome = await engine({
        invoiceId,
        invoiceNumber,
        documents,
        signal: controller.signal,
        maxTotalBytes,
        onProgress: (next) => {
          if (mountedRef.current) setFiles(next);
        },
        ...engineOverrides,
      });

      controllerRef.current = null;
      if (outcome.status === "complete" && outcome.blob) {
        save(outcome.blob, outcome.archiveName);
      }
      if (mountedRef.current) {
        setResult(outcome);
        setPhase("done");
      }
      return outcome;
    },
    [engine, engineOverrides, invoiceId, invoiceNumber, maxTotalBytes, save],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    if (controllerRef.current) return;
    setPhase("idle");
    setFiles([]);
    setResult(null);
  }, []);

  return {
    phase,
    isRunning: phase === "running",
    files,
    overall: overallProgress(files),
    result,
    start,
    cancel,
    reset,
  };
}
