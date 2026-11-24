"use client";

import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Pause,
  Pencil,
  Play,
  Plus,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  buildGoalSummary,
  recommendInvoicesForGoal,
  type GoalAllocation,
  type GoalCandidateInvoice,
  type GoalStatus,
  type SavingsGoal,
} from "@/lib/savingsGoals";
import { cn } from "@/lib/utils";

interface SavingsGoalCardProps {
  goal: SavingsGoal;
  allocations: GoalAllocation[];
  /** Candidate invoices the goal's criteria are applied to. */
  candidateInvoices?: GoalCandidateInvoice[];
  now?: number;
  recommendationLimit?: number;
  onEdit?: (goal: SavingsGoal) => void;
  onPause?: (goal: SavingsGoal) => void;
  onResume?: (goal: SavingsGoal) => void;
  onDelete?: (goal: SavingsGoal) => void;
  onRecordInvestment?: (
    goal: SavingsGoal,
    allocation: { amount: number; invoiceId: string },
  ) => void;
}

const STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  missed: "Missed",
};

const STATUS_CLASSES: Record<GoalStatus, string> = {
  active: "",
  paused: "bg-muted text-muted-foreground",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  missed: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function SavingsGoalCard({
  goal,
  allocations,
  candidateInvoices = [],
  now = Date.now(),
  recommendationLimit = 3,
  onEdit,
  onPause,
  onResume,
  onDelete,
  onRecordInvestment,
}: SavingsGoalCardProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [logAmount, setLogAmount] = useState("");
  const [logInvoiceId, setLogInvoiceId] = useState("");
  const [logError, setLogError] = useState<string | null>(null);

  const summary = buildGoalSummary(goal, allocations, now);
  const { progress, pace, status } = summary;
  const goalAllocations = allocations.filter(
    (allocation) => allocation.goalId === goal.id,
  );

  const handleLogSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number.parseFloat(logAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setLogError("Enter an amount greater than zero");
      return;
    }
    onRecordInvestment?.(goal, {
      amount,
      invoiceId: logInvoiceId.trim() || `${goal.id}-manual`,
    });
    setLogAmount("");
    setLogInvoiceId("");
    setLogError(null);
    setLogOpen(false);
  };

  return (
    <Card data-testid={`savings-goal-card-${goal.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{goal.name}</span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Target {goal.targetAmount.toLocaleString()} {goal.currency} by{" "}
              {goal.targetDate} · Risk tier {goal.riskTier}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="text-[10px]">
              Tier {goal.riskTier}
            </Badge>
            <Badge
              variant={status === "missed" ? "destructive" : "outline"}
              className={cn("text-[10px]", STATUS_CLASSES[status])}
              data-testid={`savings-goal-status-${goal.id}`}
            >
              {STATUS_LABELS[status]}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">
              {progress.confirmedAmount.toLocaleString()} /{" "}
              {goal.targetAmount.toLocaleString()} {goal.currency}
            </span>
            <span className="text-muted-foreground">
              {progress.progressPercent}%
            </span>
          </div>
          <Progress
            value={progress.progressPercent}
            data-testid={`savings-goal-progress-${goal.id}`}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {progress.pendingAmount > 0 && (
              <span>
                {progress.pendingAmount.toLocaleString()} {goal.currency} awaiting
                confirmation
              </span>
            )}
            {!progress.met && (
              <span>
                {progress.remainingAmount.toLocaleString()} {goal.currency} to go
              </span>
            )}
            <span>
              {goalAllocations.length} allocation
              {goalAllocations.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          data-testid={`savings-goal-projection-${goal.id}`}
        >
          <span className="flex items-center gap-1.5">
            <TrendingUp
              className={cn(
                "h-3.5 w-3.5",
                pace.onTrack ? "text-emerald-600" : "text-amber-500",
              )}
            />
            {progress.met
              ? "Target reached"
              : pace.onTrack
                ? "On track"
                : "Behind pace"}
          </span>
          <span className="text-muted-foreground">
            {pace.currentRatePerDay.toLocaleString()} {goal.currency}/day
          </span>
          {pace.requiredRatePerDay !== null && (
            <span className="text-muted-foreground">
              needs {pace.requiredRatePerDay.toLocaleString()} {goal.currency}/day
            </span>
          )}
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            {pace.daysRemaining < 0
              ? `overdue by ${Math.abs(pace.daysRemaining)} day${Math.abs(pace.daysRemaining) === 1 ? "" : "s"}`
              : `${pace.daysRemaining} day${pace.daysRemaining === 1 ? "" : "s"} left`}
          </span>
          {!progress.met && pace.projectedCompletionDate && (
            <span className="text-muted-foreground">
              projected {pace.projectedCompletionDate}
            </span>
          )}
        </div>

        <RecommendedInvoices
          goal={goal}
          status={status}
          invoices={candidateInvoices}
          limit={recommendationLimit}
        />

        {logOpen && onRecordInvestment && (
          <form
            onSubmit={handleLogSubmit}
            className="space-y-2 rounded-lg border p-3"
            data-testid={`savings-goal-log-form-${goal.id}`}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="number"
                placeholder="Amount"
                value={logAmount}
                onChange={(event) => setLogAmount(event.target.value)}
                aria-label="Investment amount"
                data-testid={`savings-goal-log-amount-${goal.id}`}
              />
              <Input
                placeholder="Invoice reference (optional)"
                value={logInvoiceId}
                onChange={(event) => setLogInvoiceId(event.target.value)}
                aria-label="Invoice reference"
                data-testid={`savings-goal-log-invoice-${goal.id}`}
              />
            </div>
            {logError && <p className="text-xs text-destructive">{logError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" data-testid={`savings-goal-log-submit-${goal.id}`}>
                Log confirmed
              </Button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {onRecordInvestment && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLogOpen((open) => !open)}
              data-testid={`savings-goal-log-${goal.id}`}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Log investment
            </Button>
          )}
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(goal)}
              data-testid={`savings-goal-edit-${goal.id}`}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
          {goal.state === "active" && onPause && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onPause(goal)}
              data-testid={`savings-goal-pause-${goal.id}`}
            >
              <Pause className="mr-1.5 h-3.5 w-3.5" />
              Pause
            </Button>
          )}
          {goal.state === "paused" && onResume && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onResume(goal)}
              data-testid={`savings-goal-resume-${goal.id}`}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Resume
            </Button>
          )}
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(goal)}
              data-testid={`savings-goal-delete-${goal.id}`}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendedInvoices({
  goal,
  status,
  invoices,
  limit,
}: {
  goal: SavingsGoal;
  status: GoalStatus;
  invoices: GoalCandidateInvoice[];
  limit: number;
}) {
  // Only an in-progress goal benefits from a shopping list: paused, completed
  // and missed goals should not nudge the investor toward new invoices.
  const matches =
    status === "active" ? recommendInvoicesForGoal(goal, invoices, limit) : [];

  if (matches.length === 0) return null;

  return (
    <div
      className="rounded-lg border bg-muted/30 p-3"
      data-testid={`savings-goal-recommendations-${goal.id}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Recommended for this goal
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((invoice) => (
          <li
            key={invoice.id}
            className="flex items-center justify-between gap-3 text-xs"
            data-testid={`savings-goal-recommendation-${goal.id}-${invoice.id}`}
          >
            <span className="truncate">{invoice.title}</span>
            <span className="shrink-0 text-muted-foreground">
              {(invoice.yield_percentage ?? 0).toFixed(1)}% ·{" "}
              {Math.max(0, invoice.amount - (invoice.raised ?? 0)).toLocaleString()}{" "}
              open
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

