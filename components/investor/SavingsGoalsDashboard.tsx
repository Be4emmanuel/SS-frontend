"use client";

import { useMemo, useState } from "react";
import { Bell, Plus, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInvoices } from "@/hooks/useInvoices";
import { useSavingsGoals, type RecordAllocationInput } from "@/hooks/useSavingsGoals";
import {
  RISK_TIERS,
  buildGoalNotificationsForAll,
  type GoalCandidateInvoice,
  type RiskTier,
  type SavingsGoal,
  type SavingsGoalInput,
} from "@/lib/savingsGoals";
import { cn } from "@/lib/utils";
import { SavingsGoalCard } from "./SavingsGoalCard";

interface SavingsGoalsDashboardProps {
  /** Override the invoice source; primarily for tests and stories. */
  candidateInvoices?: GoalCandidateInvoice[];
  now?: number;
  recommendationLimit?: number;
  className?: string;
}

interface GoalDraft {
  name: string;
  targetAmount: string;
  targetDate: string;
  riskTier: RiskTier;
  currency: string;
}

const EMPTY_DRAFT: GoalDraft = {
  name: "",
  targetAmount: "",
  targetDate: "",
  riskTier: "A",
  currency: "USDC",
};

function toDraft(goal: SavingsGoal): GoalDraft {
  return {
    name: goal.name,
    targetAmount: String(goal.targetAmount),
    targetDate: goal.targetDate,
    riskTier: goal.riskTier,
    currency: goal.currency,
  };
}

/** Paused goals sink below the ones still in play, then soonest target first. */
const STATE_ORDER: Record<SavingsGoal["state"], number> = {
  active: 0,
  paused: 1,
};

/**
 * Investor savings goals dashboard (#662).
 *
 * Lists the investor's savings goals, surfaces completion / missed-target
 * notifications, and hosts the create/edit form. All progress, pace, status
 * and recommendation logic comes from `lib/savingsGoals`; this component only
 * wires persistence and rendering together.
 */
export function SavingsGoalsDashboard({
  candidateInvoices,
  now,
  recommendationLimit = 3,
  className,
}: SavingsGoalsDashboardProps) {
  const {
    goals,
    allocations,
    create,
    update,
    pause,
    resume,
    remove,
    recordAllocation,
  } = useSavingsGoals();

  const invoicesQuery = useInvoices();

  const invoices = useMemo<GoalCandidateInvoice[]>(() => {
    if (candidateInvoices) return candidateInvoices;
    return (
      invoicesQuery.data?.pages.flatMap((page) => page.invoices) ?? []
    ) as GoalCandidateInvoice[];
  }, [candidateInvoices, invoicesQuery.data]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);

  const notifications = useMemo(
    () => buildGoalNotificationsForAll(goals, allocations, now),
    [goals, allocations, now],
  );

  const orderedGoals = useMemo(() => {
    return [...goals].sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        a.targetDate.localeCompare(b.targetDate),
    );
  }, [goals]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (goal: SavingsGoal) => {
    setEditing(goal);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const handleSubmit = (input: SavingsGoalInput) => {
    if (editing) {
      update(editing.id, input);
    } else {
      create(input);
    }
    closeForm();
  };

  const handleRecordInvestment = (
    goal: SavingsGoal,
    allocation: { amount: number; invoiceId: string },
  ) => {
    const payload: RecordAllocationInput = {
      goalId: goal.id,
      invoiceId: allocation.invoiceId,
      amount: allocation.amount,
      confirmed: true,
    };
    recordAllocation(payload);
  };

  return (
    <section className={cn("space-y-6", className)} data-testid="savings-goals-dashboard">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Target className="h-6 w-6 text-muted-foreground" />
            Savings goals
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a target, track confirmed progress and find invoices that match.
          </p>
        </div>
        {!formOpen && (
          <Button onClick={openCreate} data-testid="savings-goal-new">
            <Plus className="mr-1.5 h-4 w-4" />
            New goal
          </Button>
        )}
      </header>

      {formOpen && (
        <SavingsGoalForm
          goal={editing}
          onCancel={closeForm}
          onSubmit={handleSubmit}
        />
      )}

      {notifications.length > 0 && (
        <div className="space-y-2" data-testid="savings-goal-notifications">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-sm",
                notification.severity === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
              data-testid={`savings-goal-notification-${notification.id}`}
            >
              <Bell className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notification.message}</span>
            </div>
          ))}
        </div>
      )}

      {orderedGoals.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No savings goals yet. Create one to start tracking your allocation.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orderedGoals.map((goal) => (
            <SavingsGoalCard
              key={goal.id}
              goal={goal}
              allocations={allocations}
              candidateInvoices={invoices}
              now={now}
              recommendationLimit={recommendationLimit}
              onEdit={openEdit}
              onPause={(target) => pause(target.id)}
              onResume={(target) => resume(target.id)}
              onDelete={(target) => remove(target.id)}
              onRecordInvestment={handleRecordInvestment}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface SavingsGoalFormProps {
  goal: SavingsGoal | null;
  onCancel: () => void;
  onSubmit: (input: SavingsGoalInput) => void;
}

function SavingsGoalForm({ goal, onCancel, onSubmit }: SavingsGoalFormProps) {
  const [draft, setDraft] = useState<GoalDraft>(() =>
    goal ? toDraft(goal) : EMPTY_DRAFT,
  );
  const [submitted, setSubmitted] = useState(false);

  const targetAmount = Number.parseFloat(draft.targetAmount);
  const errors = {
    name: draft.name.trim() ? null : "Name is required",
    targetAmount:
      Number.isFinite(targetAmount) && targetAmount > 0
        ? null
        : "Enter an amount greater than zero",
    targetDate: draft.targetDate ? null : "Target date is required",
  };
  const valid = !errors.name && !errors.targetAmount && !errors.targetDate;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    onSubmit({
      name: draft.name.trim(),
      targetAmount,
      targetDate: draft.targetDate,
      riskTier: draft.riskTier,
      currency: draft.currency.trim() || "USDC",
    });
  };

  return (
    <Card data-testid="savings-goal-form">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              {goal ? "Edit savings goal" : "New savings goal"}
            </CardTitle>
            <CardDescription>
              Progress counts confirmed allocations only.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            aria-label="Close goal form"
            data-testid="savings-goal-form-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="savings-goal-name">Goal name</Label>
            <Input
              id="savings-goal-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Q1 invoice allocation"
              data-testid="savings-goal-form-name"
            />
            {submitted && errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="savings-goal-amount">Target amount</Label>
              <Input
                id="savings-goal-amount"
                type="number"
                inputMode="decimal"
                value={draft.targetAmount}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    targetAmount: event.target.value,
                  }))
                }
                placeholder="50000"
                data-testid="savings-goal-form-amount"
              />
              {submitted && errors.targetAmount && (
                <p className="text-xs text-destructive">{errors.targetAmount}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="savings-goal-currency">Currency</Label>
              <Input
                id="savings-goal-currency"
                value={draft.currency}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, currency: event.target.value }))
                }
                placeholder="USDC"
                data-testid="savings-goal-form-currency"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="savings-goal-date">Target date</Label>
              <Input
                id="savings-goal-date"
                type="date"
                value={draft.targetDate}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    targetDate: event.target.value,
                  }))
                }
                data-testid="savings-goal-form-date"
              />
              {submitted && errors.targetDate && (
                <p className="text-xs text-destructive">{errors.targetDate}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="savings-goal-tier">Risk tier</Label>
              <Select
                value={draft.riskTier}
                onValueChange={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    riskTier: value as RiskTier,
                  }))
                }
              >
                <SelectTrigger
                  id="savings-goal-tier"
                  data-testid="savings-goal-form-tier"
                >
                  <SelectValue placeholder="Select a tier" />
                </SelectTrigger>
                <SelectContent>
                  {RISK_TIERS.map((tier) => (
                    <SelectItem
                      key={tier}
                      value={tier}
                      data-testid={`savings-goal-form-tier-${tier}`}
                    >
                      Tier {tier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" data-testid="savings-goal-form-submit">
              {goal ? "Save changes" : "Create goal"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
