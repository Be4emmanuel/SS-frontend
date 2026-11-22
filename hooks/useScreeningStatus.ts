"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, readApiJson } from "@/lib/api/shared";
import { useWallet } from "@/context/WalletContext";
import { SUPPORT_ROUTE } from "@/lib/restrictions";

export type ScreeningStatus = "CLEAR" | "PENDING_REVIEW" | "RESTRICTED";

export interface ScreeningStatusResponse {
  status: ScreeningStatus;
  expected_timing?: string | null;
  support_url?: string | null;
}

export function screeningStatusQueryKey(address?: string | null) {
  return ["screening-status", address ?? "anonymous"] as const;
}

function normalizeScreeningStatus(raw?: string | null): ScreeningStatus {
  if (raw === "RESTRICTED") return "RESTRICTED";
  if (raw === "PENDING_REVIEW") return "PENDING_REVIEW";
  return "CLEAR";
}

async function fetchScreeningStatus(
  address?: string | null,
): Promise<ScreeningStatusResponse> {
  const query = address ? `?wallet=${encodeURIComponent(address)}` : "";
  const res = await fetch(`${API_BASE}/compliance/screening-status${query}`);
  const data = await readApiJson<Record<string, unknown>>(res);
  if (!res.ok) {
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : "Failed to fetch screening status",
    );
  }
  // Explicitly pick only safe, non-sensitive fields — never forward provider
  // names or match details to the UI (#615).
  return {
    status: normalizeScreeningStatus(
      typeof data.status === "string" ? data.status : undefined,
    ),
    expected_timing:
      typeof data.expected_timing === "string" ? data.expected_timing : null,
    support_url:
      typeof data.support_url === "string" ? data.support_url : null,
  };
}

/**
 * Reads the current account's AML screening status (`CLEAR`, `PENDING_REVIEW`,
 * or `RESTRICTED`) and automatically refetches when returning to the tab from
 * a support flow (#615).
 */
export function useScreeningStatus(options?: { enabled?: boolean }) {
  const { address, isConnected } = useWallet();
  const queryClient = useQueryClient();
  const enabled = (options?.enabled ?? true) && isConnected;
  const queryKey = screeningStatusQueryKey(address);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchScreeningStatus(address),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!enabled) return;

    function handleReturnFromSupport() {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey });
      }
    }

    window.addEventListener("focus", handleReturnFromSupport);
    document.addEventListener("visibilitychange", handleReturnFromSupport);
    return () => {
      window.removeEventListener("focus", handleReturnFromSupport);
      document.removeEventListener("visibilitychange", handleReturnFromSupport);
    };
  }, [enabled, queryClient, queryKey]);

  const status: ScreeningStatus = query.data?.status ?? "CLEAR";

  return {
    ...query,
    status,
    isClear: status === "CLEAR",
    isPendingReview: status === "PENDING_REVIEW",
    isRestricted: status === "RESTRICTED",
    expectedTiming: query.data?.expected_timing ?? "1–2 business days",
    supportUrl: query.data?.support_url ?? SUPPORT_ROUTE,
  };
}
