import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { GoalAllocation, GoalCandidateInvoice, SavingsGoal } from "@/lib/savingsGoals";
import { SavingsGoalsDashboard } from "../SavingsGoalsDashboard";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
}));

vi.mock("@/hooks/useInvoices", () => ({
  useInvoices: () => ({ data: undefined, isLoading: false, isError: false }),
}));

const GOALS_KEY = "ss_savings_goals";
const ALLOCATIONS_KEY = "ss_savings_goal_allocations";

const NOW = Date.parse("2026-11-24T00:00:00.000Z");
const DAY = 86_400_000;

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "g1",
    name: "Q1 invoice allocation",
    targetAmount: 1000,
    targetDate: "2027-01-01",
    riskTier: "A",
    currency: "USDC",
    state: "active",
    createdAt: new Date(NOW - 10 * DAY).toISOString(),
    updatedAt: new Date(NOW - 10 * DAY).toISOString(),
    ...overrides,
  };
}

function allocation(overrides: Partial<GoalAllocation> = {}): GoalAllocation {
  return {
    id: "a1",
    goalId: "g1",
    invoiceId: "inv-a",
    amount: 300,
    status: "confirmed",
    confirmedAt: new Date(NOW - DAY).toISOString(),
    ...overrides,
  };
}

const CANDIDATES: GoalCandidateInvoice[] = [
  { id: "inv-a", title: "Tier A open", status: "open", amount: 5000, raised: 1000, risk_rating: { tier: "A" }, yield_percentage: 12 },
  { id: "inv-b", title: "Tier B open", status: "open", amount: 5000, raised: 0, risk_rating: { tier: "B" }, yield_percentage: 15 },
  { id: "inv-c", title: "Tier A funded", status: "funded", amount: 5000, raised: 5000, risk_rating: { tier: "A" }, yield_percentage: 9 },
];

function seed(goals: SavingsGoal[], allocations: GoalAllocation[] = []) {
  window.localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  window.localStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(allocations));
}

function renderDashboard() {
  return render(
    <SavingsGoalsDashboard candidateInvoices={CANDIDATES} now={NOW} />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("SavingsGoalsDashboard", () => {
  it("shows an empty state when no goals exist", () => {
    renderDashboard();
    expect(screen.getByTestId("savings-goals-dashboard")).toBeInTheDocument();
    expect(screen.getByText(/No savings goals yet/i)).toBeInTheDocument();
  });

  it("counts confirmed allocations only and recommends tier-matched invoices", () => {
    seed(
      [makeGoal()],
      [
        allocation({ id: "a1", amount: 300, status: "confirmed" }),
        allocation({ id: "a2", amount: 200, status: "pending", confirmedAt: null }),
      ],
    );

    renderDashboard();

    const card = screen.getByTestId("savings-goal-card-g1");
    expect(within(card).getByText(/300 \/ 1,000 USDC/)).toBeInTheDocument();
    expect(within(card).getByText("30%")).toBeInTheDocument();
    expect(within(card).getByText(/200 USDC awaiting confirmation/)).toBeInTheDocument();

    // Only the open, tier-A invoice with capacity is recommended.
    expect(
      within(card).getByTestId("savings-goal-recommendation-g1-inv-a"),
    ).toBeInTheDocument();
    expect(
      within(card).queryByTestId("savings-goal-recommendation-g1-inv-b"),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByTestId("savings-goal-recommendation-g1-inv-c"),
    ).not.toBeInTheDocument();
  });

  it("marks a goal missed and notifies once the target date passes", () => {
    seed([makeGoal({ targetDate: "2026-11-01" })]);

    renderDashboard();

    expect(screen.getByTestId("savings-goal-status-g1")).toHaveTextContent("Missed");
    const notice = screen.getByTestId("savings-goal-notification-g1-missed");
    expect(notice).toHaveTextContent(/missed its 2026-11-01 target/i);
  });

  it("celebrates a completed goal and hides recommendations for it", () => {
    seed([makeGoal()], [allocation({ amount: 1000, status: "confirmed" })]);

    renderDashboard();

    const card = screen.getByTestId("savings-goal-card-g1");
    expect(screen.getByTestId("savings-goal-status-g1")).toHaveTextContent(
      "Completed",
    );
    expect(
      screen.getByTestId("savings-goal-notification-g1-completed"),
    ).toBeInTheDocument();
    expect(
      within(card).queryByTestId("savings-goal-recommendations-g1"),
    ).not.toBeInTheDocument();
  });

  it("pauses and resumes a goal", () => {
    seed([makeGoal()]);

    renderDashboard();

    fireEvent.click(screen.getByTestId("savings-goal-pause-g1"));
    expect(screen.getByTestId("savings-goal-status-g1")).toHaveTextContent("Paused");

    fireEvent.click(screen.getByTestId("savings-goal-resume-g1"));
    expect(screen.getByTestId("savings-goal-status-g1")).toHaveTextContent("Active");
  });

  it("deletes a goal", () => {
    seed([makeGoal()]);

    renderDashboard();

    fireEvent.click(screen.getByTestId("savings-goal-delete-g1"));
    expect(screen.queryByTestId("savings-goal-card-g1")).not.toBeInTheDocument();
    expect(screen.getByText(/No savings goals yet/i)).toBeInTheDocument();
  });

  it("creates a new goal from the form", () => {
    renderDashboard();

    fireEvent.click(screen.getByTestId("savings-goal-new"));
    fireEvent.change(screen.getByTestId("savings-goal-form-name"), {
      target: { value: "Q2 draft" },
    });
    fireEvent.change(screen.getByTestId("savings-goal-form-amount"), {
      target: { value: "2500" },
    });
    fireEvent.change(screen.getByTestId("savings-goal-form-date"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByTestId("savings-goal-form-submit"));

    expect(screen.getByText("Q2 draft")).toBeInTheDocument();
    expect(screen.queryByTestId("savings-goal-form")).not.toBeInTheDocument();
  });

  it("logs a confirmed investment that advances progress", () => {
    seed([makeGoal()]);

    renderDashboard();

    fireEvent.click(screen.getByTestId("savings-goal-log-g1"));
    fireEvent.change(screen.getByTestId("savings-goal-log-amount-g1"), {
      target: { value: "400" },
    });
    fireEvent.click(screen.getByTestId("savings-goal-log-submit-g1"));

    const card = screen.getByTestId("savings-goal-card-g1");
    expect(within(card).getByText(/400 \/ 1,000 USDC/)).toBeInTheDocument();
    expect(within(card).getByText("40%")).toBeInTheDocument();
  });
});
