"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Download, Search } from "lucide-react";
import {
  DateRangeFilter,
  type DateRangeSelection,
} from "@/components/analytics/DateRangeFilter";
import { PaymentDonutChart } from "@/components/analytics/PaymentDonutChart";
import { SalesByDayChart } from "@/components/analytics/SalesByDayChart";
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
import type { CustomerAnalyticsResult } from "@/server/services/analytics/customer-analytics.service";
import type { ExpenseAnalyticsResult } from "@/server/services/analytics/expense-analytics.service";
import type { InventoryAnalyticsResult } from "@/server/services/analytics/inventory-analytics.service";
import type { PurchaseAnalyticsResult } from "@/server/services/analytics/purchase-analytics.service";
import type { SalesAnalyticsResult } from "@/server/services/analytics/sales-analytics.service";
import type { SupplierAnalyticsResult } from "@/server/services/analytics/supplier-analytics.service";

type ReportTab =
  | "sales"
  | "purchases"
  | "expenses"
  | "inventory"
  | "customers"
  | "suppliers";

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "sales", label: "Sales Report" },
  { id: "purchases", label: "Purchase Report" },
  { id: "expenses", label: "Expense Report" },
  { id: "inventory", label: "Inventory Report" },
  { id: "customers", label: "Customer Dues" },
  { id: "suppliers", label: "Supplier Payables" },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [dateRange, setDateRange] = useState<DateRangeSelection>({
    preset: "LAST_30_DAYS",
    from: "",
    to: "",
  });
  const [groupBy, setGroupBy] = useState<"daily" | "weekly" | "monthly">(
    "daily"
  );
  const [search, setSearch] = useState("");
  const [sortProductsBy, setSortProductsBy] = useState<"amount" | "units">(
    "amount"
  );
  const [expenseCategory, setExpenseCategory] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [salesData, setSalesData] = useState<SalesAnalyticsResult | null>(null);
  const [purchaseData, setPurchaseData] =
    useState<PurchaseAnalyticsResult | null>(null);
  const [expenseData, setExpenseData] = useState<ExpenseAnalyticsResult | null>(
    null
  );
  const [inventoryData, setInventoryData] =
    useState<InventoryAnalyticsResult | null>(null);
  const [customerData, setCustomerData] =
    useState<CustomerAnalyticsResult | null>(null);
  const [supplierData, setSupplierData] =
    useState<SupplierAnalyticsResult | null>(null);

  const buildQueryString = useCallback(
    (includeFormatCsv = false) => {
      const params = new URLSearchParams({
        preset: dateRange.preset,
        groupBy,
      });
      if (dateRange.preset === "CUSTOM" && dateRange.from) {
        params.set("from", dateRange.from);
        if (dateRange.to) params.set("to", dateRange.to);
      }
      if (search.trim()) params.set("search", search.trim());
      if (activeTab === "sales") params.set("sortBy", sortProductsBy);
      if (activeTab === "expenses") {
        if (expenseCategory) params.set("category", expenseCategory);
        if (paymentStatus) params.set("paymentStatus", paymentStatus);
      }
      if (includeFormatCsv) params.set("format", "csv");
      return params.toString();
    },
    [
      activeTab,
      dateRange,
      expenseCategory,
      groupBy,
      paymentStatus,
      search,
      sortProductsBy,
    ]
  );

  const loadReport = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const qs = buildQueryString(false);
      if (activeTab === "sales") {
        setSalesData(
          await apiFetch<SalesAnalyticsResult>(`/api/analytics/sales?${qs}`)
        );
      } else if (activeTab === "purchases") {
        setPurchaseData(
          await apiFetch<PurchaseAnalyticsResult>(
            `/api/analytics/purchases?${qs}`
          )
        );
      } else if (activeTab === "expenses") {
        setExpenseData(
          await apiFetch<ExpenseAnalyticsResult>(
            `/api/analytics/expenses?${qs}`
          )
        );
      } else if (activeTab === "inventory") {
        setInventoryData(
          await apiFetch<InventoryAnalyticsResult>(
            `/api/analytics/inventory?${qs}`
          )
        );
      } else if (activeTab === "customers") {
        setCustomerData(
          await apiFetch<CustomerAnalyticsResult>(
            `/api/analytics/customers?${qs}`
          )
        );
      } else if (activeTab === "suppliers") {
        setSupplierData(
          await apiFetch<SupplierAnalyticsResult>(
            `/api/analytics/suppliers?${qs}`
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, buildQueryString]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadReport();
    }, 0);
    return () => clearTimeout(id);
  }, [loadReport]);

  const csvUrl = `/api/analytics/${activeTab}?${buildQueryString(true)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
              Reports &amp; Analytics
            </h1>
            <p className="text-sm text-[#756F69]">
              Detailed sales, purchase, expense, inventory, and ledger reports
              with filtered CSV export.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <DateRangeFilter value={dateRange} onChange={setDateRange} />
          <a
            href={csvUrl}
            className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-4 py-2 text-xs font-bold text-[#353535] shadow-sm hover:bg-[#DDA02D]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap gap-2">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === tab.id
                ? "bg-[#353535] text-[#F0B03B] shadow-sm"
                : "border border-[#D5CFC4] bg-white text-[#353535] hover:bg-[#E3DFD6]/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#756F69]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search within current report..."
              className="w-full rounded-xl border border-[#D5CFC4] py-2 pl-9 pr-3 text-sm"
            />
          </div>

          {activeTab === "sales" && (
            <select
              value={sortProductsBy}
              onChange={(e) =>
                setSortProductsBy(e.target.value as "amount" | "units")
              }
              aria-label="Sort top products"
              className="rounded-xl border border-[#D5CFC4] px-3 py-2 text-xs font-medium"
            >
              <option value="amount">Top Products: By Revenue</option>
              <option value="units">Top Products: By Units Sold</option>
            </select>
          )}

          {activeTab === "expenses" && (
            <>
              <input
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                placeholder="Filter category (e.g. Utilities)"
                className="rounded-xl border border-[#D5CFC4] px-3 py-2 text-xs"
              />
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                aria-label="Filter expense payment status"
                className="rounded-xl border border-[#D5CFC4] px-3 py-2 text-xs"
              >
                <option value="">All Payment Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PARTIAL">Partial</option>
                <option value="UNPAID">Unpaid</option>
              </select>
            </>
          )}
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-4 text-sm text-[#B81D43]"
        >
          {error}
        </div>
      )}

      {/* TAB 1: SALES REPORT */}
      {activeTab === "sales" && salesData && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Net Sales</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatInr(salesData.summary.netSales)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Bills / Avg Value</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {salesData.summary.transactionCount} ·{" "}
                  {formatInr(salesData.summary.averageTransactionValue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Collections Received</p>
                <p className="mt-1 text-xl font-bold text-[#22B55B] tabular-nums">
                  {formatInr(salesData.summary.amountCollected)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Returns</p>
                <p className="mt-1 text-xl font-bold text-[#FF4F78] tabular-nums">
                  {formatInr(salesData.summary.returnsTotal)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Sales Trend</CardTitle>
                  <CardDescription>{salesData.range.label}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <SalesTrendChart
                  data={salesData.trend}
                  groupBy={groupBy}
                  onGroupByChange={setGroupBy}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Sales by Day of Week</CardTitle>
                  <CardDescription>Peak selling weekdays</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <SalesByDayChart data={salesData.salesByDay} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentDonutChart
                  distribution={salesData.paymentDistribution}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top-Selling Products</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {salesData.topProducts.length === 0 ? (
                  <p className="text-sm text-[#756F69]">No product sales.</p>
                ) : (
                  salesData.topProducts.slice(0, 6).map((p, i) => (
                    <div
                      key={`${p.name}-${i}`}
                      className="flex justify-between rounded-xl border border-[#E3DFD6] px-3 py-2 text-xs"
                    >
                      <span className="font-medium">
                        {p.name} ({p.unitsSold} units)
                      </span>
                      <span className="font-bold tabular-nums">
                        {formatInr(p.salesValue)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: PURCHASE REPORT */}
      {activeTab === "purchases" && purchaseData && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                Purchase Report ({purchaseData.records.length})
              </CardTitle>
              <CardDescription>
                Total: {formatInr(purchaseData.summary.totalPurchases)} · Paid:{" "}
                {formatInr(purchaseData.summary.amountPaidToSuppliers)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs uppercase text-[#756F69]">
                  <th className="pb-2 pr-4">Ref</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Supplier</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {purchaseData.records.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-[#756F69]">
                      {r.referenceNumber ?? r.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs">
                      {r.transactionDate.slice(0, 10)}
                    </td>
                    <td className="py-2.5 pr-4 font-medium">
                      {r.supplierName}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant={
                          r.paymentStatus === "PAID"
                            ? "success"
                            : r.paymentStatus === "PARTIAL"
                            ? "amber"
                            : "alert"
                        }
                      >
                        {r.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {formatInr(r.paidAmount)}
                    </td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">
                      {formatInr(r.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: EXPENSE REPORT */}
      {activeTab === "expenses" && expenseData && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Total Expenses</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatInr(expenseData.summary.totalExpenses)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Expenses Paid</p>
                <p className="mt-1 text-xl font-bold text-[#22B55B] tabular-nums">
                  {formatInr(expenseData.summary.expensesPaid)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Categories</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {expenseData.categories.length}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                Expense Entries ({expenseData.records.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E3DFD6] text-xs uppercase text-[#756F69]">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3DFD6]/70">
                  {expenseData.records.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs text-[#756F69]">
                        {r.transactionDate.slice(0, 10)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="neutral">{r.category}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">{r.description}</td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={
                            r.paymentStatus === "PAID" ? "success" : "amber"
                          }
                        >
                          {r.paymentStatus}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">
                        {formatInr(r.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: INVENTORY REPORT */}
      {activeTab === "inventory" && inventoryData && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Healthy Stock</p>
                <p className="mt-1 text-xl font-bold text-[#22B55B]">
                  {inventoryData.stockHealth.healthyCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Low Stock</p>
                <p className="mt-1 text-xl font-bold text-[#8A5A00]">
                  {inventoryData.stockHealth.lowStockCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">Out of Stock</p>
                <p className="mt-1 text-xl font-bold text-[#FF4F78]">
                  {inventoryData.stockHealth.outOfStockCount}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[#756F69]">
                  Est. Cost Valuation
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatInr(
                    inventoryData.valuation.estimatedPurchaseCostValue
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Inventory Valuation &amp; Health</CardTitle>
                <CardDescription>
                  {inventoryData.valuation.methodNote}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E3DFD6] text-xs uppercase text-[#756F69]">
                    <th className="pb-2 pr-4">Product</th>
                    <th className="pb-2 pr-4 text-right">Stock</th>
                    <th className="pb-2 pr-4 text-right">Min</th>
                    <th className="pb-2 pr-4 text-right">Cost</th>
                    <th className="pb-2 pr-4 text-right">Est. Value</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3DFD6]/70">
                  {inventoryData.allProducts.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-4 font-medium">{p.name}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {p.currentStock} {p.unit}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-[#756F69]">
                        {p.minimumStock} {p.unit}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {formatInr(p.purchasePrice)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold tabular-nums">
                        {formatInr(p.estimatedCostValue)}
                      </td>
                      <td className="py-2.5">
                        <Badge
                          variant={
                            p.status === "HEALTHY"
                              ? "success"
                              : p.status === "LOW_STOCK"
                              ? "amber"
                              : "alert"
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: CUSTOMER DUES REPORT */}
      {activeTab === "customers" && customerData && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                Customer Dues Report (Total:{" "}
                {formatInr(customerData.totalOutstanding)})
              </CardTitle>
              <CardDescription>
                {customerData.pendingCustomersCount} customer(s) with pending
                balances
              </CardDescription>
            </div>
            <Link
              href="/customers"
              className="text-xs font-semibold underline decoration-[#F0B03B] decoration-2"
            >
              Open Khata →
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs uppercase text-[#756F69]">
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Phone</th>
                  <th className="pb-2 pr-4 text-right">Billed</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {customerData.customers.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 font-medium">{c.name}</td>
                    <td className="py-2.5 pr-4 text-xs text-[#756F69]">
                      {c.phone ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {formatInr(c.totalPurchased)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-[#22B55B]">
                      {formatInr(c.totalPaid)}
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums text-[#B81D43]">
                      {formatInr(c.outstandingDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* TAB 6: SUPPLIER PAYABLES REPORT */}
      {activeTab === "suppliers" && supplierData && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>
                Supplier Payables Report (Total:{" "}
                {formatInr(supplierData.totalPayables)})
              </CardTitle>
              <CardDescription>
                {supplierData.pendingSuppliersCount} supplier(s) with
                outstanding payables
              </CardDescription>
            </div>
            <Link
              href="/suppliers"
              className="text-xs font-semibold underline decoration-[#F0B03B] decoration-2"
            >
              Open Suppliers →
            </Link>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs uppercase text-[#756F69]">
                  <th className="pb-2 pr-4">Supplier</th>
                  <th className="pb-2 pr-4">Phone</th>
                  <th className="pb-2 pr-4 text-right">Purchased</th>
                  <th className="pb-2 pr-4 text-right">Paid</th>
                  <th className="pb-2 text-right">Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {supplierData.suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                    <td className="py-2.5 pr-4 text-xs text-[#756F69]">
                      {s.phone ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {formatInr(s.totalPurchased)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-[#22B55B]">
                      {formatInr(s.totalPaid)}
                    </td>
                    <td className="py-2.5 text-right font-bold tabular-nums text-[#8A5A00]">
                      {formatInr(s.outstandingPayable)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {loading && (
        <p className="text-center text-xs text-[#756F69]">
          Refreshing report data...
        </p>
      )}
    </div>
  );
}
