"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Eye, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, formatInr } from "@/lib/api-client";

interface TransactionRow {
  id: string;
  transactionType: string;
  referenceNumber: string | null;
  transactionDate: string;
  customerName: string | null;
  supplierName: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: string;
  status: string;
}

interface TransactionDetail extends TransactionRow {
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentMethod: string;
    notes: string | null;
    createdAt: string;
  }>;
  stockMovements: Array<{
    id: string;
    productName: string;
    productUnit: string;
    movementType: string;
    quantity: number;
    createdAt: string;
  }>;
}

export default function TransactionsPage() {
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [detail, setDetail] = useState<TransactionDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (search.trim()) params.set("search", search.trim());
      const data = await apiFetch<TransactionRow[]>(
        `/api/transactions?${params.toString()}`
      );
      setTxns(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load transactions"
      );
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadTransactions();
    }, 0);
    return () => clearTimeout(id);
  }, [loadTransactions]);

  async function openDetail(id: string) {
    setError(null);
    try {
      const data = await apiFetch<TransactionDetail>(`/api/transactions/${id}`);
      setDetail(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load transaction detail"
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
          <ArrowLeftRight className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
            Transaction History
          </h1>
          <p className="text-sm text-[#756F69]">
            Immutable audit log of all confirmed sales, purchases, payments, and
            stock movements.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-4 text-sm text-[#B81D43]"
        >
          {error}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#756F69]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by reference, customer, or supplier..."
              className="w-full rounded-xl border border-[#D5CFC4] py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by transaction type"
            className="rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
          >
            <option value="ALL">All Types</option>
            <option value="SALE">Sales</option>
            <option value="PURCHASE">Purchases</option>
            <option value="CUSTOMER_ORDER">Customer Orders</option>
            <option value="EXPENSE">Expenses</option>
            <option value="RETURN">Returns</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>All Transactions ({txns.length})</CardTitle>
            <CardDescription>
              Completed financial transactions cannot be silently deleted
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {txns.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#756F69]">
              {loading
                ? "Loading transactions..."
                : "No transactions match your filters."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  <th className="pb-3 pr-4">Ref</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Party</th>
                  <th className="pb-3 pr-4">Payment</th>
                  <th className="pb-3 pr-4 text-right">Total</th>
                  <th className="pb-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {txns.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#E3DFD6]/20">
                    <td className="py-3 pr-4 font-mono text-xs text-[#756F69]">
                      {tx.referenceNumber ?? tx.id.slice(0, 8)}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#756F69]">
                      {new Date(tx.transactionDate).toLocaleDateString("en-IN")}
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
                    <td className="py-3 pr-4 font-medium text-[#353535]">
                      {tx.customerName ?? tx.supplierName ?? "Walk-in"}
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
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                      {formatInr(tx.totalAmount)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void openDetail(tx.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D5CFC4] px-2.5 py-1 text-xs font-medium text-[#353535] hover:bg-[#E3DFD6]/40"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#353535]">
                  {detail.transactionType} · {detail.referenceNumber ?? detail.id}
                </h2>
                <p className="text-xs text-[#756F69]">
                  {new Date(detail.transactionDate).toLocaleString("en-IN")} ·{" "}
                  {detail.customerName ?? detail.supplierName ?? "Walk-in"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-xl border border-[#D5CFC4] px-3 py-1.5 text-xs font-medium"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[#E3DFD6]/35 p-3 text-xs">
                <p className="text-[#756F69]">Total Amount</p>
                <p className="mt-0.5 text-base font-bold tabular-nums">
                  {formatInr(detail.totalAmount)}
                </p>
              </div>
              <div className="rounded-xl bg-[#22B55B]/10 p-3 text-xs">
                <p className="text-[#756F69]">Paid Amount</p>
                <p className="mt-0.5 text-base font-bold text-[#16793D] tabular-nums">
                  {formatInr(detail.paidAmount)}
                </p>
              </div>
              <div className="rounded-xl bg-[#FF4F78]/10 p-3 text-xs">
                <p className="text-[#756F69]">Outstanding</p>
                <p className="mt-0.5 text-base font-bold text-[#B81D43] tabular-nums">
                  {formatInr(detail.outstandingAmount)}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                Items
              </h3>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E3DFD6] text-[#756F69]">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Rate</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3DFD6]/70">
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-2 font-medium text-[#353535]">
                        {item.productNameSnapshot}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatInr(item.unitPrice)}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {formatInr(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  Payments
                </h3>
                {detail.payments.length === 0 ? (
                  <p className="text-xs text-[#756F69]">No payments recorded.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {detail.payments.map((p) => (
                      <li
                        key={p.id}
                        className="flex justify-between rounded-lg border border-[#E3DFD6] p-2"
                      >
                        <span>{p.paymentMethod}</span>
                        <span className="font-semibold tabular-nums">
                          {formatInr(p.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  Stock Movements
                </h3>
                {detail.stockMovements.length === 0 ? (
                  <p className="text-xs text-[#756F69]">No stock movements.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {detail.stockMovements.map((m) => (
                      <li
                        key={m.id}
                        className="flex justify-between rounded-lg border border-[#E3DFD6] p-2"
                      >
                        <span className="truncate pr-2">{m.productName}</span>
                        <span className="font-semibold tabular-nums">
                          {m.movementType} ({m.quantity} {m.productUnit})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
