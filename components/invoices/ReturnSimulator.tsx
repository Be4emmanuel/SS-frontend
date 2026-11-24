"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateReturns, daysUntil, parseAmount, DEFAULT_FRACTION_PRICE } from "@/lib/returnsCalculator";

type Scenario = "on-time" | "late" | "default";

interface ReturnSimulatorProps {
  faceValue: number;
  yieldPercentage?: number | null;
  maturityDate: string;
  fractionPrice?: number;
  guaranteePercentage?: number | null;
  coverPercentage?: number | null;
  collateralAmount?: number | null;
}

export function ReturnSimulator({
  faceValue,
  yieldPercentage = 0,
  maturityDate,
  fractionPrice = DEFAULT_FRACTION_PRICE,
  guaranteePercentage = 0,
  coverPercentage = 0,
  collateralAmount = 0,
}: ReturnSimulatorProps) {
  const [amountRaw, setAmountRaw] = useState("");
  const [scenario, setScenario] = useState<Scenario>("on-time");
  const [delayDays, setDelayDays] = useState("30");
  const [lateRate, setLateRate] = useState(String(yieldPercentage ?? 0));

  const amount = parseAmount(amountRaw);
  const daysRemaining = daysUntil(maturityDate);
  const onTime = calculateReturns({
    amount,
    fractionPrice,
    faceValue,
    yieldPercentage: yieldPercentage ?? 0,
    daysRemaining,
  });

  const result = useMemo(() => {
    if (scenario === "on-time") {
      const net = onTime.projectedYield;
      const returnPercentage = amount > 0 ? (net / amount) * 100 : 0;
      const annualized = daysRemaining > 0 ? (returnPercentage * 365) / daysRemaining : 0;
      return { net, payout: amount + net, returnPercentage, annualized };
    }

    if (scenario === "late") {
      const delay = Math.max(0, Number(delayDays) || 0);
      const additionalYield =
        amount * ((Math.max(0, Number(lateRate) || 0) / 100) * (delay / 365));
      const net = onTime.projectedYield + additionalYield;
      const returnPercentage = amount > 0 ? (net / amount) * 100 : 0;
      const annualized = delay + daysRemaining > 0
        ? (returnPercentage * 365) / (delay + daysRemaining)
        : 0;
      return { net, payout: amount + net, returnPercentage, annualized };
    }

    const guarantee = amount * ((guaranteePercentage ?? 0) / 100);
    const cover = amount * ((coverPercentage ?? 0) / 100);
    const collateral = Math.min(amount, collateralAmount ?? 0);
    const recovery = Math.min(amount, guarantee + cover + collateral);
    return {
      net: recovery - amount,
      payout: recovery,
      returnPercentage: amount > 0 ? ((recovery - amount) / amount) * 100 : 0,
      annualized: 0,
    };
  }, [scenario, onTime.projectedYield, amount, daysRemaining, delayDays, lateRate, guaranteePercentage, coverPercentage, collateralAmount]);

  return (
    <Card data-testid="return-simulator">
      <CardHeader>
        <h2 className="font-semibold">What-if return simulator</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="simulator-amount">Amount to invest (XLM)</Label>
          <Input
            id="simulator-amount"
            type="number"
            min={0}
            value={amountRaw}
            onChange={(event) => setAmountRaw(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Return scenario">
          {(["on-time", "late", "default"] as Scenario[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={scenario === item}
              onClick={() => setScenario(item)}
              className={`rounded-md border px-2 py-2 text-sm capitalize ${scenario === item ? "border-primary bg-primary/10" : ""}`}
            >
              {item}
            </button>
          ))}
        </div>

        {scenario === "late" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="late-delay">Delay days</Label>
              <Input id="late-delay" type="number" min={0} value={delayDays} onChange={(event) => setDelayDays(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="late-rate">Late interest rate (%)</Label>
              <Input id="late-rate" type="number" min={0} value={lateRate} onChange={(event) => setLateRate(event.target.value)} />
            </div>
          </div>
        )}

        {scenario === "default" && (
          <p className="text-xs text-muted-foreground">
            Recovery includes {guaranteePercentage ?? 0}% guarantee, {coverPercentage ?? 0}% cover, and up to {collateralAmount ?? 0} XLM collateral.
          </p>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Net return</dt>
            <dd className="font-semibold">{result.net.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Return</dt>
            <dd className="font-semibold">{result.returnPercentage.toFixed(2)}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Annualized yield</dt>
            <dd className="font-semibold">{result.annualized.toFixed(2)}%</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Illustrative scenarios only. Outcomes are not guaranteed.
        </p>
      </CardContent>
    </Card>
  );
}
