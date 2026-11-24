import { describe, expect, it } from "vitest";
import {
  buildGoalNotifications,
  buildGoalSummary,
  calculateGoalPace,
  calculateGoalProgress,
  createSavingsGoal,
  deleteSavingsGoal,
  deriveGoalStatus,
  filterInvoicesForActiveGoals,
  getDaysRemaining,
  isGoalMissed,
  matchesGoalCriteria,
  pauseSavingsGoal,
  recommendInvoicesForGoal,
  resumeSavingsGoal,
  updateSavingsGoal,
  type GoalAllocation,
  type GoalCandidateInvoice,
  type SavingsGoal,
} from "../savingsGoals";

/** Day index anchor: 2026-11-24T00:00:00Z. */
const NOW = Date.parse("2026-11-24T00:00:00.000Z");

function makeGoal(overrides: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "goal-1",
    name: "Q4 trade finance allocation",
    targetAmount: 100_000,
    targetDate: "2026-12-24",
    riskTier: "A",
    currency: "USDC",
    state: "active",
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
    ...overrides,
  };
}

function confirmed(id: string, amount: number): GoalAllocation {
  return {
    id,
    goalId: "goal-1",
    invoiceId: `INV-${id}`,
    amount,
    status: "confirmed",
    confirmedAt: "2026-11-10T00:00:00.000Z",
  };
}

function pending(id: string, amount: number): GoalAllocation {
  return {
    id,
    goalId: "goal-1",
    invoiceId: `INV-${id}`,
    amount,
    status: "pending",
    confirmedAt: null,
  };
}

const CANDIDATES: GoalCandidateInvoice[] = [
  {
    id: "INV-A",
    title: "Freight receivable",
    status: "open",
    amount: 10_000,
    raised: 2_000,
    risk_rating: { tier: "A" },
    yield_percentage: 8,
  },
  {
    id: "INV-B",
    title: "Equipment lease",
    status: "open",
    amount: 10_000,
    raised: 2_000,
    risk_rating: { tier: "A" },
    yield_percentage: 12,
  },
  {
    id: "INV-C",
    title: "SME invoice",
    status: "open",
    amount: 10_000,
    raised: 0,
    risk_tier: "B",
    yield_percentage: 20,
  },
  {
    id: "INV-D",
    title: "Fully raised receivable",
    status: "open",
    amount: 5_000,
    raised: 5_000,
    risk_rating: { tier: "A" },
    yield_percentage: 30,
  },
  {
    id: "INV-E",
    title: "Already funded invoice",
    status: "funded",
    amount: 10_000,
    raised: 0,
    risk_rating: { tier: "A" },
    yield_percentage: 5,
  },
];

describe("savingsGoals progress", () => {
  it("counts confirmed allocations only and reports pending separately", () => {
    const goal = makeGoal();
    const allocations = [confirmed("a", 20_000), pending("b", 5_000)];

    const progress = calculateGoalProgress(goal, allocations);

    expect(progress.confirmedAmount).toBe(20_000);
    expect(progress.pendingAmount).toBe(5_000);
    expect(progress.remainingAmount).toBe(80_000);
    expect(progress.progressPercent).toBe(20);
    expect(progress.met).toBe(false);
    expect(progress.confirmedCount).toBe(1);
  });

  it("ignores allocations belonging to another goal", () => {
    const goal = makeGoal();
    const other = { ...confirmed("x", 50_000), goalId: "goal-2" };

    expect(calculateGoalProgress(goal, [other]).confirmedAmount).toBe(0);
  });

  it("marks the goal met once confirmed allocations reach the target", () => {
    const goal = makeGoal({ targetAmount: 30_000 });
    const progress = calculateGoalProgress(goal, [
      confirmed("a", 20_000),
      confirmed("b", 10_000),
    ]);

    expect(progress.confirmedAmount).toBe(30_000);
    expect(progress.remainingAmount).toBe(0);
    expect(progress.progressPercent).toBe(100);
    expect(progress.met).toBe(true);
  });
});

describe("savingsGoals pace and projection", () => {
  it("projects completion from the current confirmed pace", () => {
    const goal = makeGoal();
    const pace = calculateGoalPace(goal, [confirmed("a", 20_000)], NOW);

    // 20 days elapsed since creation -> 1,000/day; 80,000 still to go.
    expect(pace.daysElapsed).toBe(20);
    expect(pace.daysRemaining).toBe(30);
    expect(pace.currentRatePerDay).toBe(1_000);
    expect(pace.requiredRatePerDay).toBeCloseTo(2_666.67, 1);
    expect(pace.projectedCompletionDate).toBe("2027-02-12");
    expect(pace.onTrack).toBe(false);
  });

  it("updates the projection after a further investment is confirmed", () => {
    const goal = makeGoal();
    const before = calculateGoalPace(goal, [confirmed("a", 20_000)], NOW);
    const after = calculateGoalPace(
      goal,
      [confirmed("a", 20_000), confirmed("b", 60_000)],
      NOW,
    );

    expect(after.currentRatePerDay).toBe(4_000);
    expect(after.projectedCompletionDate).toBe("2026-11-29");
    expect(after.onTrack).toBe(true);
    expect(after.projectedCompletionDate).not.toBe(before.projectedCompletionDate);
  });

  it("returns no projection when nothing has been confirmed", () => {
    const goal = makeGoal();
    const pace = calculateGoalPace(goal, [], NOW);

    expect(pace.currentRatePerDay).toBe(0);
    expect(pace.projectedCompletionDate).toBeNull();
    expect(pace.onTrack).toBe(false);
  });

  it("has no required rate once the deadline has passed", () => {
    const goal = makeGoal({ targetDate: "2026-11-10" });
    const pace = calculateGoalPace(goal, [confirmed("a", 20_000)], NOW);

    expect(pace.daysRemaining).toBeLessThan(0);
    expect(pace.requiredRatePerDay).toBeNull();
  });
});

describe("savingsGoals missed targets", () => {
  it("stays active before the target date", () => {
    const goal = makeGoal();
    const allocations = [confirmed("a", 20_000)];

    expect(isGoalMissed(goal, allocations, NOW)).toBe(false);
    expect(deriveGoalStatus(goal, allocations, NOW)).toBe("active");
    expect(buildGoalNotifications(goal, allocations, NOW)).toHaveLength(0);
  });

  it("appears as missed once the date passes short of the target", () => {
    const goal = makeGoal({ targetDate: "2026-11-10" });
    const allocations = [confirmed("a", 20_000)];

    expect(getDaysRemaining(goal.targetDate, NOW)).toBeLessThan(0);
    expect(isGoalMissed(goal, allocations, NOW)).toBe(true);
    expect(deriveGoalStatus(goal, allocations, NOW)).toBe("missed");

    const notifications = buildGoalNotifications(goal, allocations, NOW);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe("missed");
    expect(notifications[0].severity).toBe("danger");
    expect(notifications[0].message).toContain("missed its 2026-11-10 target");
  });

  it("does not flag a goal that met its target before the date passed", () => {
    const goal = makeGoal({ targetAmount: 20_000, targetDate: "2026-11-10" });

    expect(deriveGoalStatus(goal, [confirmed("a", 20_000)], NOW)).toBe(
      "completed",
    );
  });

  it("emits a completion notification when the target is reached", () => {
    const goal = makeGoal({ targetAmount: 20_000 });
    const notifications = buildGoalNotifications(goal, [confirmed("a", 20_000)], NOW);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe("completed");
    expect(notifications[0].severity).toBe("success");
  });

  it("summarises active and missed goals together", () => {
    const active = makeGoal({ id: "goal-active" });
    const missed = makeGoal({ id: "goal-missed", targetDate: "2026-11-10" });
    const allocations = [
      { ...confirmed("a", 10_000), goalId: "goal-active" },
      { ...confirmed("b", 10_000), goalId: "goal-missed" },
    ];

    const activeSummary = buildGoalSummary(active, allocations, NOW);
    const missedSummary = buildGoalSummary(missed, allocations, NOW);

    expect(activeSummary.status).toBe("active");
    expect(activeSummary.notifications).toHaveLength(0);
    expect(missedSummary.status).toBe("missed");
    expect(missedSummary.notifications).toHaveLength(1);
  });
});

describe("savingsGoals lifecycle", () => {
  it("creates a goal with defaults and updates timestamps", () => {
    const goal = createSavingsGoal(
      {
        name: "  Build a reserve  ",
        targetAmount: 50_000,
        targetDate: "2026-12-31",
        riskTier: "B",
      },
      NOW,
    );

    expect(goal.name).toBe("Build a reserve");
    expect(goal.currency).toBe("USDC");
    expect(goal.state).toBe("active");
    expect(goal.createdAt).toBe("2026-11-24T00:00:00.000Z");
    expect(goal.updatedAt).toBe(goal.createdAt);
  });

  it("edits a goal's target, date and risk tier", () => {
    const goals = [makeGoal()];
    const updated = updateSavingsGoal(
      goals,
      "goal-1",
      { targetAmount: 250_000, targetDate: "2027-01-31", riskTier: "C" },
      NOW,
    );

    expect(updated[0].targetAmount).toBe(250_000);
    expect(updated[0].targetDate).toBe("2027-01-31");
    expect(updated[0].riskTier).toBe("C");
    expect(updated[0].updatedAt).toBe("2026-11-24T00:00:00.000Z");
  });

  it("pauses and resumes a goal", () => {
    const paused = pauseSavingsGoal([makeGoal()], "goal-1", NOW);
    expect(paused[0].state).toBe("paused");
    expect(deriveGoalStatus(paused[0], [confirmed("a", 20_000)], NOW)).toBe(
      "paused",
    );

    const resumed = resumeSavingsGoal(paused, "goal-1", NOW);
    expect(resumed[0].state).toBe("active");
  });

  it("suppresses notifications while a goal is paused", () => {
    const paused = makeGoal({
      targetDate: "2026-11-10",
      state: "paused",
    });

    expect(buildGoalNotifications(paused, [confirmed("a", 20_000)], NOW)).toEqual(
      [],
    );
    expect(deriveGoalStatus(paused, [confirmed("a", 20_000)], NOW)).toBe("paused");
  });

  it("deletes a goal", () => {
    const goals = [makeGoal(), makeGoal({ id: "goal-2" })];
    const remaining = deleteSavingsGoal(goals, "goal-1");

    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("goal-2");
  });
});

describe("savingsGoals recommendation filtering", () => {
  it("matches only open invoices carrying the goal's risk tier with capacity", () => {
    const goal = makeGoal({ riskTier: "A" });

    expect(matchesGoalCriteria(goal, CANDIDATES[0])).toBe(true);
    // B tier does not match an A goal
    expect(matchesGoalCriteria(goal, CANDIDATES[2])).toBe(false);
    // fully raised has no remaining capacity
    expect(matchesGoalCriteria(goal, CANDIDATES[3])).toBe(false);
    // funded invoices are no longer investable
    expect(matchesGoalCriteria(goal, CANDIDATES[4])).toBe(false);
  });

  it("rejects unrated invoices rather than guessing a tier", () => {
    const goal = makeGoal({ riskTier: "A" });
    const unrated: GoalCandidateInvoice = {
      id: "INV-Z",
      title: "Unrated",
      status: "open",
      amount: 1_000,
    };

    expect(matchesGoalCriteria(goal, unrated)).toBe(false);
  });

  it("normalises the coarse risk_tier string", () => {
    const goal = makeGoal({ riskTier: "B" });
    expect(matchesGoalCriteria(goal, CANDIDATES[2])).toBe(true);
  });

  it("orders recommendations by yield and respects the limit", () => {
    const goal = makeGoal({ riskTier: "A" });
    const recommendations = recommendInvoicesForGoal(goal, CANDIDATES);

    expect(recommendations.map((invoice) => invoice.id)).toEqual([
      "INV-B",
      "INV-A",
    ]);

    expect(recommendInvoicesForGoal(goal, CANDIDATES, 1).map((i) => i.id)).toEqual(
      ["INV-B"],
    );
  });

  it("drives a shared filter across active goals only", () => {
    const active = makeGoal({ id: "goal-a", riskTier: "A" });
    const paused = makeGoal({ id: "goal-b", riskTier: "B", state: "paused" });

    const matched = filterInvoicesForActiveGoals([active, paused], CANDIDATES);

    // Only the A-tier matches survive; the paused B goal does not contribute.
    expect(matched.map((invoice) => invoice.id)).toEqual(["INV-A", "INV-B"]);
  });
});
