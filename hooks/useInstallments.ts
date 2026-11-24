"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchInstallments } from "@/lib/api/installments";
import { buildSchedule, type InstallmentSchedule } from "@/lib/installments";

export const installmentsQueryKey = (invoiceId: string) =>
  ["invoice", invoiceId, "installments"] as const;

export interface UseInstallmentsResult {
  schedule: InstallmentSchedule | null;
  /** The debtor has a payment plan (at least one installment). */
  hasPlan: boolean;
  lateInterestApplies: boolean;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The installment schedule and matched payments for one invoice (#776).
 * `schedule` is null when there is no plan, so callers can fall back to the
 * single due date.
 */
export function useInstallments(
  invoiceId: string | null | undefined,
  now?: Date,
): UseInstallmentsResult {
  const query = useQuery({
    queryKey: installmentsQueryKey(invoiceId ?? ""),
    queryFn: () => fetchInstallments(invoiceId as string),
    enabled: Boolean(invoiceId),
    staleTime: 30_000,
    retry: false,
  });

  const schedule = useMemo(
    () =>
      query.data && query.data.installments.length > 0
        ? buildSchedule(query.data.installments, now)
        : null,
    [query.data, now],
  );

  return {
    schedule,
    hasPlan: schedule !== null,
    lateInterestApplies: query.data?.lateInterestApplies ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
