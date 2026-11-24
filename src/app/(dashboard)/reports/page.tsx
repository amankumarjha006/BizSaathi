import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      title="Reports"
      description="Daily sales summaries, purchase breakdowns, expense reports, and inventory valuation insights."
      phase="Phase 5"
      icon={<BarChart3 className="h-5 w-5" />}
      plannedCapabilities={[
        "Daily, weekly, and monthly sales vs. purchase summaries.",
        "Expense category tracking and net cashflow visibility.",
        "Outstanding customer Udhaar aging and supplier payable summaries.",
        "Voice-accessible business performance queries.",
      ]}
      architectureNote="Backed by analyticsService aggregating confirmed Transaction, Payment, LedgerEntry, and StockMovement records from PostgreSQL."
    />
  );
}
