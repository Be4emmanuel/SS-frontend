"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { ExtractionResult, ExtractedFieldName } from "@/hooks/useInvoiceExtraction";

const FIELD_LABELS: Record<ExtractedFieldName, string> = {
  invoiceNumber: "Invoice number",
  amount: "Amount",
  currency: "Currency",
  issueDate: "Issue date",
  dueDate: "Due date",
  debtorName: "Debtor name",
};

interface ExtractionReviewProps {
  result: ExtractionResult | null;
  isExtracting: boolean;
  error: string | null;
  onApply: (fields: Partial<Record<ExtractedFieldName, string>>) => void;
  onDismiss: () => void;
}

export function ExtractionReview({
  result,
  isExtracting,
  error,
  onApply,
  onDismiss,
}: ExtractionReviewProps) {
  const [confirmed, setConfirmed] = useState<Record<ExtractedFieldName, boolean>>(
    {} as Record<ExtractedFieldName, boolean>,
  );

  useEffect(() => setConfirmed({} as Record<ExtractedFieldName, boolean>), [result]);

  if (isExtracting) {
    return (
      <Card data-testid="extraction-loading">
        <CardContent className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Extracting invoice fields…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="extraction-error">
        <CardContent className="flex items-start gap-2 pt-6 text-sm">
          <AlertTriangle className="mt-0.5 size-4 text-destructive" />
          <span>{error} You can continue and enter the details manually.</span>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  const fields = Object.entries(result).filter(([, field]) => field?.value != null) as [
    ExtractedFieldName,
    { value: string | number; confidence: number },
  ][];
  const lowConfidence = fields.filter(([, field]) => field.confidence < 0.8);
  const allConfirmed = lowConfidence.every(([name]) => confirmed[name]);

  function apply(highConfidenceOnly = true) {
    const values: Partial<Record<ExtractedFieldName, string>> = {};
    fields.forEach(([name, field]) => {
      if (!highConfidenceOnly || field.confidence >= 0.8) {
        values[name] = String(field.value);
      }
    });
    onApply(values);
  }

  return (
    <Card data-testid="extraction-review">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Extracted fields</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map(([name, field]) => {
          const low = field.confidence < 0.8;
          return (
            <div key={name} className={`rounded-md border p-3 ${low ? "border-amber-500/60" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{FIELD_LABELS[name]}</p>
                  <p className="text-sm font-medium">{String(field.value)}</p>
                </div>
                <Badge variant={low ? "outline" : "secondary"} className={low ? "text-amber-600" : ""}>
                  {low ? <AlertTriangle className="mr-1 size-3" /> : <CheckCircle2 className="mr-1 size-3" />}
                  {Math.round(field.confidence * 100)}%
                </Badge>
              </div>
              {low && (
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <Switch
                    checked={Boolean(confirmed[name])}
                    onCheckedChange={(checked) =>
                      setConfirmed((current) => ({ ...current, [name]: checked }))
                    }
                    aria-label={`Confirm ${FIELD_LABELS[name]}`}
                  />
                  Confirm this value
                </label>
              )}
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          disabled={!allConfirmed}
          onClick={() => apply(true)}
        >
          Apply suggestions
        </Button>
      </CardContent>
    </Card>
  );
}
