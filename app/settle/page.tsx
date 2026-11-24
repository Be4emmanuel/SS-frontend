"use client";

import Link from "next/link";
import { Coins, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SettleNowButton } from "@/components/invoices/SettleNowButton";
import { useSettleableInvoices } from "@/hooks/useSettleable";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function SettleEligiblePage() {
  usePageTitle("Permissionless Settlement");
  const { data: invoices, isLoading, isError, refetch } = useSettleableInvoices();

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" aria-hidden="true" />
          Permissionless Settlement
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trigger settlement for fully paid invoices and earn the keeper bounty.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4" data-testid="settle-list-loading" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card data-testid="settle-list-error">
          <CardContent className="pt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-destructive">
              Failed to load settleable invoices.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : !invoices || invoices.length === 0 ? (
        <Card data-testid="settle-list-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No invoices are currently eligible for settlement.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" data-testid="settle-list">
          {invoices.map((inv) => (
            <Card key={inv.invoice_id} data-testid={`settle-row-${inv.invoice_id}`}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link
                      href={`/invoices/${encodeURIComponent(inv.invoice_id)}`}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {inv.invoice_title}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  </CardTitle>
                  <span className="text-sm font-medium tabular-nums">
                    {inv.amount.toLocaleString()} XLM
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>
                    Bounty:{" "}
                    <strong className="text-foreground">
                      {inv.bounty_amount.toLocaleString()} XLM
                    </strong>
                  </span>
                  <span>
                    Est. fee:{" "}
                    <span className="font-mono text-foreground">
                      {inv.estimated_network_fee.toLocaleString()} XLM
                    </span>
                  </span>
                </div>
                <SettleNowButton
                  invoiceId={inv.invoice_id}
                  invoiceTitle={inv.invoice_title}
                  onSettled={() => refetch()}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
