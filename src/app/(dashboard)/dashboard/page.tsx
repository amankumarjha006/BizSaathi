"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  IndianRupee,
  Lightbulb,
  Mic,
  Package,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import {
  DateRangeFilter,
  type DateRangeSelection,
} from "@/components/analytics/DateRangeFilter";
import { PaymentDonutChart } from "@/components/analytics/PaymentDonutChart";
import { SalesTrendChart } from "@/components/analytics/SalesTrendChart";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, formatInr } from "@/lib/api-client";
import type { BusinessInsight } from "@/server/services/analytics/business-insights.service";
import type {
  PaymentBreakdownMap,
  SalesTrendPoint,
  TopProductPoint,
} from "@/server/services/analytics/sales-analytics.service";

interface DashboardAnalyticsPayload {
  range: {
    preset: string;
    label: string;
    comparisonLabel: string;
    timeZone: string;
  };
  salesSummary: {
    grossSales: number;
    returnsTotal: number;
    netSales: number;
    transactionCount: number;
    averageTransactionValue: number;
    amountCollected: number;
    previousNetSales: number;
    salesGrowthPct: number | null;
  };
  paymentDistribution: PaymentBreakdownMap;
  salesTrend: SalesTrendPoint[];
  topProducts: TopProductPoint[];
  purchaseSummary: {
    totalPurchases: number;
    transactionCount: number;
    amountPaidToSuppliers: number;
  };
  expenseSummary: {
    totalExpenses: number;
    expensesPaid: number;
    transactionCount: number;
  };
  cashMovement: {
    cashReceived: number;
    cashPaidSuppliers: number;
    cashPaidExpenses: number;
    totalCashPaid: number;
    netRecordedCashMovement: number;
    disclaimer: string;
  };
  customerSummary: {
    totalOutstanding: number;
    pendingCustomersCount: number;
    topPendingCustomers: Array<{
      id: string;
      name: string;
      outstandingDue: number;
    }>;
  };
  supplierSummary: {
    totalPayables: number;
    pendingSuppliersCount: number;
    topPayableSuppliers: Array<{
      id: string;
      name: string;
      outstandingPayable: number;
    }>;
  };
  inventoryHealth: {
    totalActiveProducts: number;
    healthyCount: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  inventoryValuation: {
    estimatedPurchaseCostValue: number;
    valuedProductsCount: number;
    methodNote: string;
  };
  lowStockProducts: Array<{
    id: string;
    name: string;
    currentStock: number;
    minimumStock: number;
    unit: string;
    purchasePrice: number;
  }>;
  recentTransactions: Array<{
    id: string;
    transactionType: string;
    referenceNumber: string | null;
    transactionDate: string;
    customerName: string | null;
    supplierName: string | null;
    totalAmount: number;
    paymentStatus: string;
  }>;
}

interface InsightsResponse {
  insights: BusinessInsight[];
  aiNarrative: string | null;
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeSelection>({
    preset: "LAST_7_DAYS",
    from: "",
    to: "",
  });
  const [groupBy, setGroupBy] = useState<"daily" | "weekly" | "monthly">(
    "daily"
  );
  const [data, setData] = useState<DashboardAnalyticsPayload | null>(null);
  const [insightsData, setInsightsData] = useState<InsightsResponse | null>(
    null
  );
  const [includeAi, setIncludeAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        preset: dateRange.preset,
        groupBy,
      });
      if (dateRange.preset === "CUSTOM" && dateRange.from) {
        params.set("from", dateRange.from);
        if (dateRange.to) params.set("to", dateRange.to);
      }

      const insightParams = new URLSearchParams(params);
      if (includeAi) insightParams.set("explain", "true");

      const [dash, ins] = await Promise.all([
        apiFetch<DashboardAnalyticsPayload>(
          `/api/analytics/dashboard?${params.toString()}`
        ),
        apiFetch<InsightsResponse>(
          `/api/analytics/insights?${insightParams.toString()}`
        ),
      ]);
      setData(dash);
      setInsightsData(ins);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load dashboard analytics."
      );
    } finally {
      setLoading(false);
    }
  }, [dateRange, groupBy, includeAi]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => clearTimeout(id);
  }, [loadDashboard]);

  const growthPct = data?.salesSummary.salesGrowthPct ?? null;

  return (
    <div className="space-y-6">
      {/* Top Bar: Greeting, Business Name, Date-Range Selector */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[#353535] sm:text-3xl">
            Business Intelligence Dashboard
          </h1>
          <p className="mt-1 text-sm text-[#756F69]">
            Live metrics in{" "}
            <span className="font-medium text-[#353535]">Asia/Kolkata</span>{" "}
            timezone ·{" "}
            {data
              ? `${data.range.label} vs. ${data.range.comparisonLabel}`
              : "Loading period..."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs font-semibold text-[#353535] hover:bg-[#E3DFD6]/40 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#F0B03B] px-3.5 py-2 text-xs font-bold text-[#353535] shadow-sm hover:bg-[#DDA02D]"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> New Sale
          </Link>
          <Link
            href="/purchases"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#353535] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#353535]/90"
          >
            <Truck className="h-3.5 w-3.5 text-[#F0B03B]" /> Record Purchase
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-4 text-sm text-[#B81D43]"
        >
          <p className="font-semibold">Unable to load live analytics</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      )}

      {/* Section 1: Primary Business Performance Cards */}
      <section
        aria-label="Primary performance summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  Total Sales ({data?.range.label ?? "Period"})
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535] tabular-nums">
                  {data ? formatInr(data.salesSummary.netSales) : "—"}
                </p>
                <p className="mt-1 text-xs text-[#756F69]">
                  {data
                    ? `${data.salesSummary.transactionCount} bill(s) · Avg ${formatInr(
                        data.salesSummary.averageTransactionValue
                      )}`
                    : "Loading..."}
                </p>
              </div>
              <div className="rounded-xl bg-[#22B55B]/12 p-2.5 text-[#22B55B]">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            {growthPct !== null && (
              <div className="mt-3">
                <Badge
                  variant={
                    growthPct > 0
                      ? "success"
                      : growthPct < 0
                      ? "alert"
                      : "neutral"
                  }
                >
                  {growthPct > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : growthPct < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : null}
                  {growthPct >= 0 ? `+${growthPct}%` : `${growthPct}%`} vs{" "}
                  {data?.range.comparisonLabel}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  Amount Collected
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-[#22B55B] tabular-nums">
                  {data ? formatInr(data.salesSummary.amountCollected) : "—"}
                </p>
                <p className="mt-1 text-xs text-[#756F69]">
                  Actual recorded customer payments (Cash, UPI, Bank)
                </p>
              </div>
              <div className="rounded-xl bg-[#4285F4]/12 p-2.5 text-[#4285F4]">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  Customer Outstanding
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-[#8A5A00] tabular-nums">
                  {data
                    ? formatInr(data.customerSummary.totalOutstanding)
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-[#756F69]">
                  {data
                    ? `${data.customerSummary.pendingCustomersCount} customer(s) with pending Udhaar`
                    : "Loading..."}
                </p>
              </div>
              <div className="rounded-xl bg-[#F0B03B]/20 p-2.5 text-[#8A5A00]">
                <IndianRupee className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <Link
                href="/customers"
                className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
              >
                Open Khata →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  Low-Stock Products
                </p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535] tabular-nums">
                  {data ? data.inventoryHealth.lowStockCount : "—"}
                </p>
                <p className="mt-1 text-xs text-[#756F69]">
                  {data
                    ? `${data.inventoryHealth.outOfStockCount} out of stock · ${data.inventoryHealth.totalActiveProducts} active`
                    : "Loading..."}
                </p>
              </div>
              <div className="rounded-xl bg-[#FF4F78]/12 p-2.5 text-[#FF4F78]">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3">
              <Link
                href="/inventory"
                className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
              >
                Inspect Inventory →
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Secondary KPI Strip: Purchases, Expenses, Supplier Payables, Est. Inventory Value */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-[#756F69]">Total Purchases</p>
              <p className="mt-0.5 text-lg font-bold text-[#353535] tabular-nums">
                {data ? formatInr(data.purchaseSummary.totalPurchases) : "—"}
              </p>
              <p className="text-[11px] text-[#756F69]">
                Paid:{" "}
                {data
                  ? formatInr(data.purchaseSummary.amountPaidToSuppliers)
                  : "—"}
              </p>
            </div>
            <ShoppingBag className="h-5 w-5 text-[#4285F4]" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-[#756F69]">Total Expenses</p>
              <p className="mt-0.5 text-lg font-bold text-[#353535] tabular-nums">
                {data ? formatInr(data.expenseSummary.totalExpenses) : "—"}
              </p>
              <p className="text-[11px] text-[#756F69]">
                {data
                  ? `${data.expenseSummary.transactionCount} expense record(s)`
                  : "—"}
              </p>
            </div>
            <Wallet className="h-5 w-5 text-[#FF4F78]" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-[#756F69]">Supplier Payables</p>
              <p className="mt-0.5 text-lg font-bold text-[#353535] tabular-nums">
                {data ? formatInr(data.supplierSummary.totalPayables) : "—"}
              </p>
              <p className="text-[11px] text-[#756F69]">
                {data
                  ? `${data.supplierSummary.pendingSuppliersCount} supplier(s) due`
                  : "—"}
              </p>
            </div>
            <Building2 className="h-5 w-5 text-[#353535]" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-[#756F69]">
                Est. Inventory Cost Value
              </p>
              <p className="mt-0.5 text-lg font-bold text-[#353535] tabular-nums">
                {data
                  ? formatInr(
                      data.inventoryValuation.estimatedPurchaseCostValue
                    )
                  : "—"}
              </p>
              <p className="text-[11px] text-[#756F69]">
                Based on catalog purchase prices
              </p>
            </div>
            <Package className="h-5 w-5 text-[#22B55B]" />
          </CardContent>
        </Card>
      </section>

      {/* Section 2: Sales Trend Chart + Payment Distribution */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Sales Trend</CardTitle>
              <CardDescription>
                Confirmed net sales in Asia/Kolkata ({data?.range.label ?? "..."})
              </CardDescription>
            </div>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
            >
              <span>Full Reports</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            <SalesTrendChart
              data={data?.salesTrend ?? []}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payment Distribution</CardTitle>
              <CardDescription>
                Collections recorded by payment method
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {data ? (
              <PaymentDonutChart distribution={data.paymentDistribution} />
            ) : (
              <p className="text-sm text-[#756F69]">Loading...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Top-Selling Products + Low-Stock Alerts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top-Selling Products</CardTitle>
              <CardDescription>
                Ranked by confirmed sales revenue ({data?.range.label ?? "..."})
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!data || data.topProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-6 text-center text-sm text-[#756F69]">
                No product sales recorded in this period.
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.topProducts.map((p, idx) => (
                  <div
                    key={`${p.name}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/20 px-3.5 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#353535]">{p.name}</p>
                      <p className="text-xs text-[#756F69]">
                        {p.unitsSold} units sold
                      </p>
                    </div>
                    <span className="font-bold text-[#353535] tabular-nums">
                      {formatInr(p.salesValue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Low-Stock Alerts</CardTitle>
              <CardDescription>
                Products at or below minimum stock threshold
              </CardDescription>
            </div>
            <Link
              href="/inventory"
              className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
            >
              Restock →
            </Link>
          </CardHeader>
          <CardContent>
            {!data || data.lowStockProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-6 text-center text-sm text-[#756F69]">
                All active products are above minimum stock levels.
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/20 px-3.5 py-2.5 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-[#353535]">{p.name}</p>
                      <p className="text-xs text-[#756F69]">
                        Min: {p.minimumStock} {p.unit} · Cost:{" "}
                        {formatInr(p.purchasePrice)}
                      </p>
                    </div>
                    <Badge variant={p.currentStock <= 0 ? "alert" : "amber"}>
                      {p.currentStock} {p.unit}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 4: Customer Dues, Supplier Payables & Net Recorded Cash Movement */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top Customer Dues</CardTitle>
              <CardDescription>From customer Khata ledger</CardDescription>
            </div>
            <Link
              href="/customers"
              className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
            >
              Khata →
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data || data.customerSummary.topPendingCustomers.length === 0 ? (
              <p className="text-sm text-[#756F69]">
                No pending customer dues.
              </p>
            ) : (
              data.customerSummary.topPendingCustomers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-[#E3DFD6] px-3 py-2 text-xs"
                >
                  <span className="font-medium text-[#353535]">{c.name}</span>
                  <Badge variant="alert">{formatInr(c.outstandingDue)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Supplier Payables</CardTitle>
              <CardDescription>From supplier ledger</CardDescription>
            </div>
            <Link
              href="/suppliers"
              className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
            >
              Suppliers →
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {!data || data.supplierSummary.topPayableSuppliers.length === 0 ? (
              <p className="text-sm text-[#756F69]">
                No pending supplier payables.
              </p>
            ) : (
              data.supplierSummary.topPayableSuppliers.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-[#E3DFD6] px-3 py-2 text-xs"
                >
                  <span className="font-medium text-[#353535]">{s.name}</span>
                  <Badge variant="amber">
                    {formatInr(s.outstandingPayable)}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Net Recorded Cash Movement</CardTitle>
              <CardDescription>
                Actual recorded inflows minus outflows
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#756F69]">Cash/UPI/Bank Received</span>
              <span className="font-semibold text-[#22B55B] tabular-nums">
                +{data ? formatInr(data.cashMovement.cashReceived) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756F69]">Paid to Suppliers</span>
              <span className="font-semibold text-[#353535] tabular-nums">
                -{data ? formatInr(data.cashMovement.cashPaidSuppliers) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756F69]">Expenses Paid</span>
              <span className="font-semibold text-[#353535] tabular-nums">
                -{data ? formatInr(data.cashMovement.cashPaidExpenses) : "—"}
              </span>
            </div>
            <div className="flex justify-between border-t border-[#E3DFD6] pt-2 text-sm font-bold text-[#353535]">
              <span>Net Recorded Movement</span>
              <span className="tabular-nums">
                {data
                  ? formatInr(data.cashMovement.netRecordedCashMovement)
                  : "—"}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#756F69]">
              {data?.cashMovement.disclaimer}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section 5: Smart Business Insights */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-[#F0B03B]" />
            <div>
              <CardTitle>Smart Business Insights</CardTitle>
              <CardDescription>
                Deterministic observations calculated from your actual records
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIncludeAi((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                includeAi
                  ? "border-[#F0B03B] bg-[#F0B03B]/20 text-[#353535]"
                  : "border-[#D5CFC4] bg-white text-[#756F69]"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{includeAi ? "AI Summary On" : "Explain with AI"}</span>
            </button>
            <Link
              href="/voice"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#353535] px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Mic className="h-3.5 w-3.5 text-[#F0B03B]" /> Ask Voice Saathi
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {insightsData?.aiNarrative && (
            <div className="rounded-xl border border-[#F0B03B]/50 bg-[#F0B03B]/15 p-4 text-sm text-[#353535]">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#8A5A00]">
                AI Summary of Precomputed Metrics
              </p>
              <p>{insightsData.aiNarrative}</p>
            </div>
          )}

          {!insightsData || insightsData.insights.length === 0 ? (
            <p className="text-sm text-[#756F69]">
              {loading
                ? "Analyzing business records..."
                : "Record sales, purchases, or inventory to generate data-backed insights."}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {insightsData.insights.map((ins) => (
                <div
                  key={ins.id}
                  className="rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/20 p-4 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#353535]">
                      {ins.title}
                    </span>
                    <Badge
                      variant={
                        ins.severity === "ALERT"
                          ? "alert"
                          : ins.severity === "WARNING"
                          ? "amber"
                          : ins.severity === "POSITIVE"
                          ? "success"
                          : "info"
                      }
                    >
                      {ins.metric}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-[#353535]">
                    {ins.description}
                  </p>
                  <p className="text-[11px] text-[#756F69]">
                    Suggested action: {ins.suggestedAction}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 6: Recent Transactions */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent Business Activity</CardTitle>
            <CardDescription>
              Latest confirmed transactions across sales, purchases, and expenses
            </CardDescription>
          </div>
          <Link
            href="/transactions"
            className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
          >
            All transactions →
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!data || data.recentTransactions.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#756F69]">
              No transactions recorded yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  <th className="pb-3 pr-4">Ref</th>
                  <th className="pb-3 pr-4">Party</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {data.recentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#E3DFD6]/20">
                    <td className="py-2.5 pr-4 font-mono text-xs text-[#756F69]">
                      {tx.referenceNumber ?? tx.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-[#353535]">
                      {tx.customerName ?? tx.supplierName ?? "Walk-in / Shop"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant={
                          tx.transactionType === "SALE"
                            ? "success"
                            : tx.transactionType === "PURCHASE"
                            ? "info"
                            : "neutral"
                        }
                      >
                        {tx.transactionType}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant={
                          tx.paymentStatus === "PAID"
                            ? "success"
                            : tx.paymentStatus === "PARTIAL"
                            ? "amber"
                            : "alert"
                        }
                      >
                        {tx.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {formatInr(tx.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
