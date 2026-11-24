"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calculator } from "lucide-react";
import { ProtocolFeeCalculator } from "@/components/fees/ProtocolFeeCalculator";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { fetchFeeSchedule, type FeeType } from "@/lib/api";
import type { FeeRole } from "@/lib/protocolFeeCalculator";

export default function FeeCalculatorPage() {
  usePageTitle("Fee Calculator");
  const [rates, setRates] = useState<Partial<Record<FeeType, number>>>({});
  const [appliesTo, setAppliesTo] = useState<
    Partial<Record<FeeType, FeeRole | "both">>
  >({});

  useEffect(() => {
    let active = true;

    fetchFeeSchedule()
      .then((schedule) => {
        if (!active) return;
        const nextRates: Partial<Record<FeeType, number>> = {};
        const nextAppliesTo: Partial<Record<FeeType, FeeRole | "both">> = {};
        for (const fee of schedule.fees) {
          nextRates[fee.fee_type] = fee.rate_percentage;
          nextAppliesTo[fee.fee_type] = fee.applies_to;
        }
        setRates(nextRates);
        setAppliesTo(nextAppliesTo);
      })
      .catch(() => {
        if (!active) return;
        setRates({});
        setAppliesTo({});
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/fees">
            <ArrowLeft className="size-4" />
            Back to fee schedule
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Calculator className="size-7" />
          <h1 className="text-3xl font-bold">Protocol fee calculator</h1>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          Model the base fee, volume discount, Stellar network fee and final
          cost for each role and transaction type. Compare up to five scenarios
          side by side.
        </p>
      </header>

      <ProtocolFeeCalculator rates={rates} appliesTo={appliesTo} />
    </main>
  );
}
