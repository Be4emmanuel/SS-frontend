"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchInvoiceDetail, fetchPortfolio, type InvoiceDetail } from "@/lib/api";

export type CashFlowRange = "3m" | "6m" | "12m";

export interface CashFlowInvoice {
  invoiceId: string;
  title: string;
  principal: number;
  yieldAmount: number;
  dueDate: string;
  overdue: boolean;
}

export interface CashFlowDay {
  date: string;
  invoices: CashFlowInvoice[];
  principal: number;
  yieldAmount: number;
}

export function useExpectedCashFlow(range: CashFlowRange) {
  return useQuery({
    queryKey: ["expected-cash-flow", range],
    queryFn: async () => {
      const portfolio = await fetchPortfolio();
      const active = portfolio.positions.filter((position) => position.status === "active");
      const details = await Promise.all(
        active.map(async (position) => {
          try {
            return await fetchInvoiceDetail(position.invoice_id);
          } catch {
            return null;
          }
        }),
      );

      const now = new Date();
      const end = new Date(now);
      const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
      end.setMonth(end.getMonth() + months);

      const days = new Map<string, CashFlowDay>();
      active.forEach((position, index) => {
        const invoice = details[index] as InvoiceDetail | null;
        const dueDate = invoice?.maturity_date ?? invoice?.due_date ?? position.lockup_expires_at;
        if (!dueDate) return;
        const date = new Date(dueDate);
        if (Number.isNaN(date.getTime()) || date > end) return;

        const key = date.toISOString().slice(0, 10);
        const principal = position.committed_amount;
        const annualYield = invoice?.yield_percentage ?? 0;
        const daysRemaining = Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86_400_000));
        const yieldAmount = principal * (annualYield / 100) * (daysRemaining / 365);
        const overdue = date.getTime() < now.getTime();
        const invoiceProjection: CashFlowInvoice = {
          invoiceId: position.invoice_id,
          title: position.invoice_title,
          principal,
          yieldAmount,
          dueDate: key,
          overdue,
        };
        const existing = days.get(key);
        if (existing) {
          existing.invoices.push(invoiceProjection);
          existing.principal += principal;
          existing.yieldAmount += yieldAmount;
        } else {
          days.set(key, {
            date: key,
            invoices: [invoiceProjection],
            principal,
            yieldAmount,
          });
        }
      });

      return {
        openPositionCount: active.length,
        days: Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date)),
      };
    },
  });
}
