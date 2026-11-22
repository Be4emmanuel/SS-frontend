"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_BASE, readApiJson } from "@/lib/api/shared";
import { PORTFOLIO_QUERY_KEY } from "./usePortfolio";
import { stellarExplorerTxUrl } from "@/components/ui/tx-hash";

export type SettleIneligibleReason =
  | "unpaid"
  | "disputed"
  | "already_settled"
  | string;

export interface SettleableStatus {
  invoice_id: string;
  is_settleable: boolean;
  bounty_amount: number;
  estimated_network_fee: number;
  ineligible_reason?: SettleIneligibleReason | null;
  tx_hash?: string | null;
}

export interface SettleableInvoiceItem {
  invoice_id: string;
  invoice_title: string;
  amount: number;
  bounty_amount: number;
  estimated_network_fee: number;
  due_date?: string | null;
}

export interface SettleInvoiceResult {
  tx_hash: string;
  bounty_paid?: number;
  settled_at?: string;
}

export function settleableQueryKey(invoiceId: string) {
  return ["settleable", invoiceId] as const;
}

export const SETTLEABLE_LIST_QUERY_KEY = ["settleable-invoices"] as const;

async function fetchSettleableStatus(invoiceId: string): Promise<SettleableStatus> {
  const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/settleable`);
  const data = await readApiJson<SettleableStatus & { message?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message ?? "Failed to fetch settleable status");
  }
  return data;
}

async function fetchSettleableInvoices(): Promise<SettleableInvoiceItem[]> {
  const res = await fetch(`${API_BASE}/invoices/settleable`);
  const data = await readApiJson<{ invoices?: SettleableInvoiceItem[]; message?: string } | SettleableInvoiceItem[]>(res);
  if (!res.ok) {
    const msg = !Array.isArray(data) ? data.message : undefined;
    throw new Error(msg ?? "Failed to fetch eligible invoices");
  }
  return Array.isArray(data) ? data : (data.invoices ?? []);
}

async function triggerInvoiceSettlement(invoiceId: string): Promise<SettleInvoiceResult> {
  const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/settle`, {
    method: "POST",
  });
  const data = await readApiJson<SettleInvoiceResult & { message?: string; error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? "Failed to settle invoice");
  }
  return data;
}

/** Reads `is_settleable` and keeper bounty details for a single invoice (#617). */
export function useSettleable(invoiceId: string | undefined) {
  return useQuery({
    queryKey: settleableQueryKey(invoiceId ?? ""),
    queryFn: () => fetchSettleableStatus(invoiceId!),
    enabled: Boolean(invoiceId),
    staleTime: 15_000,
  });
}

/** Lists all invoices currently eligible for permissionless settlement (#617). */
export function useSettleableInvoices() {
  return useQuery({
    queryKey: SETTLEABLE_LIST_QUERY_KEY,
    queryFn: fetchSettleableInvoices,
    staleTime: 15_000,
  });
}

/** Triggers permissionless settlement and refreshes invoice & payout queries (#617). */
export function useTriggerSettlement(invoiceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => triggerInvoiceSettlement(invoiceId),
    onSuccess: (result) => {
      const txUrl = result.tx_hash ? stellarExplorerTxUrl(result.tx_hash) : null;
      toast.success("Invoice settled successfully", {
        description: result.tx_hash
          ? `Transaction ${result.tx_hash.slice(0, 8)}…`
          : undefined,
        action: txUrl
          ? {
              label: "View transaction",
              onClick: () => {
                window.open(txUrl, "_blank", "noopener,noreferrer");
              },
            }
          : undefined,
      });

      queryClient.invalidateQueries({ queryKey: settleableQueryKey(invoiceId) });
      queryClient.invalidateQueries({ queryKey: SETTLEABLE_LIST_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["settlements"] });
      queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["issuer-earnings"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to settle invoice");
    },
  });
}
