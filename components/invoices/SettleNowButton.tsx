"use client";

import { useState } from "react";
import { Loader2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSettleable,
  useTriggerSettlement,
  type SettleIneligibleReason,
} from "@/hooks/useSettleable";

const INELIGIBLE_REASON_LABELS: Record<string, string> = {
  unpaid: "Invoice is unpaid",
  disputed: "Invoice is disputed",
  already_settled: "Already settled",
};

export function formatIneligibleReason(
  reason?: SettleIneligibleReason | null,
): string {
  if (!reason) return "Not eligible for settlement";
  return INELIGIBLE_REASON_LABELS[reason] ?? reason;
}

interface SettleNowButtonProps {
  invoiceId: string;
  invoiceTitle?: string;
  onSettled?: () => void;
  className?: string;
}

export function SettleNowButton({
  invoiceId,
  invoiceTitle,
  onSettled,
  className,
}: SettleNowButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settledLocally, setSettledLocally] = useState(false);

  const { data, isLoading } = useSettleable(invoiceId);
  const mutation = useTriggerSettlement(invoiceId);

  if (isLoading) {
    return (
      <Button disabled variant="outline" className={className} data-testid="settle-now-loading">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Checking settlement…
      </Button>
    );
  }

  if (!data) {
    return null;
  }

  const alreadySettled =
    settledLocally || data.ineligible_reason === "already_settled";
  const isSettleable = data.is_settleable && !alreadySettled;
  const disabledReason = alreadySettled
    ? "Already settled"
    : !data.is_settleable
      ? formatIneligibleReason(data.ineligible_reason)
      : null;

  async function handleConfirm() {
    if (!isSettleable) return;
    try {
      await mutation.mutateAsync();
      setSettledLocally(true);
      setConfirmOpen(false);
      onSettled?.();
    } catch {
      // Error toast is handled in useTriggerSettlement
    }
  }

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={!isSettleable || mutation.isPending}
        data-testid="settle-now-button"
        title={disabledReason ?? undefined}
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Settling…
          </>
        ) : disabledReason ? (
          `Settle Now (${disabledReason})`
        ) : (
          <>
            <Coins className="mr-2 h-4 w-4" />
            Settle Now
          </>
        )}
      </Button>

      {isSettleable && (
        <Badge variant="secondary" data-testid="settle-bounty-badge">
          Keeper bounty: {data.bounty_amount.toLocaleString()} XLM
        </Badge>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="settle-confirm-dialog">
          <DialogHeader>
            <DialogTitle>Confirm permissionless settlement</DialogTitle>
            <DialogDescription>
              {invoiceTitle
                ? `Trigger settlement for ${invoiceTitle} and claim the keeper bounty.`
                : "Trigger settlement for this fully paid invoice and claim the keeper bounty."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Keeper bounty</span>
              <span className="font-semibold text-green-600" data-testid="settle-confirm-bounty">
                {data.bounty_amount.toLocaleString()} XLM
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estimated network fee</span>
              <span className="font-mono" data-testid="settle-confirm-fee">
                {data.estimated_network_fee.toLocaleString()} XLM
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={mutation.isPending || !isSettleable}
              data-testid="settle-confirm-submit"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming…
                </>
              ) : (
                "Confirm Settlement"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
