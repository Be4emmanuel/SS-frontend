"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FEE_TIERS, type FeeType } from "@/lib/api";
import {
  addScenario,
  calculateProtocolFee,
  clampAmount,
  clampVolume,
  createScenario,
  FEE_ROLE_APPLICABILITY,
  MAX_FEE_SCENARIOS,
  MAX_TRANSACTION_AMOUNT_XLM,
  MIN_TRANSACTION_AMOUNT_XLM,
  removeScenario,
  ROLE_LABELS,
  TRANSACTION_LABELS,
  TRANSACTION_TYPES,
  updateScenario,
  type FeeRole,
  type FeeScenario,
  type FeeTransactionType,
  type ProtocolFeeConfig,
} from "@/lib/protocolFeeCalculator";

interface ProtocolFeeCalculatorProps {
  rates?: Partial<Record<FeeType, number>>;
  appliesTo?: Partial<Record<FeeType, FeeRole | "both">>;
  tiers?: typeof FEE_TIERS;
}

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function formatXlm(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  }).format(value);
}

function formatRate(value: number): string {
  return `${Number(value.toFixed(4))}%`;
}

function formatVolume(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function ProtocolFeeCalculator({
  rates,
  appliesTo,
  tiers = FEE_TIERS,
}: ProtocolFeeCalculatorProps) {
  const [scenarios, setScenarios] = useState<FeeScenario[]>(() => [
    createScenario("scenario-1"),
  ]);

  const config = useMemo<ProtocolFeeConfig>(
    () => ({ rates, appliesTo, tiers }),
    [rates, appliesTo, tiers]
  );

  const rows = useMemo(
    () =>
      scenarios.map((scenario) => ({
        scenario,
        result: calculateProtocolFee(scenario, config),
      })),
    [scenarios, config]
  );

  const cheapestFinalFee = rows.length
    ? Math.min(...rows.map((row) => row.result.finalFee))
    : 0;

  const patchScenario = (id: string, changes: Partial<FeeScenario>) => {
    setScenarios((current) => updateScenario(current, id, changes));
  };

  return (
    <div className="space-y-6" data-testid="protocol-fee-calculator">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Fee scenarios</CardTitle>
            <p className="text-sm text-muted-foreground">
              Compare up to {MAX_FEE_SCENARIOS} independent transactions. Results
              recalculate on every change.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={scenarios.length >= MAX_FEE_SCENARIOS}
            onClick={() => setScenarios((current) => addScenario(current))}
          >
            <Plus className="size-4" />
            Add scenario ({scenarios.length}/{MAX_FEE_SCENARIOS})
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            Protocol limits: {formatVolume(MIN_TRANSACTION_AMOUNT_XLM)}–
            {formatVolume(MAX_TRANSACTION_AMOUNT_XLM)} XLM per transaction.
            Out-of-range amounts are clamped to the nearest limit.
          </p>

          {rows.map(({ scenario, result }, index) => (
            <Card key={scenario.id} className="border-muted">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Scenario {index + 1}</Badge>
                  <Input
                    aria-label={`Scenario ${index + 1} name`}
                    value={scenario.name}
                    onChange={(event) =>
                      patchScenario(scenario.id, { name: event.target.value })
                    }
                    className="h-8 w-52"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={scenarios.length === 1}
                  onClick={() =>
                    setScenarios((current) => removeScenario(current, scenario.id))
                  }
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${scenario.id}-amount`}>Amount (XLM)</Label>
                    <Input
                      id={`${scenario.id}-amount`}
                      type="number"
                      min={MIN_TRANSACTION_AMOUNT_XLM}
                      max={MAX_TRANSACTION_AMOUNT_XLM}
                      step="100"
                      value={scenario.amount}
                      data-testid={`${scenario.id}-amount`}
                      onChange={(event) =>
                        patchScenario(scenario.id, {
                          amount: clampAmount(Number(event.target.value)).amount,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${scenario.id}-role`}>Role</Label>
                    <select
                      id={`${scenario.id}-role`}
                      className={selectClassName}
                      value={scenario.role}
                      onChange={(event) =>
                        patchScenario(scenario.id, {
                          role: event.target.value as FeeRole,
                        })
                      }
                    >
                      {(Object.keys(ROLE_LABELS) as FeeRole[]).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${scenario.id}-transaction`}>
                      Transaction type
                    </Label>
                    <select
                      id={`${scenario.id}-transaction`}
                      className={selectClassName}
                      value={scenario.transactionType}
                      onChange={(event) =>
                        patchScenario(scenario.id, {
                          transactionType: event.target.value as FeeTransactionType,
                        })
                      }
                    >
                      {TRANSACTION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {TRANSACTION_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${scenario.id}-tier`}>Fee tier</Label>
                    <select
                      id={`${scenario.id}-tier`}
                      className={selectClassName}
                      value={scenario.tier}
                      onChange={(event) =>
                        patchScenario(scenario.id, { tier: event.target.value })
                      }
                    >
                      {tiers.map((tier) => (
                        <option key={tier.tier} value={tier.tier}>
                          {tier.tier} ({formatRate(tier.fee_percentage)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${scenario.id}-volume`}>
                      Volume last 24h (XLM)
                    </Label>
                    <Input
                      id={`${scenario.id}-volume`}
                      type="number"
                      min={0}
                      step="1000"
                      value={scenario.volume24h}
                      data-testid={`${scenario.id}-volume`}
                      onChange={(event) =>
                        patchScenario(scenario.id, {
                          volume24h: clampVolume(Number(event.target.value)),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Base fee</p>
                    <p
                      className="font-mono text-lg font-semibold"
                      data-testid={`${scenario.id}-base-fee`}
                    >
                      {formatXlm(result.baseFee)} XLM
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRate(result.baseRate)} base rate
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Discount</p>
                    <p
                      className="font-mono text-lg font-semibold text-green-700 dark:text-green-400"
                      data-testid={`${scenario.id}-discount`}
                    >
                      −{formatXlm(result.discount)} XLM
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.discountEligibility.eligible
                        ? `${scenario.tier} at ${formatRate(result.discountEligibility.tierRate)}`
                        : "Not applied"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Network fee</p>
                    <p
                      className="font-mono text-lg font-semibold"
                      data-testid={`${scenario.id}-network-fee`}
                    >
                      {formatXlm(result.networkFee)} XLM
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Stellar base fee
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Final fee</p>
                    <p
                      className="font-mono text-lg font-bold"
                      data-testid={`${scenario.id}-final-fee`}
                    >
                      {formatXlm(result.finalFee)} XLM
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Platform + network
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {result.roleReason && (
                    <p
                      className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-muted-foreground"
                      data-testid={`${scenario.id}-role-notice`}
                    >
                      <Info className="mt-0.5 size-4 shrink-0" />
                      {result.roleReason}
                    </p>
                  )}
                  {result.discountEligibility.eligible ? (
                    <p
                      className="flex items-center gap-2 text-green-700 dark:text-green-400"
                      data-testid={`${scenario.id}-discount-notice`}
                    >
                      <CheckCircle2 className="size-4" />
                      Discount applied for {scenario.tier}.
                    </p>
                  ) : (
                    <p
                      className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                      data-testid={`${scenario.id}-discount-notice`}
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      {result.discountEligibility.reason}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scenario comparison</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each scenario keeps its own amount, role, transaction type and tier.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Network</TableHead>
                <TableHead className="text-right">Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ scenario, result }, index) => (
                <TableRow key={scenario.id}>
                  <TableCell className="font-medium">
                    {scenario.name || `Scenario ${index + 1}`}
                    {result.finalFee === cheapestFinalFee && (
                      <Badge className="ml-2" variant="secondary">
                        Lowest
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatXlm(scenario.amount)}
                  </TableCell>
                  <TableCell>{ROLE_LABELS[scenario.role]}</TableCell>
                  <TableCell>{TRANSACTION_LABELS[scenario.transactionType]}</TableCell>
                  <TableCell>{scenario.tier}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatXlm(result.baseFee)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-green-700 dark:text-green-400">
                    −{formatXlm(result.discount)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatXlm(result.networkFee)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatXlm(result.finalFee)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/fees"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Tier eligibility and fee schedule
          <ArrowUpRight className="size-3.5" />
        </Link>
        <Link
          href="/admin/fee-config"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Fee configuration
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
