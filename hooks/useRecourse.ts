"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_BASE, isNotFound, readApiJson } from "@/lib/api/shared";

export type RecourseStatus = "posted" | "triggered" | "released";

export interface RecourseGuarantee {
  invoice_id: string;
  has_guarantee: boolean;
  guarantee_amount: number;
  funded_principal: number;
  status: RecourseStatus;
  is_past_due_beyond_grace: boolean;
  is_unpaid: boolean;
  tx_hash?: string | null;
}

export function recourseQueryKey(invoiceId: string) {
  return ["recourse", invoiceId] as const;
}

/** Coverage ratio equals guarantee amount divided by funded principal (#616). */
export function calculateCoverageRatio(
  guaranteeAmount: number,
  fundedPrincipal: number,
): number {
  if (fundedPrincipal <= 0 || guaranteeAmount <= 0) return 0;
  return guaranteeAmount / fundedPrincipal;
}

/**
 * Investor's potential recovery is proportional to their share of funded
 * principal (#616).
 */
export function calculatePotentialRecovery(
  guaranteeAmount: number,
  fundedPrincipal: number,
  investorPosition: number,
): number {
  if (fundedPrincipal <= 0 || guaranteeAmount <= 0 || investorPosition <= 0) {
    return 0;
  }
  return guaranteeAmount * (investorPosition / fundedPrincipal);
}

async function fetchRecourse(
  invoiceId: string,
): Promise<RecourseGuarantee | null> {
  const res = await fetch(
    `${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/recourse`,
  );
  if (res.status === 404) return null;
  const data = await readApiJson<RecourseGuarantee & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message ?? "Failed to fetch recourse guarantee");
  }
  return data;
}

async function triggerRecourseGuarantee(
  invoiceId: string,
): Promise<{ status: RecourseStatus; tx_hash?: string }> {
  const res = await fetch(
    `${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/recourse/trigger`,
    { method: "POST" },
  );
  const data = await readApiJson<{
    status: RecourseStatus;
    tx_hash?: string;
    message?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.message ?? "Failed to trigger recourse guarantee");
  }
  return data;
}

/** Reads the seller recourse guarantee state for an invoice (#616). */
export function useRecourse(invoiceId: string | undefined) {
  const query = useQuery({
    queryKey: recourseQueryKey(invoiceId ?? ""),
    queryFn: () => fetchRecourse(invoiceId!),
    enabled: Boolean(invoiceId),
    staleTime: 30_000,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
  });

  const guarantee = query.data ?? null;
  const hasGuarantee = Boolean(guarantee?.has_guarantee);
  const coverageRatio = guarantee
    ? calculateCoverageRatio(
        guarantee.guarantee_amount,
        guarantee.funded_principal,
      )
    : 0;
  const canTrigger = Boolean(
    guarantee &&
      hasGuarantee &&
      guarantee.status === "posted" &&
      guarantee.is_past_due_beyond_grace &&
      guarantee.is_unpaid,
  );

  return {
    ...query,
    guarantee,
    hasGuarantee,
    coverageRatio,
    canTrigger,
  };
}

export function useTriggerRecourse(invoiceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => triggerRecourseGuarantee(invoiceId),
    onSuccess: () => {
      toast.success("Seller recourse guarantee triggered");
      queryClient.invalidateQueries({ queryKey: recourseQueryKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to trigger recourse guarantee");
    },
  });
}
