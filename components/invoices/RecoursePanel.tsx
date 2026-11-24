"use client";

import { ShieldCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  calculatePotentialRecovery,
  useRecourse,
  useTriggerRecourse,
  type RecourseStatus,
} from "@/hooks/useRecourse";

const STATUS_META: Record<
  RecourseStatus,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
    explanation: string;
  }
> = {
  posted: {
    label: "Posted",
    variant: "secondary",
    explanation:
      "Seller guarantee is posted and held in reserve to cover investor principal if the debtor defaults.",
  },
  triggered: {
    label: "Triggered",
    variant: "destructive",
    explanation:
      "Guarantee has been triggered due to debtor non-payment; funds are allocated for investor recovery.",
  },
  released: {
    label: "Released",
    variant: "outline",
    explanation:
      "Invoice was repaid in full and the seller guarantee has been released.",
  },
};

interface RecoursePanelProps {
  invoiceId: string;
  /** Connected investor's committed principal on this invoice, if any. */
  investorPosition?: number;
}

/**
 * Displays the seller recourse guarantee, coverage ratio, status explanation,
 * investor potential recovery, and Trigger action when past due beyond grace
 * period and unpaid (#616).
 */
export function RecoursePanel({
  invoiceId,
  investorPosition = 0,
}: RecoursePanelProps) {
  const { guarantee, hasGuarantee, coverageRatio, canTrigger, isLoading } =
    useRecourse(invoiceId);
  const triggerMutation = useTriggerRecourse(invoiceId);

  if (isLoading || !guarantee || !hasGuarantee) {
    return null;
  }

  const meta = STATUS_META[guarantee.status];
  const coveragePct = (coverageRatio * 100).toFixed(1);
  const potentialRecovery = calculatePotentialRecovery(
    guarantee.guarantee_amount,
    guarantee.funded_principal,
    investorPosition,
  );

  return (
    <Card data-testid="recourse-panel">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Seller Recourse Guarantee
          </CardTitle>
          <Badge variant={meta.variant} data-testid="recourse-status-badge">
            {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Guarantee amount</p>
            <p className="text-lg font-semibold tabular-nums" data-testid="recourse-amount">
              {guarantee.guarantee_amount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              XLM
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Coverage ratio</p>
            <p className="text-lg font-semibold tabular-nums" data-testid="recourse-coverage">
              {coveragePct}%
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground" data-testid="recourse-explanation">
          {meta.explanation}
        </p>

        {investorPosition > 0 && (
          <div
            className="flex items-center justify-between rounded-md border bg-muted/40 p-3 text-sm"
            data-testid="recourse-potential-recovery"
          >
            <span className="text-muted-foreground">
              Your potential recovery
            </span>
            <span className="font-semibold tabular-nums">
              {potentialRecovery.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              XLM
            </span>
          </div>
        )}

        {canTrigger && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
            data-testid="recourse-trigger-button"
          >
            {triggerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Triggering guarantee…
              </>
            ) : (
              "Trigger Guarantee"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
