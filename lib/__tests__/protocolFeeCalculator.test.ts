import { describe, expect, it } from "vitest";
import { FEE_TIERS, type FeeTierEntry } from "@/lib/api";
import {
  addScenario,
  calculateProtocolFee,
  clampAmount,
  clampVolume,
  createScenario,
  getDiscountEligibility,
  MAX_FEE_SCENARIOS,
  MAX_TRANSACTION_AMOUNT_XLM,
  MIN_TRANSACTION_AMOUNT_XLM,
  removeScenario,
  roundXlm,
  updateScenario,
  type FeeScenario,
} from "@/lib/protocolFeeCalculator";

const TIERS: FeeTierEntry[] = FEE_TIERS;

function scenario(changes: Partial<FeeScenario> = {}): FeeScenario {
  return {
    ...createScenario("test"),
    amount: 10_000,
    transactionType: "investment",
    role: "investor",
    tier: "Standard",
    volume24h: 0,
    ...changes,
  };
}

describe("protocol fee calculator (#667)", () => {
  it("sums base, discount and network fees into the final fee", () => {
    const result = calculateProtocolFee(scenario());

    expect(result.baseFee).toBe(250);
    expect(result.discount).toBe(0);
    expect(result.networkFee).toBe(0.00001);
    expect(result.finalFee).toBe(
      roundXlm(result.baseFee - result.discount + result.networkFee)
    );
  });

  it("applies a tier discount at the exact volume boundary", () => {
    const result = calculateProtocolFee(
      scenario({ tier: "Gold", volume24h: 500_000 })
    );

    expect(result.discountEligibility.eligible).toBe(true);
    expect(result.baseFee).toBe(250);
    expect(result.discount).toBe(100);
    expect(result.finalFee).toBe(150.00001);
  });

  it("explains an ineligible tier just below the volume boundary", () => {
    const eligibility = getDiscountEligibility(
      scenario({ tier: "Gold", volume24h: 499_999.99 })
    );

    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain("500,000 XLM");
    expect(eligibility.reason).toContain("499,999.99 XLM");
  });

  it("explains a tier whose rate is not below the base rate", () => {
    const result = calculateProtocolFee(
      scenario({ tier: "Platinum", volume24h: 1_000_000 }),
      { rates: { investment_fee: 0.5 } }
    );

    expect(result.discount).toBe(0);
    expect(result.discountEligibility.reason).toContain("does not reduce");
  });

  it("does not discount early exit penalties", () => {
    const result = calculateProtocolFee(
      scenario({ transactionType: "early_exit", tier: "Platinum", volume24h: 1_000_000 })
    );

    expect(result.discount).toBe(0);
    expect(result.discountEligibility.reason).toBe(
      "Early exit penalties are not eligible for volume discounts."
    );
  });

  it("explains when a fee does not apply to the selected role", () => {
    const result = calculateProtocolFee(
      scenario({ transactionType: "settlement", role: "investor" })
    );

    expect(result.roleApplies).toBe(false);
    expect(result.baseFee).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.finalFee).toBe(result.networkFee);
    expect(result.roleReason).toContain("issuer");
  });

  it("enforces minimum and maximum protocol amounts", () => {
    expect(clampAmount(MIN_TRANSACTION_AMOUNT_XLM - 1)).toEqual({
      amount: MIN_TRANSACTION_AMOUNT_XLM,
      clamped: true,
    });
    expect(clampAmount(MAX_TRANSACTION_AMOUNT_XLM + 1)).toEqual({
      amount: MAX_TRANSACTION_AMOUNT_XLM,
      clamped: true,
    });
    expect(clampAmount(MIN_TRANSACTION_AMOUNT_XLM)).toEqual({
      amount: MIN_TRANSACTION_AMOUNT_XLM,
      clamped: false,
    });
    expect(clampAmount(MAX_TRANSACTION_AMOUNT_XLM)).toEqual({
      amount: MAX_TRANSACTION_AMOUNT_XLM,
      clamped: false,
    });

    const clamped = calculateProtocolFee(scenario({ amount: -50 }));
    expect(clamped.baseFee).toBe(2.5);
    expect(clampVolume(-10)).toBe(0);
  });

  it("keeps scenarios independent and caps comparisons at five", () => {
    let scenarios = [scenario({ id: "one", name: "First" })];
    for (let index = 0; index < MAX_FEE_SCENARIOS - 1; index += 1) {
      scenarios = addScenario(scenarios);
    }

    expect(scenarios).toHaveLength(MAX_FEE_SCENARIOS);
    expect(addScenario(scenarios)).toBe(scenarios);
    expect(new Set(scenarios.map((item) => item.id)).size).toBe(MAX_FEE_SCENARIOS);

    const updated = updateScenario(scenarios, "one", { amount: 50_000 });
    expect(updated[0].amount).toBe(50_000);
    expect(updated[1].amount).toBe(scenarios[1].amount);
    expect(scenarios[0].amount).toBe(10_000);

    const remaining = removeScenario(updated, "one");
    expect(remaining).toHaveLength(MAX_FEE_SCENARIOS - 1);
    expect(remaining.some((item) => item.id === "one")).toBe(false);
  });

  it("uses published schedule overrides when provided", () => {
    const result = calculateProtocolFee(scenario(), {
      rates: { investment_fee: 1.25 },
      networkFeeXlm: 0.5,
      tiers: TIERS,
    });

    expect(result.baseFee).toBe(125);
    expect(result.networkFee).toBe(0.5);
    expect(result.finalFee).toBe(125.5);
  });
});
