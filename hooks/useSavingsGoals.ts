"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  createSavingsGoal,
  deleteSavingsGoal as removeGoalFromList,
  pauseSavingsGoal as pauseGoalInList,
  resumeSavingsGoal as resumeGoalInList,
  updateSavingsGoal as updateGoalInList,
  type GoalAllocation,
  type SavingsGoal,
  type SavingsGoalInput,
} from "@/lib/savingsGoals";

/**
 * Investor savings goals state (#662).
 *
 * Goals and their confirmed allocations are user-authored data with no
 * backend route yet, so they are persisted in localStorage: the same
 * approach the app already uses for saved views and recently-viewed
 * invoices. The hook owns persistence and the CRUD transitions; every
 * calculation lives in `lib/savingsGoals`.
 */

const GOALS_STORAGE_KEY = "ss_savings_goals";
const ALLOCATIONS_STORAGE_KEY = "ss_savings_goal_allocations";

export interface SavingsGoalsState {
  goals: SavingsGoal[];
  allocations: GoalAllocation[];
}

export interface RecordAllocationInput {
  goalId: string;
  invoiceId: string;
  invoiceTitle?: string;
  amount: number;
  /** Defaults to true; pass false to log a commitment still awaiting confirmation. */
  confirmed?: boolean;
}

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readState(): SavingsGoalsState {
  return {
    goals: readList<SavingsGoal>(GOALS_STORAGE_KEY),
    allocations: readList<GoalAllocation>(ALLOCATIONS_STORAGE_KEY),
  };
}

function writeState(state: SavingsGoalsState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(state.goals));
    localStorage.setItem(
      ALLOCATIONS_STORAGE_KEY,
      JSON.stringify(state.allocations),
    );
  } catch {
    // localStorage unavailable (private mode, quota); state stays in memory.
  }
}

export function useSavingsGoals() {
  const [state, setState] = useState<SavingsGoalsState>(() => readState());

  const commit = useCallback((next: SavingsGoalsState) => {
    setState(next);
    writeState(next);
  }, []);

  const create = useCallback(
    (input: SavingsGoalInput) => {
      const goal = createSavingsGoal(input, Date.now());
      commit({ ...state, goals: [...state.goals, goal] });
      toast.success(`Savings goal "${goal.name}" created.`);
      return goal;
    },
    [commit, state],
  );

  const update = useCallback(
    (id: string, patch: Partial<SavingsGoalInput>) => {
      commit({
        ...state,
        goals: updateGoalInList(state.goals, id, patch, Date.now()),
      });
      toast.success("Savings goal updated.");
    },
    [commit, state],
  );

  const pause = useCallback(
    (id: string) => {
      commit({
        ...state,
        goals: pauseGoalInList(state.goals, id, Date.now()),
      });
      toast.success("Savings goal paused.");
    },
    [commit, state],
  );

  const resume = useCallback(
    (id: string) => {
      commit({
        ...state,
        goals: resumeGoalInList(state.goals, id, Date.now()),
      });
      toast.success("Savings goal resumed.");
    },
    [commit, state],
  );

  const remove = useCallback(
    (id: string) => {
      commit({
        goals: removeGoalFromList(state.goals, id),
        allocations: state.allocations.filter(
          (allocation) => allocation.goalId !== id,
        ),
      });
      toast.success("Savings goal deleted.");
    },
    [commit, state],
  );

  const recordAllocation = useCallback(
    ({ goalId, invoiceId, invoiceTitle, amount, confirmed = true }: RecordAllocationInput) => {
      const timestamp = Date.now();
      const allocation: GoalAllocation = {
        id: `alloc-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
        goalId,
        invoiceId,
        invoiceTitle,
        amount,
        status: confirmed ? "confirmed" : "pending",
        confirmedAt: confirmed ? new Date(timestamp).toISOString() : null,
      };
      commit({ ...state, allocations: [...state.allocations, allocation] });
      toast.success(
        confirmed ? "Confirmed investment logged." : "Pending commitment logged.",
      );
      return allocation;
    },
    [commit, state],
  );

  return {
    goals: state.goals,
    allocations: state.allocations,
    create,
    update,
    pause,
    resume,
    remove,
    recordAllocation,
  };
}
