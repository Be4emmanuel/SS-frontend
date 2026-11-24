"use client";

import { InvestorDashboard } from "@/components/dashboard/InvestorDashboard";
import { SavingsGoalsDashboard } from "@/components/investor/SavingsGoalsDashboard";

export default function InvestorDashboardPage() {
  return (
    <main className="container mx-auto px-4 py-8 space-y-8">
      <InvestorDashboard />
      <SavingsGoalsDashboard />
    </main>
  );
}
