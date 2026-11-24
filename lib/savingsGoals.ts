/**
 * Investor savings goals for invoice funding (#662).
 *
 * An investor sets a target amount to deploy into invoices by a date, limited
 * to a risk tier. Everything here is pure so progress, pace, missed-target
 * detection, notifications and goal-driven recommendation filtering can be
 * unit tested without a renderer.
 *
 * Progress counts confirmed allocations only: a commitment that is still
 * awaiting on-chain confirmation must not move the bar, otherwise the goal
 * would show funds the investor has not actually committed yet.
 */

export type RiskTier = "A" | "B" | "C" | "D";

export const RISK_TIERS: RiskTier[] = ["A", "B", "C", "D"];

/** Persisted goal state. `completed`/`missed` are derived, never stored. */
export type SavingsGoalState = "active" | "paused";

/** Full goal status, including the derived terminal states. */
export type GoalStatus = "active" | "paused" | "completed" | "missed";

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  /** ISO date (YYYY-MM-DD) by which the target should be met. */
  targetDate: string;
  /** Risk tier the goal is willing to fund; drives recommendations. */
  riskTier: RiskTier;
  currency: string;
  state: SavingsGoalState;
  createdAt: string;
  updatedAt: string;
}

export type AllocationStatus = "pending" | "confirmed";

export interface GoalAllocation {
  id: string;
  goalId: string;
  invoiceId: string;
  invoiceTitle?: string;
  amount: number;
  status: AllocationStatus;
  /** ISO timestamp the commitment was confirmed, or null while pending. */
  confirmedAt: string | null;
}

export interface GoalProgress {
  /** Sum of confirmed allocations only. */
  confirmedAmount: number;
  /** Sum of allocations still awaiting confirmation. */
  pendingAmount: number;
  remainingAmount: number;
  progressPercent: number;
  met: boolean;
  confirmedCount: number;
}

export interface GoalPace {
  daysElapsed: number;
  daysRemaining: number;
  /** Confirmed amount added per day since the goal was created. */
  currentRatePerDay: number;
  /** Amount per day still needed to hit the target; null once overdue. */
  requiredRatePerDay: number | null;
  /** ISO date the target is projected to be reached, or null if pace is zero. */
  projectedCompletionDate: string | null;
  onTrack: boolean;
}

export type GoalNotificationKind = "completed" | "missed";

export interface GoalNotification {
  id: string;
  goalId: string;
  goalName: string;
  kind: GoalNotificationKind;
  severity: "success" | "danger";
  message: string;
}

export interface GoalSummary {
  goal: SavingsGoal;
  status: GoalStatus;
  progress: GoalProgress;
  pace: GoalPace;
  notifications: GoalNotification[];
}

/** Minimal invoice shape a goal is matched against. `Invoice` is assignable. */
export interface GoalCandidateInvoice {
  id: string;
  title: string;
  status?: string;
  amount: number;
  raised?: number;
  risk_rating?: { tier: RiskTier } | null;
  risk_tier?: string | null;
  yield_percentage?: number | null;
}

export interface SavingsGoalInput {
  name: string;
  targetAmount: number;
  targetDate: string;
  riskTier: RiskTier;
  currency?: string;
}

export const GOAL_DAY_MS = 86_400_000;

const DEFAULT_CURRENCY = "USDC";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function dayIndex(time: number): number {
  return Math.floor(time / GOAL_DAY_MS);
}

/** Day index of a YYYY-MM-DD string, or NaN when unparseable. */
function dateIndex(dateStr: string): number {
  const parsed = Date.parse(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(parsed) ? NaN : dayIndex(parsed);
}

function toDateString(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Whole days between the target date and `now`. Counting whole calendar days
 * rather than a raw millisecond diff means the target date itself reads as 0
 * days remaining no matter what time of day the goal is evaluated.
 */
export function getDaysRemaining(targetDate: string, now: number = Date.now()): number {
  const target = dateIndex(targetDate);
  if (Number.isNaN(target)) return 0;
  return target - dayIndex(now);
}

// ---------------------------------------------------------------------------
// Progress and pace
// ---------------------------------------------------------------------------

function allocationsForGoal(
  goalId: string,
  allocations: GoalAllocation[],
): GoalAllocation[] {
  return allocations.filter((allocation) => allocation.goalId === goalId);
}

/**
 * Progress against the goal. Only `confirmed` allocations count; `pending`
 * commitments are reported separately so the UI can show them without letting
 * them inflate progress.
 */
export function calculateGoalProgress(
  goal: SavingsGoal,
  allocations: GoalAllocation[],
): GoalProgress {
  let confirmedAmount = 0;
  let pendingAmount = 0;
  let confirmedCount = 0;

  for (const allocation of allocationsForGoal(goal.id, allocations)) {
    if (allocation.status === "confirmed") {
      confirmedAmount += allocation.amount;
      confirmedCount++;
    } else {
      pendingAmount += allocation.amount;
    }
  }

  const target = Math.max(0, goal.targetAmount);
  const remainingAmount = Math.max(0, target - confirmedAmount);
  const met = confirmedAmount >= target && target > 0;
  const progressPercent =
    target > 0 ? round2(Math.min(100, (confirmedAmount / target) * 100)) : 0;

  return {
    confirmedAmount: round2(confirmedAmount),
    pendingAmount: round2(pendingAmount),
    remainingAmount: round2(remainingAmount),
    progressPercent,
    met,
    confirmedCount,
  };
}

/**
 * Funding pace from confirmed allocations, and the completion date projected
 * from that pace. Recomputing after an investment is what makes the projection
 * move: the confirmed total changes, so the rate and the projection do too.
 */
export function calculateGoalPace(
  goal: SavingsGoal,
  allocations: GoalAllocation[],
  now: number = Date.now(),
): GoalPace {
  const progress = calculateGoalProgress(goal, allocations);

  const created = Date.parse(goal.createdAt);
  const daysElapsed = Number.isNaN(created)
    ? 0
    : Math.max(0, dayIndex(now) - dayIndex(created));

  const daysRemaining = getDaysRemaining(goal.targetDate, now);

  const currentRatePerDay = round2(
    progress.confirmedAmount / Math.max(1, daysElapsed),
  );

  const requiredRatePerDay =
    progress.met || daysRemaining <= 0
      ? null
      : round2(progress.remainingAmount / daysRemaining);

  let projectedCompletionDate: string | null = null;
  if (progress.met) {
    projectedCompletionDate = toDateString(now);
  } else if (currentRatePerDay > 0) {
    const daysToComplete = progress.remainingAmount / currentRatePerDay;
    projectedCompletionDate = toDateString(now + daysToComplete * GOAL_DAY_MS);
  }

  const onTrack =
    progress.met ||
    (projectedCompletionDate !== null &&
      projectedCompletionDate <= goal.targetDate);

  return {
    daysElapsed,
    daysRemaining,
    currentRatePerDay,
    requiredRatePerDay,
    projectedCompletionDate,
    onTrack,
  };
}

/** A goal is missed once its target date has fully passed, short of the target. */
export function isGoalMissed(
  goal: SavingsGoal,
  allocations: GoalAllocation[],
  now: number = Date.now(),
): boolean {
  if (goal.state === "paused") return false;
  const progress = calculateGoalProgress(goal, allocations);
  if (progress.met) return false;
  return getDaysRemaining(goal.targetDate, now) < 0;
}

export function deriveGoalStatus(
  goal: SavingsGoal,
  allocations: GoalAllocation[],
  now: number = Date.now(),
): GoalStatus {
  if (goal.state === "paused") return "paused";
  const progress = calculateGoalProgress(goal, allocations);
  if (progress.met) return "completed";
  if (isGoalMissed(goal, allocations, now)) return "missed";
  return "active";
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function buildGoalNotifications(
  goal: SavingsGoal,
  allocations: GoalAllocation[],
  now: number = Date.now(),
): GoalNotification[] {
  // A paused goal is a deliberate hold, so it neither celebrates nor nags.
  if (goal.state === "paused") return [];

  const progress = calculateGoalProgress(goal, allocations);

  if (progress.met) {
    return [
      {
        id: `${goal.id}-completed`,
        goalId: goal.id,
        goalName: goal.name,
        kind: "completed",
        severity: "success",
        message: `Goal "${goal.name}" reached its ${goal.targetAmount.toLocaleString()} ${goal.currency} target.`,
      },
    ];
  }

  if (isGoalMissed(goal, allocations, now)) {
    return [
      {
        id: `${goal.id}-missed`,
        goalId: goal.id,
        goalName: goal.name,
        kind: "missed",
        severity: "danger",
        message: `Goal "${goal.name}" missed its ${goal.targetDate} target by ${progress.remainingAmount.toLocaleString()} ${goal.currency}.`,
      },
    ];
  }

  return [];
}

export function buildGoalSummary(
  goal: SavingsGoal,
  allocations: GoalAllocation[],
  now: number = Date.now(),
): GoalSummary {
  return {
    goal,
    status: deriveGoalStatus(goal, allocations, now),
    progress: calculateGoalProgress(goal, allocations),
    pace: calculateGoalPace(goal, allocations, now),
    notifications: buildGoalNotifications(goal, allocations, now),
  };
}

export function buildGoalNotificationsForAll(
  goals: SavingsGoal[],
  allocations: GoalAllocation[],
  now: number = Date.now(),
): GoalNotification[] {
  return goals.flatMap((goal) => buildGoalNotifications(goal, allocations, now));
}

// ---------------------------------------------------------------------------
// Goal mutations
// ---------------------------------------------------------------------------

function generateId(prefix: string, now: number): string {
  return `${prefix}-${now}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createSavingsGoal(
  input: SavingsGoalInput,
  now: number = Date.now(),
): SavingsGoal {
  const timestamp = new Date(now).toISOString();
  return {
    id: generateId("goal", now),
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    targetDate: input.targetDate,
    riskTier: input.riskTier,
    currency: input.currency ?? DEFAULT_CURRENCY,
    state: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateSavingsGoal(
  goals: SavingsGoal[],
  id: string,
  patch: Partial<SavingsGoalInput>,
  now: number = Date.now(),
): SavingsGoal[] {
  return goals.map((goal) =>
    goal.id === id
      ? {
          ...goal,
          ...patch,
          name: patch.name !== undefined ? patch.name.trim() : goal.name,
          updatedAt: new Date(now).toISOString(),
        }
      : goal,
  );
}

function setGoalState(
  goals: SavingsGoal[],
  id: string,
  state: SavingsGoalState,
  now: number,
): SavingsGoal[] {
  return goals.map((goal) =>
    goal.id === id
      ? { ...goal, state, updatedAt: new Date(now).toISOString() }
      : goal,
  );
}

/** Pausing a goal freezes it: it stops notifying and stops being missed. */
export function pauseSavingsGoal(
  goals: SavingsGoal[],
  id: string,
  now: number = Date.now(),
): SavingsGoal[] {
  return setGoalState(goals, id, "paused", now);
}

export function resumeSavingsGoal(
  goals: SavingsGoal[],
  id: string,
  now: number = Date.now(),
): SavingsGoal[] {
  return setGoalState(goals, id, "active", now);
}

export function deleteSavingsGoal(goals: SavingsGoal[], id: string): SavingsGoal[] {
  return goals.filter((goal) => goal.id !== id);
}

// ---------------------------------------------------------------------------
// Goal-driven recommendation filtering
// ---------------------------------------------------------------------------

function normaliseRiskTier(invoice: GoalCandidateInvoice): RiskTier | null {
  const explicit = invoice.risk_rating?.tier;
  if (explicit && RISK_TIERS.includes(explicit)) return explicit;

  const raw = String(invoice.risk_tier ?? "").trim().toUpperCase();
  if (!raw) return null;
  return RISK_TIERS.find((tier) => raw === tier || raw.startsWith(tier)) ?? null;
}

function remainingCapacity(invoice: GoalCandidateInvoice): number {
  return (invoice.amount ?? 0) - (invoice.raised ?? 0);
}

/**
 * An invoice is recommended for a goal when it is still open, carries the
 * goal's risk tier and has capacity left to fund. A missing risk tier does not
 * match: an unrated invoice is not something a risk-tiered goal should bet on.
 */
export function matchesGoalCriteria(
  goal: SavingsGoal,
  invoice: GoalCandidateInvoice,
): boolean {
  if (invoice.status && invoice.status !== "open") return false;
  if (normaliseRiskTier(invoice) !== goal.riskTier) return false;
  return remainingCapacity(invoice) > 0;
}

export function recommendInvoicesForGoal(
  goal: SavingsGoal,
  invoices: GoalCandidateInvoice[],
  limit = 3,
): GoalCandidateInvoice[] {
  return invoices
    .filter((invoice) => matchesGoalCriteria(goal, invoice))
    .sort(
      (a, b) =>
        (b.yield_percentage ?? 0) - (a.yield_percentage ?? 0) ||
        remainingCapacity(b) - remainingCapacity(a),
    )
    .slice(0, Math.max(0, limit));
}

/** The union of invoices matching any active (non-paused) goal. */
export function filterInvoicesForActiveGoals(
  goals: SavingsGoal[],
  invoices: GoalCandidateInvoice[],
): GoalCandidateInvoice[] {
  const active = goals.filter((goal) => goal.state === "active");
  return invoices.filter((invoice) =>
    active.some((goal) => matchesGoalCriteria(goal, invoice)),
  );
}
