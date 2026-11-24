"use client";

import { useCallback, useState } from "react";
import {
  SANDBOX_STORAGE_KEY,
  createInitialState,
  resetSandbox,
  rotateKey,
  simulateEvent,
  type SandboxState,
} from "@/lib/sandbox/engine";
import { isSandboxKey } from "@/lib/sandbox/credentials";
import type { SandboxEventType } from "@/lib/sandbox/fixtures";

function load(): SandboxState {
  if (typeof window === "undefined") return createInitialState();
  try {
    const raw = window.localStorage.getItem(SANDBOX_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SandboxState;
      // Anything that is not a well-formed sandbox state is discarded.
      if (parsed?.version === 1 && isSandboxKey(parsed.settings?.apiKey)) return parsed;
    }
  } catch {
    /* fall through to a fresh state */
  }
  return createInitialState();
}

function persist(state: SandboxState) {
  try {
    window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or unavailable: keep working in memory */
  }
}

/**
 * Sandbox state for the partner console (#696). Persists under a
 * sandbox-only key, never reads or writes production data, and makes no
 * network requests.
 */
export function useSandboxEnvironment() {
  const [state, setState] = useState<SandboxState>(load);

  const update = useCallback((next: SandboxState) => {
    persist(next);
    setState(next);
  }, []);

  const simulate = useCallback(
    (type: SandboxEventType, invoiceId: string, walletId?: string) => {
      const outcome = simulateEvent(state, { type, invoiceId, walletId });
      update(outcome.state);
      return outcome;
    },
    [state, update],
  );

  const reset = useCallback(() => {
    const next = resetSandbox(state);
    update(next);
    return next;
  }, [state, update]);

  const rotate = useCallback(() => update(rotateKey(state)), [state, update]);

  return { state, simulate, reset, rotate };
}
