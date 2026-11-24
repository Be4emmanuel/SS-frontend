/**
 * Sandbox engine (#696): a pure, in-memory simulation of funding, settlement
 * and reversal for partner integration testing.
 *
 * It never touches the network or production storage. State changes are
 * returned as new objects; the caller decides where to persist them (see
 * hooks/useSandboxEnvironment, which uses a sandbox-only storage key).
 */

import { assertSandboxKey, generateSandboxKey, SANDBOX_API_BASE } from "./credentials";
import {
  SAMPLE_INVOICES,
  SAMPLE_ISSUERS,
  SAMPLE_WALLETS,
  SANDBOX_EVENT_TYPES,
  type SandboxEventResponse,
  type SandboxEventType,
  type SandboxInvoice,
  type SandboxInvoiceStatus,
  type SandboxIssuer,
  type SandboxWallet,
} from "./fixtures";
import { maskPath, maskValue } from "./mask";

/** Storage namespace, kept apart from every production key. */
export const SANDBOX_STORAGE_KEY = "ss_sandbox_state_v1";
export const MAX_HISTORY = 50;

export interface HistoryEntry {
  id: string;
  at: string;
  method: "POST";
  /** Masked path. */
  path: string;
  status: number;
  /** Masked request body. */
  request: unknown;
  /** Masked response body. */
  response: unknown;
}

export interface SandboxState {
  version: 1;
  settings: { label: string; apiBase: string; apiKey: string };
  wallets: SandboxWallet[];
  issuers: SandboxIssuer[];
  invoices: SandboxInvoice[];
  history: HistoryEntry[];
  sequence: number;
}

export interface SimulationControl {
  label: string;
  description: string;
  /** Invoice statuses the event can be applied to. */
  requires: SandboxInvoiceStatus[];
  /** Status the invoice moves to. */
  to: SandboxInvoiceStatus;
  path: (invoiceId: string) => string;
}

/** Every event has an entry here, enforced by the Record type. */
export const SIMULATION_CONTROLS: Record<SandboxEventType, SimulationControl> = {
  "invoice.funded": {
    label: "Simulate funding",
    description: "A sample investor funds the invoice in full.",
    requires: ["open"],
    to: "funded",
    path: (id) => `${SANDBOX_API_BASE}/invoices/${id}/fund`,
  },
  "invoice.settled": {
    label: "Simulate settlement",
    description: "The debtor pays; the investor receives face value plus yield.",
    requires: ["funded"],
    to: "settled",
    path: (id) => `${SANDBOX_API_BASE}/invoices/${id}/settle`,
  },
  "funding.reversed": {
    label: "Reverse funding",
    description: "Refunds the investor and reopens the invoice.",
    requires: ["funded"],
    to: "open",
    path: (id) => `${SANDBOX_API_BASE}/invoices/${id}/reverse-funding`,
  },
  "settlement.reversed": {
    label: "Reverse settlement",
    description: "Claws back the payout and returns the invoice to funded.",
    requires: ["settled"],
    to: "funded",
    path: (id) => `${SANDBOX_API_BASE}/invoices/${id}/reverse-settlement`,
  },
};

export function createInitialState(apiKey: string = generateSandboxKey()): SandboxState {
  assertSandboxKey(apiKey);
  return {
    version: 1,
    settings: { label: "Partner sandbox", apiBase: SANDBOX_API_BASE, apiKey },
    wallets: SAMPLE_WALLETS.map((w) => ({ ...w })),
    issuers: SAMPLE_ISSUERS.map((i) => ({ ...i })),
    invoices: SAMPLE_INVOICES.map((i) => ({ ...i })),
    history: [],
    sequence: 0,
  };
}

/** Clears all sandbox state (history, balances, statuses). Keeps the API key. */
export function resetSandbox(state: SandboxState): SandboxState {
  return createInitialState(state.settings.apiKey);
}

export function rotateKey(state: SandboxState, apiKey: string = generateSandboxKey()): SandboxState {
  assertSandboxKey(apiKey);
  return { ...state, settings: { ...state.settings, apiKey } };
}

/** Why the event cannot be applied to this invoice now, or null if it can. */
export function blockedReason(
  type: SandboxEventType,
  invoice: SandboxInvoice | undefined,
): string | null {
  if (!invoice) return "Unknown invoice.";
  const control = SIMULATION_CONTROLS[type];
  if (!control.requires.includes(invoice.status)) {
    return `Needs the invoice to be ${control.requires.join(" or ")} (it is ${invoice.status}).`;
  }
  return null;
}

export interface SimulationOutcome {
  state: SandboxState;
  status: number;
  body: SandboxEventResponse | { error: string };
}

export function simulateEvent(
  state: SandboxState,
  event: { type: SandboxEventType; invoiceId: string; walletId?: string },
  now: () => string = () => new Date().toISOString(),
): SimulationOutcome {
  // Only a sandbox key can drive the sandbox.
  assertSandboxKey(state.settings.apiKey);

  const control = SIMULATION_CONTROLS[event.type];
  const invoice = state.invoices.find((i) => i.id === event.invoiceId);
  const sequence = state.sequence + 1;
  let wallets = state.wallets;
  let invoices = state.invoices;
  let status = 200;
  let body: SimulationOutcome["body"];

  const blocked = blockedReason(event.type, invoice);
  const walletId =
    event.type === "invoice.funded"
      ? (event.walletId ?? state.wallets[0]?.id)
      : (invoice?.fundedBy ?? event.walletId);
  const wallet = state.wallets.find((w) => w.id === walletId);

  let error: string | null = blocked;
  let amount = 0;
  let nextInvoice: SandboxInvoice | null = null;

  if (!error && invoice) {
    switch (event.type) {
      case "invoice.funded": {
        amount = invoice.faceValue;
        if (!wallet) error = "Unknown wallet.";
        else if (wallet.balance < amount) error = "Insufficient sandbox balance.";
        else {
          wallets = adjust(wallets, wallet.id, -amount);
          nextInvoice = { ...invoice, status: "funded", fundedBy: wallet.id, payout: null };
        }
        break;
      }
      case "invoice.settled": {
        amount = round2(invoice.faceValue * (1 + invoice.yieldPercentage / 100));
        wallets = adjust(wallets, invoice.fundedBy as string, amount);
        nextInvoice = { ...invoice, status: "settled", payout: amount };
        break;
      }
      case "funding.reversed": {
        amount = invoice.faceValue;
        wallets = adjust(wallets, invoice.fundedBy as string, amount);
        nextInvoice = { ...invoice, status: "open", fundedBy: null, payout: null };
        break;
      }
      case "settlement.reversed": {
        amount = invoice.payout ?? 0;
        const holder = state.wallets.find((w) => w.id === invoice.fundedBy);
        if (!holder || holder.balance < amount) error = "Insufficient sandbox balance to reverse.";
        else {
          wallets = adjust(wallets, holder.id, -amount);
          nextInvoice = { ...invoice, status: "funded", payout: null };
        }
        break;
      }
    }
  }

  if (error || !nextInvoice) {
    status = invoice ? 409 : 404;
    body = { error: error ?? "Event could not be applied." };
    wallets = state.wallets;
  } else {
    invoices = state.invoices.map((i) => (i.id === nextInvoice!.id ? nextInvoice! : i));
    body = {
      id: `evt_sbx_${String(sequence).padStart(4, "0")}`,
      type: event.type,
      invoice_id: nextInvoice.id,
      invoice_status: control.to,
      amount,
      wallet_id: nextInvoice.fundedBy ?? walletId ?? null,
      created_at: now(),
      livemode: false,
    };
  }

  const entry: HistoryEntry = {
    id: `req_sbx_${String(sequence).padStart(4, "0")}`,
    at: now(),
    method: "POST",
    path: maskPath(control.path(event.invoiceId)),
    status,
    request: maskValue({
      invoice_id: event.invoiceId,
      wallet_id: walletId,
      api_key: state.settings.apiKey,
    }),
    response: maskValue(body),
  };

  return {
    state: {
      ...state,
      wallets,
      invoices,
      sequence,
      history: [entry, ...state.history].slice(0, MAX_HISTORY),
    },
    status,
    body,
  };
}

function adjust(wallets: SandboxWallet[], id: string, delta: number): SandboxWallet[] {
  return wallets.map((w) => (w.id === id ? { ...w, balance: round2(w.balance + delta) } : w));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export { SANDBOX_EVENT_TYPES };
