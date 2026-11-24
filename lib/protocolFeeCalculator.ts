import { FEE_TIERS, type FeeType, type FeeTierEntry } from "@/lib/api";
import { BASE_NETWORK_FEE_XLM } from "@/lib/feeEstimate";

export const MIN_TRANSACTION_AMOUNT_XLM = 100;
export const MAX_TRANSACTION_AMOUNT_XLM = 1_000_000;
export const MAX_FEE_SCENARIOS = 5;
export const XLM_DECIMALS = 7;

export type FeeRole = "investor" | "issuer";
export type FeeTransactionType =
  | "investment"
  | "secondary_sale"
  | "settlement"
  | "early_exit";

export const TRANSACTION_FEE_TYPES: Record<FeeTransactionType, FeeType> = {
  investment: "investment_fee",
  secondary_sale: "secondary_market_fee",
  settlement: "settlement_fee",
  early_exit: "early_exit_penalty",
};

export const ROLE_LABELS: Record<FeeRole, string> = {
  investor: "Investor",
  issuer: "Issuer",
};

export const TRANSACTION_LABELS: Record<FeeTransactionType, string> = {
  investment: "Investment",
  secondary_sale: "Secondary sale",
  settlement: "Settlement",
  early_exit: "Early exit",
};

export const TRANSACTION_TYPES: FeeTransactionType[] = [
  "investment",
  "secondary_sale",
  "settlement",
  "early_exit",
];

export const FEE_ROLE_APPLICABILITY: Record<FeeType, FeeRole | "both"> = {
  investment_fee: "investor",
  secondary_market_fee: "both",
  settlement_fee: "issuer",
  early_exit_penalty: "investor",
};

export const DEFAULT_FEE_RATES: Record<FeeType, number> = {
  investment_fee: 2.5,
  secondary_market_fee: 2.5,
  settlement_fee: 1.5,
  early_exit_penalty: 2,
};

export interface FeeScenario {
  id: string;
  name: string;
  amount: number;
  role: FeeRole;
  transactionType: FeeTransactionType;
  tier: string;
  volume24h: number;
}

export interface ProtocolFeeConfig {
  rates?: Partial<Record<FeeType, number>>;
  appliesTo?: Partial<Record<FeeType, FeeRole | "both">>;
  tiers?: FeeTierEntry[];
  networkFeeXlm?: number;
}

export interface DiscountEligibility {
  eligible: boolean;
  reason: string | null;
  tierRate: number;
  minimumVolume: number;
}

export interface ProtocolFeeResult {
  baseRate: number;
  baseFee: number;
  discount: number;
  discountedFee: number;
  networkFee: number;
  finalFee: number;
  roleApplies: boolean;
  roleReason: string | null;
  discountEligibility: DiscountEligibility;
}

export interface ClampedAmount {
  amount: number;
  clamped: boolean;
}

export function roundXlm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** XLM_DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clampAmount(raw: number): ClampedAmount {
  const value = Number.isFinite(raw) ? raw : MIN_TRANSACTION_AMOUNT_XLM;
  if (value < MIN_TRANSACTION_AMOUNT_XLM) {
    return { amount: MIN_TRANSACTION_AMOUNT_XLM, clamped: true };
  }
  if (value > MAX_TRANSACTION_AMOUNT_XLM) {
    return { amount: MAX_TRANSACTION_AMOUNT_XLM, clamped: true };
  }
  return { amount: roundXlm(value), clamped: false };
}

export function clampVolume(raw: number): number {
  return Number.isFinite(raw) ? Math.max(0, roundXlm(raw)) : 0;
}

export function createScenario(id: string): FeeScenario {
  return {
    id,
    name: "Scenario 1",
    amount: 10_000,
    role: "investor",
    transactionType: "investment",
    tier: FEE_TIERS[0]?.tier ?? "Standard",
    volume24h: 0,
  };
}

export function addScenario(scenarios: FeeScenario[]): FeeScenario[] {
  if (scenarios.length >= MAX_FEE_SCENARIOS) return scenarios;
  const used = new Set(scenarios.map((scenario) => scenario.id));
  let index = 1;
  while (used.has(`scenario-${index}`)) index += 1;
  const scenario = createScenario(`scenario-${index}`);
  return [...scenarios, { ...scenario, name: `Scenario ${scenarios.length + 1}` }];
}

export function updateScenario(
  scenarios: FeeScenario[],
  id: string,
  changes: Partial<FeeScenario>
): FeeScenario[] {
  return scenarios.map((scenario) =>
    scenario.id === id ? { ...scenario, ...changes, id: scenario.id } : scenario
  );
}

export function removeScenario(scenarios: FeeScenario[], id: string): FeeScenario[] {
  return scenarios.filter((scenario) => scenario.id !== id);
}

function resolveRate(
  feeType: FeeType,
  config: ProtocolFeeConfig
): number {
  const rate = config.rates?.[feeType] ?? DEFAULT_FEE_RATES[feeType];
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
}

function resolveAppliesTo(
  feeType: FeeType,
  config: ProtocolFeeConfig
): FeeRole | "both" {
  return config.appliesTo?.[feeType] ?? FEE_ROLE_APPLICABILITY[feeType];
}

function resolveTier(name: string, config: ProtocolFeeConfig): FeeTierEntry | undefined {
  const tiers = config.tiers ?? FEE_TIERS;
  const target = name.trim().toLowerCase();
  return tiers.find((tier) => tier.tier.toLowerCase() === target);
}

export function getDiscountEligibility(
  scenario: FeeScenario,
  config: ProtocolFeeConfig = {}
): DiscountEligibility {
  const tier = resolveTier(scenario.tier, config);
  const minimumVolume = tier && Number.isFinite(tier.min_volume) ? tier.min_volume : 0;
  const tierRate = tier && Number.isFinite(tier.fee_percentage) ? tier.fee_percentage : 0;
  const baseRate = resolveRate(TRANSACTION_FEE_TYPES[scenario.transactionType], config);
  const volume = clampVolume(scenario.volume24h);

  if (!tier) {
    return {
      eligible: false,
      reason: "The selected tier is not available in the current fee configuration.",
      tierRate,
      minimumVolume,
    };
  }

  if (volume < minimumVolume) {
    return {
      eligible: false,
      reason: `${tier.tier} requires ${minimumVolume.toLocaleString("en-US")} XLM in 24h volume; this scenario uses ${volume.toLocaleString("en-US")} XLM.`,
      tierRate,
      minimumVolume,
    };
  }

  if (scenario.transactionType === "early_exit") {
    return {
      eligible: false,
      reason: "Early exit penalties are not eligible for volume discounts.",
      tierRate,
      minimumVolume,
    };
  }

  if (baseRate <= 0) {
    return {
      eligible: false,
      reason: "This transaction has no base fee to discount.",
      tierRate,
      minimumVolume,
    };
  }

  if (tierRate >= baseRate) {
    return {
      eligible: false,
      reason: `${tier.tier} charges ${tierRate}% versus the ${baseRate}% base rate, so it does not reduce this fee.`,
      tierRate,
      minimumVolume,
    };
  }

  return { eligible: true, reason: null, tierRate, minimumVolume };
}

export function calculateProtocolFee(
  scenario: FeeScenario,
  config: ProtocolFeeConfig = {}
): ProtocolFeeResult {
  const feeType = TRANSACTION_FEE_TYPES[scenario.transactionType];
  const baseRate = resolveRate(feeType, config);
  const appliesTo = resolveAppliesTo(feeType, config);
  const roleApplies = appliesTo === "both" || appliesTo === scenario.role;
  const amount = clampAmount(scenario.amount).amount;
  const baseFee = roleApplies ? roundXlm((amount * baseRate) / 100) : 0;
  const discountEligibility = getDiscountEligibility(scenario, config);
  const rawDiscount = discountEligibility.eligible
    ? roundXlm((amount * (baseRate - discountEligibility.tierRate)) / 100)
    : 0;
  const discount = roleApplies ? Math.min(baseFee, Math.max(0, rawDiscount)) : 0;
  const discountedFee = roundXlm(baseFee - discount);
  const networkFee = roundXlm(config.networkFeeXlm ?? BASE_NETWORK_FEE_XLM);
  const finalFee = roundXlm(discountedFee + networkFee);
  const appliesToLabel = appliesTo === "both" ? "both roles" : ROLE_LABELS[appliesTo];
  const roleReason = roleApplies
    ? null
    : `${TRANSACTION_LABELS[scenario.transactionType]} fees apply to ${appliesToLabel}, not ${ROLE_LABELS[scenario.role].toLowerCase()}s.`;

  return {
    baseRate,
    baseFee,
    discount,
    discountedFee,
    networkFee,
    finalFee,
    roleApplies,
    roleReason,
    discountEligibility,
  };
}
