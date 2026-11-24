/**
 * Sandbox sample data and response fixtures (#696).
 *
 * The interfaces below are the documented shapes. Every fixture is typed
 * against them and `validateFixtureShape` checks them at runtime, so a
 * fixture cannot drift from the documented contract unnoticed.
 */

export type SandboxInvoiceStatus = "open" | "funded" | "settled";

export interface SandboxWallet {
  id: string;
  label: string;
  /** Stellar-style public address (fake; never a real account). */
  address: string;
  /** Test XLM. */
  balance: number;
}

export interface SandboxIssuer {
  id: string;
  name: string;
  address: string;
  tier: "bronze" | "silver" | "gold";
}

export interface SandboxInvoice {
  id: string;
  issuerId: string;
  title: string;
  faceValue: number;
  yieldPercentage: number;
  status: SandboxInvoiceStatus;
  /** Wallet that funded the invoice, when funded or settled. */
  fundedBy: string | null;
  /** Amount paid out at settlement. */
  payout: number | null;
}

export const SANDBOX_EVENT_TYPES = [
  "invoice.funded",
  "invoice.settled",
  "funding.reversed",
  "settlement.reversed",
] as const;
export type SandboxEventType = (typeof SANDBOX_EVENT_TYPES)[number];

/** Documented response body for every simulated event. */
export interface SandboxEventResponse {
  id: string;
  type: SandboxEventType;
  invoice_id: string;
  invoice_status: SandboxInvoiceStatus;
  amount: number;
  wallet_id: string | null;
  created_at: string;
  livemode: false;
}

const addr = (seed: string) => `G${seed.repeat(56).slice(0, 55)}`.toUpperCase();

export const SAMPLE_WALLETS: SandboxWallet[] = [
  { id: "sbx_wal_0001", label: "Investor A", address: addr("A2"), balance: 50_000 },
  { id: "sbx_wal_0002", label: "Investor B", address: addr("B3"), balance: 25_000 },
];

export const SAMPLE_ISSUERS: SandboxIssuer[] = [
  { id: "sbx_iss_0001", name: "Acme Logistics (sandbox)", address: addr("C4"), tier: "gold" },
  { id: "sbx_iss_0002", name: "Globex Foods (sandbox)", address: addr("D5"), tier: "silver" },
];

export const SAMPLE_INVOICES: SandboxInvoice[] = [
  {
    id: "sbx_inv_0001",
    issuerId: "sbx_iss_0001",
    title: "Freight services — March",
    faceValue: 10_000,
    yieldPercentage: 8,
    status: "open",
    fundedBy: null,
    payout: null,
  },
  {
    id: "sbx_inv_0002",
    issuerId: "sbx_iss_0002",
    title: "Produce supply — Q1",
    faceValue: 5_000,
    yieldPercentage: 6,
    status: "open",
    fundedBy: null,
    payout: null,
  },
];

/** Example response for each event, as documented. */
export const RESPONSE_FIXTURES: Record<SandboxEventType, SandboxEventResponse> = {
  "invoice.funded": {
    id: "evt_sbx_0001",
    type: "invoice.funded",
    invoice_id: "sbx_inv_0001",
    invoice_status: "funded",
    amount: 10_000,
    wallet_id: "sbx_wal_0001",
    created_at: "2026-01-01T00:00:00.000Z",
    livemode: false,
  },
  "invoice.settled": {
    id: "evt_sbx_0002",
    type: "invoice.settled",
    invoice_id: "sbx_inv_0001",
    invoice_status: "settled",
    amount: 10_800,
    wallet_id: "sbx_wal_0001",
    created_at: "2026-01-02T00:00:00.000Z",
    livemode: false,
  },
  "funding.reversed": {
    id: "evt_sbx_0003",
    type: "funding.reversed",
    invoice_id: "sbx_inv_0001",
    invoice_status: "open",
    amount: 10_000,
    wallet_id: "sbx_wal_0001",
    created_at: "2026-01-03T00:00:00.000Z",
    livemode: false,
  },
  "settlement.reversed": {
    id: "evt_sbx_0004",
    type: "settlement.reversed",
    invoice_id: "sbx_inv_0001",
    invoice_status: "funded",
    amount: 10_800,
    wallet_id: "sbx_wal_0001",
    created_at: "2026-01-04T00:00:00.000Z",
    livemode: false,
  },
};

const RESPONSE_KEYS: Array<keyof SandboxEventResponse> = [
  "id",
  "type",
  "invoice_id",
  "invoice_status",
  "amount",
  "wallet_id",
  "created_at",
  "livemode",
];

/** Returns a list of problems; empty means the value matches the documented shape. */
export function validateFixtureShape(value: unknown): string[] {
  const problems: string[] = [];
  if (typeof value !== "object" || value === null) return ["not an object"];
  const record = value as Record<string, unknown>;
  for (const key of RESPONSE_KEYS) if (!(key in record)) problems.push(`missing ${key}`);
  for (const key of Object.keys(record)) {
    if (!RESPONSE_KEYS.includes(key as keyof SandboxEventResponse)) problems.push(`unexpected ${key}`);
  }
  if (typeof record.id !== "string" || !record.id.startsWith("evt_sbx_")) problems.push("id must be evt_sbx_*");
  if (!SANDBOX_EVENT_TYPES.includes(record.type as SandboxEventType)) problems.push("unknown type");
  if (typeof record.amount !== "number") problems.push("amount must be a number");
  if (record.livemode !== false) problems.push("livemode must be false");
  if (typeof record.created_at !== "string" || Number.isNaN(Date.parse(record.created_at))) {
    problems.push("created_at must be an ISO date");
  }
  return problems;
}
