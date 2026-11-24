"use client";

import Link from "next/link";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useScreeningStatus } from "@/hooks/useScreeningStatus";

interface ScreeningBannerProps {
  className?: string;
}

/**
 * Displays AML screening status notices on dashboards and above gated action
 * buttons for non-clear states (`PENDING_REVIEW` and `RESTRICTED`) (#615).
 * Never renders screening provider details or match data.
 */
export function ScreeningBanner({ className }: ScreeningBannerProps) {
  const {
    status,
    isClear,
    expectedTiming,
    supportUrl,
    refetch,
    isFetching,
  } = useScreeningStatus();

  if (isClear) {
    return null;
  }

  if (status === "RESTRICTED") {
    return (
      <Alert
        variant="destructive"
        className={className}
        data-testid="screening-banner-restricted"
      >
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Account restricted</AlertTitle>
        <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <span>
            Publishing, investing, and withdrawing are currently disabled for your
            account. Please contact support to resolve this restriction.
          </span>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={supportUrl} data-testid="screening-support-link">
                Contact support
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="screening-refresh-button"
            >
              <RefreshCw
                className={`mr-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh status
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      className={`border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 ${className ?? ""}`}
      data-testid="screening-banner-pending"
    >
      <Clock className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Compliance review in progress</AlertTitle>
      <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <span>
          Your account is under routine screening review. Reviews typically
          complete within {expectedTiming}. You can continue browsing
          read-only pages while this completes.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href={supportUrl} data-testid="screening-support-link">
            Contact support
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
