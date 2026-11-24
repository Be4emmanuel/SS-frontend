/**
 * Installment schedule maths for debtors on a payment plan (#776).
 *
 * Pure functions: the schedule comes from the API, statuses, shortfalls,
 * investor shares and progress are derived here so they are testable.
 */

export interface InstallmentPayment {
  amount: number;
  paidAt: string | null;
  txHash?: string | null;
}

export interface RawInstallment {
  id: string;
  dueDate: string;
  amount: number;
  /** Payments matched to this installment. */
  payments: InstallmentPayment[];
}

export type InstallmentStatus = "upcoming" | "paid" | "late" | "partial";

export interface Installment extends RawInstallment {
  paidAmount: number;
  status: InstallmentStatus;
  /** Amount still owed on this installment (0 when paid). */
  shortfall: number;
  /** Past due and not fully paid. */
  isOverdue: boolean;
}

export interface InstallmentSchedule {
  installments: Installment[];
  totalAmount: number;
  totalPaid: number;
  /** paid / total, 0..1. */
  progress: number;
  /** At least one installment is past due and unpaid or short. */
  hasMissed: boolean;
}

const EPSILON = 1e-9;

export function paidAmountOf(raw: RawInstallment): number {
  return raw.payments.reduce((sum, p) => sum + p.amount, 0);
}

export function classifyInstallment(raw: RawInstallment, now: Date): Installment {
  const paidAmount = Math.min(paidAmountOf(raw), raw.amount);
  const fullyPaid = raw.amount - paidAmount <= EPSILON;
  const isOverdue = !fullyPaid && new Date(raw.dueDate).getTime() < now.getTime();

  let status: InstallmentStatus;
  if (fullyPaid) status = "paid";
  else if (paidAmount > EPSILON) status = "partial";
  else status = isOverdue ? "late" : "upcoming";

  return {
    ...raw,
    paidAmount,
    status,
    shortfall: fullyPaid ? 0 : round2(raw.amount - paidAmount),
    isOverdue,
  };
}

/** Installments in due-date order (ties keep input order), with statuses and totals. */
export function buildSchedule(raw: RawInstallment[], now = new Date()): InstallmentSchedule {
  const installments = raw
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        new Date(a.r.dueDate).getTime() - new Date(b.r.dueDate).getTime() || a.i - b.i,
    )
    .map(({ r }) => classifyInstallment(r, now));

  const totalAmount = installments.reduce((s, i) => s + i.amount, 0);
  const totalPaid = installments.reduce((s, i) => s + i.paidAmount, 0);
  return {
    installments,
    totalAmount,
    totalPaid,
    progress: totalAmount > 0 ? Math.min(1, totalPaid / totalAmount) : 0,
    hasMissed: installments.some((i) => i.isOverdue),
  };
}

/**
 * The investor's share of an amount: their proportion of the invoice.
 * `position` and `totalRaised` use the same unit.
 */
export function investorProportion(position: number, totalRaised: number): number {
  if (!(position > 0) || !(totalRaised > 0)) return 0;
  return Math.min(1, position / totalRaised);
}

export function investorShareOf(installmentAmount: number, proportion: number): number {
  return round2(installmentAmount * proportion);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const STATUS_LABELS: Record<InstallmentStatus, string> = {
  upcoming: "Upcoming",
  paid: "Paid",
  late: "Late",
  partial: "Partially paid",
};
