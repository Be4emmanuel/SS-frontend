import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  classifyInstallment,
  investorProportion,
  investorShareOf,
  type RawInstallment,
} from "../installments";
import { normalizeInstallments } from "../api/installments";

const NOW = new Date("2026-03-15T00:00:00Z");

const inst = (
  id: string,
  dueDate: string,
  amount: number,
  paid: number[] = [],
): RawInstallment => ({
  id,
  dueDate,
  amount,
  payments: paid.map((a) => ({ amount: a, paidAt: "2026-02-01T00:00:00Z" })),
});

describe("installment status", () => {
  it("paid: fully covered, no shortfall", () => {
    const r = classifyInstallment(inst("a", "2026-02-01", 1000, [600, 400]), NOW);
    expect(r).toMatchObject({ status: "paid", shortfall: 0, paidAmount: 1000, isOverdue: false });
  });

  it("late: past due with nothing paid", () => {
    expect(classifyInstallment(inst("a", "2026-03-01", 1000), NOW)).toMatchObject({
      status: "late",
      shortfall: 1000,
      isOverdue: true,
    });
  });

  it("partial: some paid, shows the shortfall", () => {
    expect(classifyInstallment(inst("a", "2026-03-01", 1000, [250]), NOW)).toMatchObject({
      status: "partial",
      shortfall: 750,
      isOverdue: true,
    });
  });

  it("upcoming: not due yet and unpaid", () => {
    expect(classifyInstallment(inst("a", "2026-04-01", 1000), NOW)).toMatchObject({
      status: "upcoming",
      isOverdue: false,
    });
  });

  it("caps overpayment at the installment amount", () => {
    expect(classifyInstallment(inst("a", "2026-03-01", 100, [150]), NOW).paidAmount).toBe(100);
  });
});

describe("schedule", () => {
  const raw = [
    inst("c", "2026-05-01", 1000),
    inst("a", "2026-02-01", 1000, [1000]),
    inst("b", "2026-03-01", 1000, [400]),
  ];

  it("lists installments in due-date order", () => {
    expect(buildSchedule(raw, NOW).installments.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("progress equals paid divided by total", () => {
    const s = buildSchedule(raw, NOW);
    expect(s.totalPaid).toBe(1400);
    expect(s.totalAmount).toBe(3000);
    expect(s.progress).toBeCloseTo(1400 / 3000);
  });

  it("flags a missed installment (for the late-interest notice)", () => {
    expect(buildSchedule(raw, NOW).hasMissed).toBe(true);
    expect(buildSchedule([inst("a", "2026-02-01", 10, [10]), inst("b", "2026-06-01", 10)], NOW).hasMissed).toBe(false);
  });

  it("handles an empty plan", () => {
    expect(buildSchedule([], NOW)).toMatchObject({ progress: 0, hasMissed: false });
  });
});

describe("investor share", () => {
  it("equals their proportion of each installment", () => {
    const proportion = investorProportion(2500, 10_000); // 25%
    expect(proportion).toBe(0.25);
    expect(investorShareOf(1000, proportion)).toBe(250);
    expect(investorShareOf(333.33, proportion)).toBe(83.33);
  });

  it("is zero for non-investors or an unfunded invoice", () => {
    expect(investorProportion(0, 10_000)).toBe(0);
    expect(investorProportion(100, 0)).toBe(0);
  });
});

describe("API normalisation", () => {
  it("accepts payments, or a legacy paid_amount total, and drops malformed rows", () => {
    const out = normalizeInstallments({
      installments: [
        { id: "1", due_date: "2026-01-01", amount: 100, payments: [{ amount: 40, paid_at: "2026-01-02" }] },
        { id: "2", due_date: "2026-02-01", amount: 100, paid_amount: 30 },
        { id: "3", amount: 100 },
      ],
    });
    expect(out.installments).toHaveLength(2);
    expect(out.installments[0].payments[0].amount).toBe(40);
    expect(out.installments[1].payments[0].amount).toBe(30);
    expect(out.lateInterestApplies).toBe(true);
  });
});
