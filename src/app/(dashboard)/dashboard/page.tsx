import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  IndianRupee,
  Mic,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SAMPLE_KPIS = [
  {
    label: "Today's Sales",
    value: "₹18,450",
    note: "Sample · 14 bills",
    icon: TrendingUp,
    accentClass: "bg-[#22B55B]/12 text-[#22B55B]",
    badgeVariant: "success" as const,
  },
  {
    label: "Total Purchases",
    value: "₹42,300",
    note: "Sample · This week",
    icon: ShoppingBag,
    accentClass: "bg-[#4285F4]/12 text-[#4285F4]",
    badgeVariant: "info" as const,
  },
  {
    label: "Outstanding Udhaar",
    value: "₹12,850",
    note: "Sample · 6 customers",
    icon: IndianRupee,
    accentClass: "bg-[#F0B03B]/20 text-[#8A5A00]",
    badgeVariant: "amber" as const,
  },
  {
    label: "Low-Stock Products",
    value: "4 items",
    note: "Sample · Below min stock",
    icon: AlertTriangle,
    accentClass: "bg-[#FF4F78]/12 text-[#FF4F78]",
    badgeVariant: "alert" as const,
  },
];

const SAMPLE_TRANSACTIONS = [
  {
    id: "TXN-1042",
    party: "Verma Provision (Walk-in)",
    type: "SALE",
    amount: "₹1,240",
    payment: "UPI · Paid",
    status: "CONFIRMED",
  },
  {
    id: "TXN-1041",
    party: "Mahavir Wholesale Distributors",
    type: "PURCHASE",
    amount: "₹14,800",
    payment: "Bank Transfer · Partial",
    status: "CONFIRMED",
  },
  {
    id: "TXN-1040",
    party: "Sunita Devi (Khata)",
    type: "SALE",
    amount: "₹680",
    payment: "Udhaar · Unpaid",
    status: "CONFIRMED",
  },
  {
    id: "TXN-1039",
    party: "Shop Electricity & Transport",
    type: "EXPENSE",
    amount: "₹950",
    payment: "Cash · Paid",
    status: "CONFIRMED",
  },
];

const SAMPLE_LOW_STOCK = [
  { name: "Aashirvaad Atta (5 kg)", current: "3 bags", min: "8 bags" },
  { name: "Fortune Mustard Oil (1 L)", current: "4 btls", min: "12 btls" },
  { name: "Tata Salt (1 kg)", current: "6 pkts", min: "20 pkts" },
  { name: "Amul Taaza Milk (500 ml)", current: "5 pkts", min: "15 pkts" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header & Sample Data Disclosure */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[#353535] sm:text-3xl">
              Business Overview
            </h1>
            <Badge variant="amber">Sample Preview Data</Badge>
          </div>
          <p className="mt-1 text-sm text-[#756F69]">
            Phase 1 foundation layout. Figures below are illustrative samples —
            live PostgreSQL calculations will be connected in Phase 2–5.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/documents"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-4 py-2.5 text-sm font-semibold text-[#353535] shadow-sm transition-colors hover:bg-[#DDA02D]"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span>Documents (Phase 3)</span>
          </Link>
          <Link
            href="/voice"
            className="inline-flex items-center gap-2 rounded-xl border border-[#353535] bg-[#353535] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#353535]/90"
          >
            <Mic className="h-4 w-4 text-[#F0B03B]" aria-hidden="true" />
            <span>Voice Assistant (Phase 4)</span>
          </Link>
        </div>
      </div>

      {/* KPI Grid */}
      <section aria-label="Key business metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SAMPLE_KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-[#756F69]">
                      {kpi.label}
                    </p>
                    <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535] tabular-nums">
                      {kpi.value}
                    </p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${kpi.accentClass}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3">
                  <Badge variant={kpi.badgeVariant}>{kpi.note}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>
                Unified ledger for sales, supplier purchases, and shop expenses
                (sample preview)
              </CardDescription>
            </div>
            <Link
              href="/transactions"
              className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4 hover:text-[#756F69]"
            >
              View module →
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  <th className="pb-3 pr-4">Ref</th>
                  <th className="pb-3 pr-4">Party / Description</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Payment</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {SAMPLE_TRANSACTIONS.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#E3DFD6]/20">
                    <td className="py-3 pr-4 font-mono text-xs text-[#756F69]">
                      {tx.id}
                    </td>
                    <td className="py-3 pr-4 font-medium text-[#353535]">
                      {tx.party}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={
                          tx.type === "SALE"
                            ? "success"
                            : tx.type === "PURCHASE"
                            ? "info"
                            : "neutral"
                        }
                      >
                        {tx.type}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#756F69]">
                      {tx.payment}
                    </td>
                    <td className="py-3 text-right font-semibold text-[#353535] tabular-nums">
                      {tx.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Low-Stock Watchlist & Inventory Overview */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Inventory Overview</CardTitle>
              <CardDescription>
                Low-stock items needing restock (sample preview)
              </CardDescription>
            </div>
            <Link
              href="/inventory"
              className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4 hover:text-[#756F69]"
            >
              Inventory →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {SAMPLE_LOW_STOCK.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/25 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#353535]">
                    {item.name}
                  </p>
                  <p className="text-xs text-[#756F69]">
                    Min threshold: {item.min}
                  </p>
                </div>
                <Badge variant="alert">{item.current}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Business Activity & Architecture Summary */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-[#E3DFD6] p-2 text-[#353535]">
                <Package className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <CardTitle>Stock Movement Rules</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-[#756F69]">
            Purchases increase stock only after confirmation. Sales decrease
            stock atomically. Customer orders and expenses do not mutate stock
            automatically.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-[#4285F4]/12 p-2 text-[#4285F4]">
                <ArrowDownLeft className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <CardTitle>Document Intelligence</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-[#756F69]">
            Planned in Phase 3: Upload supplier invoices, sales receipts, or
            expense bills for Gemini extraction, product matching, and review.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-[#22B55B]/12 p-2 text-[#22B55B]">
                <Users className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <CardTitle>Customer Khata &amp; Voice</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-[#756F69]">
            <span className="inline-flex items-center gap-1 text-[#353535] font-medium">
              <ArrowUpRight className="h-3.5 w-3.5 text-[#22B55B]" aria-hidden="true" />
              Hinglish, Hindi &amp; English
            </span>{" "}
            voice commands will route through the exact same validated
            transaction service in Phase 4.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
