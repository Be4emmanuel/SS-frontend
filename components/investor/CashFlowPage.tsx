"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useExpectedCashFlow, type CashFlowRange } from "@/hooks/useExpectedCashFlow";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function CashFlowPage() {
  const [range, setRange] = useState<CashFlowRange>("6m");
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [separate, setSeparate] = useState(true);
  const { data, isLoading } = useExpectedCashFlow(range);

  const monthStart = useMemo(() => startOfMonth(new Date()), []);
  const monthCount = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const byDate = useMemo(() => new Map((data?.days ?? [])
    .filter((day) => includeOverdue || !day.invoices.every((invoice) => invoice.overdue))
    .map((day) => [day.date, day])), [data, includeOverdue]);

  const summaries = [30, 90, 365].map((days) => {
    const end = new Date();
    end.setDate(end.getDate() + days);
    const total = (data?.days ?? [])
      .filter((day) => {
        const date = new Date(`${day.date}T00:00:00`);
        return date >= new Date(new Date().toDateString()) && date <= end;
      })
      .reduce((sum, day) => sum + day.principal + day.yieldAmount, 0);
    return { days, total };
  });

  if (isLoading) {
    return <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-24" />)}</div>;
  }

  if (!data || data.openPositionCount === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="mb-4 text-muted-foreground">No open positions to project.</p>
          <Button asChild><Link href="/marketplace">Browse invoices</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="cash-flow-page">
      <div className="grid gap-3 sm:grid-cols-3">
        {summaries.map(({ days, total }) => (
          <Card key={days}>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Next {days} days</p>
              <p className="text-xl font-bold">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <h2 className="font-semibold">Expected cash flow</h2>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {(["3m", "6m", "12m"] as CashFlowRange[]).map((value) => (
              <Button key={value} size="sm" variant={range === value ? "default" : "outline"} onClick={() => setRange(value)}>
                {value.toUpperCase()}
              </Button>
            ))}
            <label className="flex items-center gap-2">
              <Switch checked={includeOverdue} onCheckedChange={setIncludeOverdue} />
              Overdue
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={separate} onCheckedChange={setSeparate} />
              Principal / yield
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            {Array.from({ length: monthCount }, (_, monthIndex) => {
              const month = new Date(monthStart.getFullYear(), monthStart.getMonth() + monthIndex, 1);
              const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
              const monthly = (data.days ?? []).filter((day) => day.date.startsWith(prefix));
              const total = monthly.reduce((sum, day) => sum + day.principal + day.yieldAmount, 0);
              const max = Math.max(1, ...Array.from({ length: monthCount }, (__, i) => {
                const p = new Date(monthStart.getFullYear(), monthStart.getMonth() + i, 1);
                const pp = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
                return (data.days ?? []).filter((d) => d.date.startsWith(pp)).reduce((s, d) => s + d.principal + d.yieldAmount, 0);
              }));
              return (
                <div key={prefix} className="grid grid-cols-[70px_1fr_110px] items-center gap-3 text-sm">
                  <span>{month.toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</span>
                  <div className="h-3 overflow-hidden rounded bg-muted">
                    <div className="h-full rounded bg-primary" style={{ width: `${(total / max) * 100}%` }} />
                  </div>
                  <span className="text-right font-medium">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM</span>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4">
            {Array.from({ length: monthCount }, (_, monthIndex) => {
              const month = new Date(monthStart.getFullYear(), monthStart.getMonth() + monthIndex, 1);
              const firstDay = month.getDay();
              const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
              const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
              return (
                <div key={month.toISOString()}>
                  <h3 className="mb-2 font-medium">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
                  <div className="grid grid-cols-7 gap-px overflow-hidden rounded border bg-border">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                      <div key={label} className="bg-muted/60 p-1 text-center text-[10px] text-muted-foreground">{label}</div>
                    ))}
                    {cells.map((day, index) => {
                      if (!day) return <div key={`blank-${index}`} className="min-h-20 bg-background" />;
                      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const projection = byDate.get(key);
                      return (
                        <div key={key} className="min-h-20 bg-background p-1.5 text-xs">
                          <span className="text-muted-foreground">{day}</span>
                          {projection && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" className="mt-1 block w-full rounded bg-primary/10 p-1 text-left text-primary">
                                  {separate
                                    ? `${projection.principal.toLocaleString(undefined, { maximumFractionDigits: 1 })} + ${projection.yieldAmount.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                                    : `${(projection.principal + projection.yieldAmount).toLocaleString(undefined, { maximumFractionDigits: 1 })}`}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72">
                                <p className="mb-2 flex items-center gap-2 font-semibold"><CalendarDays className="size-4" />Invoices due</p>
                                {projection.invoices.map((invoice) => (
                                  <div key={invoice.invoiceId} className="border-t py-2 text-sm first:border-t-0">
                                    <p className="font-medium">{invoice.title}</p>
                                    <p className="text-muted-foreground">
                                      Principal {invoice.principal.toLocaleString()} XLM · Yield {invoice.yieldAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM
                                    </p>
                                  </div>
                                ))}
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
