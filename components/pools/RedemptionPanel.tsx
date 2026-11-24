"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { QueueStatusCard } from "@/components/pools/QueueStatusCard";
import {
  useCancelRedemption,
  useRedemptionQueue,
  useRequestRedemption,
} from "@/hooks/useRedemptionQueue";
import { useWallet } from "@/context/WalletContext";

interface RedemptionPanelProps {
  poolId: string;
}

/**
 * Pooled position redemption queue interface (#614). Allows investors to
 * estimate payouts at current NAV, queue exit requests, inspect epoch capacity,
 * and cancel unprocessed requests.
 */
export function RedemptionPanel({ poolId }: RedemptionPanelProps) {
  const { isConnected } = useWallet();
  const [sharesInput, setSharesInput] = useState("");
  const {
    requests,
    userShares,
    currentNav,
    queuePosition,
    epoch,
    isLoading,
  } = useRedemptionQueue(poolId);

  const requestMutation = useRequestRedemption(poolId);
  const cancelMutation = useCancelRedemption(poolId);

  const shares = Number(sharesInput);
  const isPositive = Number.isFinite(shares) && shares > 0;
  const exceedsBalance = isPositive && shares > userShares;
  const canSubmit = isConnected && isPositive && !exceedsBalance && !requestMutation.isPending;
  const estimatedPayout = isPositive ? shares * currentNav : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await requestMutation.mutateAsync(shares);
    setSharesInput("");
  }

  if (isLoading) {
    return (
      <Card data-testid="redemption-panel-loading">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="redemption-panel">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Redeem Pool Position</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Available shares</span>
              <span className="font-mono font-medium" data-testid="redemption-available-shares">
                {userShares.toLocaleString()} shares
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="redemption-shares">Shares to redeem</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setSharesInput(String(userShares))}
                  disabled={userShares <= 0}
                  data-testid="redemption-max-btn"
                >
                  Max
                </Button>
              </div>
              <Input
                id="redemption-shares"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={sharesInput}
                onChange={(e) => setSharesInput(e.target.value)}
                data-testid="redemption-shares-input"
              />
              {exceedsBalance && (
                <p
                  className="text-sm text-destructive"
                  role="alert"
                  data-testid="redemption-balance-error"
                >
                  Requested shares exceed your available balance ({userShares.toLocaleString()}).
                </p>
              )}
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current NAV</span>
                <span className="font-mono" data-testid="redemption-current-nav">
                  {currentNav.toFixed(4)} XLM / share
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estimated payout</span>
                <span className="font-semibold tabular-nums" data-testid="redemption-estimated-payout">
                  {estimatedPayout.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  XLM
                </span>
              </div>
            </div>

            {!isConnected && (
              <p className="text-sm text-muted-foreground">
                Connect a wallet to queue a redemption request.
              </p>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              data-testid="redemption-submit-btn"
            >
              {requestMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Queueing…
                </>
              ) : (
                "Queue Redemption"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <QueueStatusCard
        requests={requests}
        queuePosition={queuePosition}
        epoch={epoch}
        onCancel={async (requestId) => {
          await cancelMutation.mutateAsync(requestId);
        }}
        isCancelling={cancelMutation.isPending}
      />
    </div>
  );
}
