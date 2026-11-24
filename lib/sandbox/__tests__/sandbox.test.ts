import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SandboxIsolationError,
  assertProductionCredential,
  assertSandboxTarget,
  generateSandboxKey,
} from "../credentials";
import {
  SANDBOX_STORAGE_KEY,
  SIMULATION_CONTROLS,
  blockedReason,
  createInitialState,
  resetSandbox,
  simulateEvent,
  type SandboxState,
} from "../engine";
import {
  RESPONSE_FIXTURES,
  SANDBOX_EVENT_TYPES,
  validateFixtureShape,
} from "../fixtures";
import { maskId, maskPath, maskValue } from "../mask";
import { authHeaders } from "@/lib/api/shared";

const KEY = "ss_test_0123456789abcdef01234567";
const NOW = () => "2026-02-02T00:00:00.000Z";
const fresh = () => createInitialState(KEY);
const run = (
  s: SandboxState,
  type: (typeof SANDBOX_EVENT_TYPES)[number],
  invoiceId = "sbx_inv_0001",
) => simulateEvent(s, { type, invoiceId }, NOW);

afterEach(() => vi.restoreAllMocks());

describe("isolation", () => {
  it("sandbox credentials cannot access production", () => {
    expect(() => assertProductionCredential(KEY)).toThrow(SandboxIsolationError);
    expect(() => authHeaders(KEY)).toThrow(SandboxIsolationError);
    expect(authHeaders("jwt.token.value")).toEqual({ Authorization: "Bearer jwt.token.value" });
    expect(authHeaders()).toEqual({});
  });

  it("sandbox keys can only call the sandbox API", () => {
    expect(() => assertSandboxTarget("/api/sandbox/invoices", KEY)).not.toThrow();
    expect(() => assertSandboxTarget("/api/invoices", KEY)).toThrow(SandboxIsolationError);
    expect(() => assertSandboxTarget("https://prod.example.com/api/invoices", KEY)).toThrow(
      SandboxIsolationError,
    );
  });

  it("production keys are not accepted by the sandbox", () => {
    expect(() => createInitialState("ss_live_abc")).toThrow(SandboxIsolationError);
    const state = { ...fresh(), settings: { ...fresh().settings, apiKey: "ss_live_abc" } };
    expect(() => run(state, "invoice.funded")).toThrow(SandboxIsolationError);
  });

  it("simulating events never touches the network and uses a sandbox-only storage key", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    run(fresh(), "invoice.funded");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(SANDBOX_STORAGE_KEY).toMatch(/^ss_sandbox_/);
  });

  it("generates sandbox-prefixed keys", () => {
    expect(generateSandboxKey()).toMatch(/^ss_test_[0-9a-f]{24}$/);
  });
});

describe("every event has a simulation control", () => {
  it("has a control for each event type, covering funding, settlement and reversal", () => {
    expect(Object.keys(SIMULATION_CONTROLS).sort()).toEqual([...SANDBOX_EVENT_TYPES].sort());
    for (const type of SANDBOX_EVENT_TYPES) {
      const control = SIMULATION_CONTROLS[type];
      expect(control.label).toBeTruthy();
      expect(control.requires.length).toBeGreaterThan(0);
      expect(control.path("sbx_inv_0001")).toMatch(/^\/api\/sandbox\//);
    }
  });
});

describe("transitions", () => {
  it("open → funded → settled, moving test funds", () => {
    let s = fresh();
    const start = s.wallets[0].balance;

    s = run(s, "invoice.funded").state;
    expect(s.invoices[0]).toMatchObject({ status: "funded", fundedBy: "sbx_wal_0001" });
    expect(s.wallets[0].balance).toBe(start - 10_000);

    s = run(s, "invoice.settled").state;
    expect(s.invoices[0]).toMatchObject({ status: "settled", payout: 10_800 });
    expect(s.wallets[0].balance).toBe(start - 10_000 + 10_800);
  });

  it("reverses funding and settlement, restoring balances", () => {
    let s = fresh();
    const start = s.wallets[0].balance;
    s = run(s, "invoice.funded").state;
    s = run(s, "funding.reversed").state;
    expect(s.invoices[0]).toMatchObject({ status: "open", fundedBy: null });
    expect(s.wallets[0].balance).toBe(start);

    s = run(s, "invoice.funded").state;
    s = run(s, "invoice.settled").state;
    s = run(s, "settlement.reversed").state;
    expect(s.invoices[0]).toMatchObject({ status: "funded", payout: null });
    expect(s.wallets[0].balance).toBe(start - 10_000);
  });

  it("rejects illegal transitions with a 409 and leaves state untouched", () => {
    const s = fresh();
    const out = run(s, "invoice.settled"); // open invoice cannot settle
    expect(out.status).toBe(409);
    expect(out.body).toHaveProperty("error");
    expect(out.state.invoices).toEqual(s.invoices);
    expect(out.state.wallets).toEqual(s.wallets);
    expect(blockedReason("invoice.settled", s.invoices[0])).toMatch(/funded/);
    expect(blockedReason("invoice.funded", undefined)).toBe("Unknown invoice.");
  });

  it("refuses to fund beyond the sandbox balance", () => {
    const s = fresh();
    s.wallets[0] = { ...s.wallets[0], balance: 5 };
    expect(run(s, "invoice.funded").status).toBe(409);
  });

  it("unknown invoices are a 404", () => {
    expect(run(fresh(), "invoice.funded", "sbx_inv_9999").status).toBe(404);
  });
});

describe("fixtures match the documented shapes", () => {
  it("every response fixture validates", () => {
    for (const type of SANDBOX_EVENT_TYPES) {
      expect(validateFixtureShape(RESPONSE_FIXTURES[type])).toEqual([]);
      expect(RESPONSE_FIXTURES[type].type).toBe(type);
    }
  });

  it("a live response from the engine has the same shape", () => {
    const out = run(fresh(), "invoice.funded");
    expect(validateFixtureShape(out.body)).toEqual([]);
  });

  it("the validator catches drift", () => {
    expect(validateFixtureShape({ ...RESPONSE_FIXTURES["invoice.funded"], livemode: true })).toContain(
      "livemode must be false",
    );
    expect(validateFixtureShape({ id: "x" }).length).toBeGreaterThan(1);
  });
});

describe("history masks secrets and IDs", () => {
  it("never stores the API key, full IDs or full addresses", () => {
    const s = run(fresh(), "invoice.funded").state;
    const dump = JSON.stringify(s.history);
    expect(dump).not.toContain(KEY);
    expect(dump).not.toContain("sbx_inv_0001");
    expect(dump).not.toContain("sbx_wal_0001");
    expect(s.history[0].path).not.toContain("sbx_inv_0001");
    expect(s.history[0].status).toBe(200);
  });

  it("masks keys, secret seeds, addresses and ids in arbitrary payloads", () => {
    const address = "G" + "A".repeat(55);
    const seed = "S" + "B".repeat(55);
    const masked = JSON.stringify(
      maskValue({ authorization: "Bearer abc", note: `key ${KEY}`, secret: seed, account: address, invoice_id: "sbx_inv_0001" }),
    );
    for (const leaked of ["Bearer abc", KEY, seed, address, "sbx_inv_0001"]) {
      expect(masked).not.toContain(leaked);
    }
    expect(maskId(address)).toBe("GAAA…AAAA");
    expect(maskPath("/api/sandbox/invoices/sbx_inv_0001/fund")).toBe("/api/sandbox/invoices/sbx_…01/fund");
  });

  it("keeps history bounded", () => {
    let s = fresh();
    for (let i = 0; i < 60; i++) s = run(s, "invoice.settled").state; // all 409s
    expect(s.history.length).toBe(50);
  });
});

describe("reset", () => {
  it("clears balances, statuses and history but keeps the sandbox key", () => {
    let s = fresh();
    s = run(s, "invoice.funded").state;
    expect(s.history).toHaveLength(1);

    const reset = resetSandbox(s);
    expect(reset.history).toEqual([]);
    expect(reset.sequence).toBe(0);
    expect(reset.invoices.every((i) => i.status === "open")).toBe(true);
    expect(reset.wallets).toEqual(fresh().wallets);
    expect(reset.settings.apiKey).toBe(KEY);
  });
});
