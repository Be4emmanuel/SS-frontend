/**
 * Installment schedule client (#776).
 *
 *   GET /invoices/:id/installments
 *     -> { installments: [{ id, due_date, amount, payments: [{ amount, paid_at, tx_hash }] }],
 *          late_interest_applies?: boolean }
 *
 * A 404 means the debtor is not on a payment plan (single due date).
 */

import type { InstallmentPayment, RawInstallment } from "@/lib/installments";
import { API_BASE, ApiError, isNotFound, readApiJson } from "./shared";

export interface InstallmentsResponse {
  installments: RawInstallment[];
  lateInterestApplies: boolean;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeInstallments(payload: unknown): InstallmentsResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  const list = Array.isArray(root.installments) ? root.installments : [];
  const installments: RawInstallment[] = [];
  for (const item of list) {
    const raw = item as Record<string, unknown>;
    const id = raw.id;
    const dueDate = raw.due_date ?? raw.dueDate;
    if (typeof id !== "string" || typeof dueDate !== "string") continue;
    const payments: InstallmentPayment[] = Array.isArray(raw.payments)
      ? raw.payments.map((p) => {
          const pay = p as Record<string, unknown>;
          return {
            amount: num(pay.amount),
            paidAt: typeof (pay.paid_at ?? pay.paidAt) === "string" ? ((pay.paid_at ?? pay.paidAt) as string) : null,
            txHash: typeof (pay.tx_hash ?? pay.txHash) === "string" ? ((pay.tx_hash ?? pay.txHash) as string) : null,
          };
        })
      : // Older payloads only carry a paid total.
        raw.paid_amount != null && num(raw.paid_amount) > 0
        ? [{ amount: num(raw.paid_amount), paidAt: null }]
        : [];
    installments.push({ id, dueDate, amount: num(raw.amount), payments });
  }
  return {
    installments,
    lateInterestApplies: Boolean(root.late_interest_applies ?? root.lateInterestApplies ?? true),
  };
}

export async function fetchInstallments(invoiceId: string): Promise<InstallmentsResponse | null> {
  const res = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}/installments`);
  if (isNotFound(new ApiError(res.status, ""))) return null;
  if (!res.ok) throw new ApiError(res.status, "Failed to fetch installments");
  return normalizeInstallments(await readApiJson<unknown>(res));
}
