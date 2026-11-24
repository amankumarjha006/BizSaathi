"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  IndianRupee,
  Package,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, formatInr } from "@/lib/api-client";

interface DashboardSummary {
  todaySales: number;
  todaySalesCount: number;
  todayPurchases: number;
  todayPurchasesCount: number;
  outstandingCustomerDues: number;
  totalSupplierPayables: number;
  totalProducts: number;
  lowStockCount: number;
  totalSalesCollected: number;
  totalPurchasesPaid: number;
}

interface RecentTransaction {
  id: string;
  transactionType: string;
  referenceNumber: string | null;
  transactionDate: string;
  customerName: string | null;
  supplierName: string | null;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
}

interface LowStockItem {
  id: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
}

interface DailyOverviewPoint {
  date: string;
  sales: number;
  purchases: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentTxns, setRecentTxns] = useState<RecentTransaction[]>([]);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [overview, setOverview] = useState<DailyOverviewPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const [sumData, txData, lowData, ovData] = await Promise.all([
        apiFetch<DashboardSummary>("/api/dashboard/summary"),
        apiFetch<RecentTransaction[]>("/api/dashboard/recent-transactions"),
        apiFetch<LowStockItem[]>("/api/inventory/low-stock"),
        apiFetch<DailyOverviewPoint[]>("/api/dashboard/sales-overview"),
      ]);
      setSummary(sumData);
      setRecentTxns(txData);
      setLowStock(lowData);
      setOverview(ovData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard data"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      void loadDashboard();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const kpiCards = [
    {
      label: "Today's Sales",
      value: summary ? formatInr(summary.todaySales) : "—",
      sub: summary ? `${summary.todaySalesCount} bills today` : "Loading...",
      icon: TrendingUp,
      iconBg: "bg-[#22B55B]/12 text-[#22B55B]",
    },
    {
      label: "Today's Purchases",
      value: summary ? formatInr(summary.todayPurchases) : "—",
      sub: summary
        ? `${summary.todayPurchasesCount} supplier bills`
        : "Loading...",
      icon: ShoppingBag,
      iconBg: "bg-[#4285F4]/12 text-[#4285F4]",
    },
    {
      label: "Customer Udhaar Due",
      value: summary ? formatInr(summary.outstandingCustomerDues) : "—",
      sub: "Total receivable from Khata",
      icon: IndianRupee,
      iconBg: "bg-[#F0B03B]/20 text-[#8A5A00]",
    },
    {
      label: "Supplier Payables",
      value: summary ? formatInr(summary.totalSupplierPayables) : "—",
      sub: "Total payable to suppliers",
      icon: Building2,
      iconBg: "bg-[#353535]/10 text-[#353535]",
    },
    {
      label: "Active Products",
      value: summary ? String(summary.totalProducts) : "—",
      sub: "Catalog items in stock",
      icon: Package,
      iconBg: "bg-[#4285F4]/12 text-[#4285F4]",
    },
    {
      label: "Low-Stock Alerts",
      value: summary ? String(summary.lowStockCount) : "—",
      sub: "At or below min threshold",
      icon: AlertTriangle,
      iconBg: "bg-[#FF4F78]/12 text-[#FF4F78]",
    },
  ];

  const maxOverviewValue = Math.max(
    1,
    ...overview.flatMap((d) => [d.sales, d.purchases])
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[#353535] sm:text-3xl">
            Business Overview
          </h1>
          <p className="mt-1 text-sm text-[#756F69]">
            Live metrics calculated directly from your PostgreSQL ledger and
            inventory records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#D5CFC4] bg-white px-3.5 py-2.5 text-sm font-medium text-[#353535] hover:bg-[#E3DFD6]/40 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
          <Link
            href="/billing"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-4 py-2.5 text-sm font-semibold text-[#353535] shadow-sm transition-colors hover:bg-[#DDA02D]"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            <span>New Sale / Bill</span>
          </Link>
          <Link
            href="/purchases"
            className="inline-flex items-center gap-2 rounded-xl bg-[#353535] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#353535]/90"
          >
            <Truck className="h-4 w-4 text-[#F0B03B]" aria-hidden="true" />
            <span>Record Purchase</span>
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-4 text-sm text-[#353535]"
        >
          <p className="font-semibold text-[#B81D43]">
            Unable to load live database metrics
          </p>
          <p className="mt-1 text-xs text-[#756F69]">{error}</p>
        </div>
      )}

      {/* KPI Grid */}
      <section
        aria-label="Key business metrics"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {kpiCards.map((kpi) => {
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
                    <p className="mt-1 text-xs text-[#756F69]">{kpi.sub}</p>
                  </div>
                  <div className={`rounded-xl p-2.5 ${kpi.iconBg}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Recent Transactions & Low Stock */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>
                Latest confirmed sales and supplier purchases
              </CardDescription>
            </div>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
            >
              <span>All transactions</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {recentTxns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-8 text-center text-sm text-[#756F69]">
                {loading
                  ? "Loading transactions..."
                  : "No transactions recorded yet. Create a sale or purchase to see activity here."}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E3DFD6] text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                    <th className="pb-3 pr-4">Ref</th>
                    <th className="pb-3 pr-4">Party</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Payment</th>
                    <th className="pb-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3DFD6]/70">
                  {recentTxns.map((tx) => (
                    <tr key={tx.id} className="hover:bg-[#E3DFD6]/20">
                      <td className="py-3 pr-4 font-mono text-xs text-[#756F69]">
                        {tx.referenceNumber ?? tx.id.slice(0, 8)}
                      </td>
                      <td className="py-3 pr-4 font-medium text-[#353535]">
                        {tx.customerName ?? tx.supplierName ?? "Walk-in Customer"}
                      </td>
                      <td className="py-3 pr-4">
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
                      <td className="py-3 pr-4">
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
                      <td className="py-3 text-right font-semibold text-[#353535] tabular-nums">
                        {formatInr(tx.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Low-Stock Watchlist</CardTitle>
              <CardDescription>
                Products at or below minimum threshold
              </CardDescription>
            </div>
            <Link
              href="/inventory"
              className="text-xs font-semibold text-[#353535] underline decoration-[#F0B03B] decoration-2 underline-offset-4"
            >
              Inventory →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-6 text-center text-sm text-[#756F69]">
                {loading
                  ? "Checking stock levels..."
                  : "All active products are above minimum stock levels."}
              </div>
            ) : (
              lowStock.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/25 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#353535]">
                      {item.name}
                    </p>
                    <p className="text-xs text-[#756F69]">
                      Min: {item.minimumStock} {item.unit}
                    </p>
                  </div>
                  <Badge variant="alert">
                    {item.currentStock} {item.unit}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 7-Day Sales vs Purchase Overview + Payment Summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>7-Day Sales &amp; Purchase Overview</CardTitle>
              <CardDescription>
                Daily confirmed totals across the past 7 days
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {overview.length === 0 ? (
              <p className="text-sm text-[#756F69]">No activity data yet.</p>
            ) : (
              <div className="space-y-3">
                {overview.map((day) => (
                  <div key={day.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[#756F69]">
                        {day.date}
                      </span>
                      <span className="text-[#353535] tabular-nums">
                        Sales: <strong>{formatInr(day.sales)}</strong> ·
                        Purchases: <strong>{formatInr(day.purchases)}</strong>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-2 overflow-hidden rounded-full bg-[#E3DFD6]">
                        <div
                          className="h-full rounded-full bg-[#22B55B]"
                          style={{
                            width: `${Math.min(
                              100,
                              (day.sales / maxOverviewValue) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#E3DFD6]">
                        <div
                          className="h-full rounded-full bg-[#4285F4]"
                          style={{
                            width: `${Math.min(
                              100,
                              (day.purchases / maxOverviewValue) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payment Overview</CardTitle>
              <CardDescription>Collected vs. pending balances</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/25 p-3.5">
              <p className="text-xs text-[#756F69]">Total Sales Collected</p>
              <p className="mt-1 text-lg font-bold text-[#22B55B] tabular-nums">
                {summary ? formatInr(summary.totalSalesCollected) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/25 p-3.5">
              <p className="text-xs text-[#756F69]">Customer Udhaar Pending</p>
              <p className="mt-1 text-lg font-bold text-[#8A5A00] tabular-nums">
                {summary ? formatInr(summary.outstandingCustomerDues) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/25 p-3.5">
              <p className="text-xs text-[#756F69]">Total Purchases Paid</p>
              <p className="mt-1 text-lg font-bold text-[#4285F4] tabular-nums">
                {summary ? formatInr(summary.totalPurchasesPaid) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
