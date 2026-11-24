"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstallments } from "@/hooks/useInstallments";
import {
  STATUS_LABELS,
  investorShareOf,
  type InstallmentStatus,
} from "@/lib/installments";

const CHIP_CLASS: Record<InstallmentStatus, string> = {
  upcoming: "border-border text-muted-foreground",
  paid: "border-emerald-300 bg-emerald-50 text-emerald-800",
  late: "border-red-300 bg-red-50 text-red-800",
  partial: "border-amber-300 bg-amber-50 text-amber-800",
};

function xlm(amount: number): string {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} XLM`;
}

export interface InstallmentScheduleProps {
  invoiceId: string;
  /** The viewing investor's proportion of the invoice (0..1); omit if not an investor. */
  investorProportion?: number;
  /** Accrued late interest, when known, for the notice. */
  lateInterestAccrued?: number | null;
  /** Test seam. */
  now?: Date;
}

/**
 * Installment schedule on the invoice detail page (#776): each installment's
 * due date, amount and status, the shortfall on partial payments, the
 * investor's share, overall progress, and a late-interest notice.
 */
export function InstallmentSchedule({
  invoiceId,
  investorProportion = 0,
  lateInterestAccrued = null,
  now,
}: InstallmentScheduleProps) {
  const { schedule, isLoading, lateInterestApplies } = useInstallments(invoiceId, now);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 py-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!schedule) return null;

  const pct = schedule.progress * 100;
  const showShare = investorProportion > 0;

  return (
    <Card data-testid="installment-schedule">
      <CardHeader>
        <h2 className="text-lg font-semibold">Payment plan</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {xlm(schedule.totalPaid)} of {xlm(schedule.totalAmount)} paid
            </span>
            <span className="font-medium" data-testid="installment-progress-pct">
              {pct.toFixed(1)}%
            </span>
          </div>
          <Progress value={pct} className="h-2" aria-label="Installments paid" />
        </div>

        {schedule.hasMissed && lateInterestApplies && (
          <div
            className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            role="alert"
            data-testid="installment-late-interest-notice"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              A missed installment is accruing late interest
              {lateInterestAccrued != null && lateInterestAccrued > 0
                ? ` (${xlm(lateInterestAccrued)} so far)`
                : ""}
              . It is added to the amount the debtor owes.
            </p>
          </div>
        )}

        <ol className="divide-y rounded-md border">
          {schedule.installments.map((item, index) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              data-testid={`installment-${item.id}`}
            >
              <div>
                <p className="font-medium">
                  #{index + 1} · {new Date(item.dueDate).toLocaleDateString()}
                </p>
                <p className="text-muted-foreground">{xlm(item.amount)}</p>
                {showShare && (
                  <p className="text-xs text-muted-foreground" data-testid={`installment-share-${item.id}`}>
                    Your share: {xlm(investorShareOf(item.amount, investorProportion))}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant="outline"
                  className={CHIP_CLASS[item.status]}
                  data-testid={`installment-status-${item.id}`}
                >
                  {STATUS_LABELS[item.status]}
                </Badge>
                {item.status === "partial" && (
                  <span className="text-xs text-amber-800" data-testid={`installment-shortfall-${item.id}`}>
                    Shortfall {xlm(item.shortfall)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
