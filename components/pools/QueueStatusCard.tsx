"use client";

import { useState } from "react";
import { Loader2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  EpochCapacity,
  RedemptionRequest,
} from "@/hooks/useRedemptionQueue";

interface QueueStatusCardProps {
  requests: RedemptionRequest[];
  queuePosition: number | null;
  epoch: EpochCapacity;
  onCancel: (requestId: string) => Promise<void> | void;
  isCancelling?: boolean;
}

export function QueueStatusCard({
  requests,
  queuePosition,
  epoch,
  onCancel,
  isCancelling = false,
}: QueueStatusCardProps) {
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const capShares = epoch.cap_shares > 0 ? epoch.cap_shares : 0;
  const filledShares = Math.min(epoch.filled_shares, capShares || epoch.filled_shares);
  const capPercent =
    capShares > 0 ? Math.min(100, (filledShares / capShares) * 100) : 0;

  const activeRequests = requests.filter(
    (r) => r.status === "queued" || r.status === "processing",
  );
  const processedRequests = requests.filter((r) => r.status === "processed");

  const nextEstimatedEpoch =
    activeRequests[0]?.estimated_epoch ?? epoch.epoch_number;

  async function handleConfirmCancel() {
    if (!confirmCancelId) return;
    await onCancel(confirmCancelId);
    setConfirmCancelId(null);
  }

  return (
    <Card data-testid="queue-status-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Redemption Queue Status</CardTitle>
          <Badge variant="outline" data-testid="epoch-number">
            Epoch #{epoch.epoch_number}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Queue position</p>
            <p className="text-lg font-semibold" data-testid="queue-position">
              {queuePosition !== null ? `#${queuePosition}` : "—"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Estimated epoch</p>
            <p className="text-lg font-semibold" data-testid="estimated-epoch">
              Epoch #{nextEstimatedEpoch}
            </p>
          </div>
        </div>

        <div className="space-y-1.5" data-testid="epoch-capacity">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Epoch capacity</span>
            <span className="font-mono tabular-nums" data-testid="epoch-capacity-text">
              {epoch.filled_shares.toLocaleString()} /{" "}
              {epoch.cap_shares.toLocaleString()} shares ({capPercent.toFixed(0)}%)
            </span>
          </div>
          <Progress
            value={capPercent}
            aria-label="Epoch redemption capacity"
            data-testid="epoch-capacity-bar"
          />
        </div>

        <p
          className="flex items-start gap-2 rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground"
          data-testid="queue-carryover-note"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Unfilled requests automatically carry over to the next epoch and keep
            their place in the queue.
          </span>
        </p>

        {activeRequests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Pending requests</h3>
            <ul className="space-y-2">
              {activeRequests.map((req) => (
                <li
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  data-testid={`redemption-request-${req.id}`}
                >
                  <div>
                    <p className="font-medium tabular-nums">
                      {req.shares.toLocaleString()} shares
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Position{" "}
                      {req.queue_position !== null ? `#${req.queue_position}` : "—"} ·
                      Est. Epoch #{req.estimated_epoch ?? epoch.epoch_number}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{req.status}</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isCancelling}
                      onClick={() => setConfirmCancelId(req.id)}
                      data-testid={`cancel-redemption-${req.id}`}
                    >
                      Cancel
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {processedRequests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Processed requests</h3>
            <ul className="space-y-2">
              {processedRequests.map((req) => (
                <li
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-3 text-sm"
                  data-testid={`redemption-request-${req.id}`}
                >
                  <div>
                    <p className="font-medium tabular-nums">
                      {req.shares.toLocaleString()} shares →{" "}
                      {(req.payout_amount ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      XLM
                    </p>
                    <p className="text-xs text-muted-foreground">
                      NAV used:{" "}
                      <span className="font-mono">
                        {(req.nav_used ?? 0).toFixed(4)} XLM
                      </span>
                    </p>
                  </div>
                  <Badge variant="outline">processed</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Dialog
          open={confirmCancelId !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmCancelId(null);
          }}
        >
          <DialogContent data-testid="cancel-redemption-dialog">
            <DialogHeader>
              <DialogTitle>Cancel redemption request</DialogTitle>
              <DialogDescription>
                Are you sure you want to cancel this queued redemption request?
                You will lose your current position in the queue.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmCancelId(null)}
                disabled={isCancelling}
              >
                Keep request
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                data-testid="confirm-cancel-redemption"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  "Confirm cancel"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
