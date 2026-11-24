"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractInvoiceDocument, fetchInvoiceExtraction } from "@/lib/api";

export type ExtractedFieldName =
  | "invoiceNumber"
  | "amount"
  | "currency"
  | "issueDate"
  | "dueDate"
  | "debtorName";

export interface ExtractedField {
  value: string | number | null;
  confidence: number;
}

export type ExtractionResult = Partial<Record<ExtractedFieldName, ExtractedField>>;

export function useInvoiceExtraction() {
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const extract = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setIsExtracting(true);

    try {
      const started = await extractInvoiceDocument(file);
      let finished = false;
      const poll = async () => {
        if (finished) return;
        const current = await fetchInvoiceExtraction(started.jobId);
        if (current.status === "completed") {
          finished = true;
          if (timer.current) clearInterval(timer.current);
          setResult(current.fields ?? {});
          setIsExtracting(false);
          return;
        }
        if (current.status === "failed") {
          finished = true;
          if (timer.current) clearInterval(timer.current);
          setError(current.error ?? "The document could not be read.");
          setIsExtracting(false);
        }
      };

      await poll();
      if (!finished) {
        timer.current = setInterval(poll, 1500);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unsupported or unreadable file.");
      setIsExtracting(false);
    }
  }, []);

  return { result, isExtracting, error, extract };
}
