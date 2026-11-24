"use client";

import { CashFlowPage } from "@/components/investor/CashFlowPage";

export default function PortfolioCashFlowPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Cash Flow Calendar</h1>
      <CashFlowPage />
    </main>
  );
}
