"use client";

import { useCallback, useEffect, useState } from "react";
import { IndianRupee, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, formatInr } from "@/lib/api-client";

interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  totalPurchased: number;
  totalPaid: number;
  outstandingDue: number;
  transactionCount: number;
}

interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  totalPurchased: number;
  totalPaid: number;
  outstandingDue: number;
  transactions: Array<{
    id: string;
    referenceNumber: string | null;
    transactionDate: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    paymentStatus: string;
  }>;
  ledgerEntries: Array<{
    id: string;
    referenceNumber: string | null;
    entryType: "DEBIT" | "CREDIT";
    amount: number;
    notes: string | null;
    createdAt: string;
  }>;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selected, setSelected] = useState<CustomerProfile | null>(null);
  const [search, setSearch] = useState("");
  const [onlyWithDue, setOnlyWithDue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add customer modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Payment modal
  const [payTargetTxnId, setPayTargetTxnId] = useState<string | null>(null);
  const [payMax, setPayMax] = useState(0);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<
    "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER"
  >("CASH");
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (onlyWithDue) params.set("onlyWithDue", "true");
      const data = await apiFetch<CustomerSummary[]>(
        `/api/customers?${params.toString()}`
      );
      setCustomers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load customers"
      );
    } finally {
      setLoading(false);
    }
  }, [search, onlyWithDue]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadCustomers();
    }, 0);
    return () => clearTimeout(id);
  }, [loadCustomers]);

  async function openProfile(id: string) {
    setError(null);
    try {
      const profile = await apiFetch<CustomerProfile>(`/api/customers/${id}`);
      setSelected(profile);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load customer profile"
      );
    }
  }

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/customers", {
        method: "POST",
        body: JSON.stringify({ name: newName, phone: newPhone || undefined }),
      });
      setShowAddModal(false);
      setNewName("");
      setNewPhone("");
      await loadCustomers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create customer"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payTargetTxnId || !selected) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          transactionId: payTargetTxnId,
          amount: Number(payAmount),
          paymentMethod: payMethod,
        }),
      });
      setPayTargetTxnId(null);
      await Promise.all([loadCustomers(), openProfile(selected.id)]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to record payment"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
              Customers &amp; Digital Khata
            </h1>
            <p className="text-sm text-[#756F69]">
              Track customer credit (Udhaar), record repayments, and inspect
              ledger balances.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-4 py-2.5 text-sm font-semibold text-[#353535] shadow-sm hover:bg-[#DDA02D]"
        >
          <Plus className="h-4 w-4" /> Add Customer
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-4 text-sm text-[#B81D43]"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Customer Directory */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Customers ({customers.length})</CardTitle>
              <CardDescription>Select a customer to open Khata</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#756F69]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone..."
                className="w-full rounded-xl border border-[#D5CFC4] py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#353535]">
              <input
                type="checkbox"
                checked={onlyWithDue}
                onChange={(e) => setOnlyWithDue(e.target.checked)}
              />
              Show only customers with pending Udhaar
            </label>

            <div className="max-h-[460px] space-y-2 overflow-y-auto">
              {customers.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#756F69]">
                  {loading ? "Loading customers..." : "No customers found."}
                </p>
              ) : (
                customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void openProfile(c.id)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                      selected?.id === c.id
                        ? "border-[#F0B03B] bg-[#F0B03B]/15"
                        : "border-[#E3DFD6] hover:bg-[#E3DFD6]/25"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#353535]">
                        {c.name}
                      </p>
                      <p className="text-xs text-[#756F69]">
                        {c.phone ?? "No phone"} · {c.transactionCount} bills
                      </p>
                    </div>
                    <Badge variant={c.outstandingDue > 0 ? "alert" : "success"}>
                      {formatInr(c.outstandingDue)}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customer Khata Detail */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>
                {selected ? selected.name : "Customer Khata Profile"}
              </CardTitle>
              <CardDescription>
                {selected
                  ? selected.phone ?? "No phone recorded"
                  : "Select a customer on the left to view credit & payment history"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-10 text-center text-sm text-[#756F69]">
                Select any customer to view their outstanding Udhaar, unpaid
                bills, and ledger history.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#E3DFD6]/35 p-3">
                    <p className="text-xs text-[#756F69]">Total Billed</p>
                    <p className="mt-1 text-base font-bold text-[#353535] tabular-nums">
                      {formatInr(selected.totalPurchased)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#22B55B]/10 p-3">
                    <p className="text-xs text-[#756F69]">Total Paid</p>
                    <p className="mt-1 text-base font-bold text-[#16793D] tabular-nums">
                      {formatInr(selected.totalPaid)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#FF4F78]/10 p-3">
                    <p className="text-xs text-[#756F69]">Outstanding Due</p>
                    <p className="mt-1 text-base font-bold text-[#B81D43] tabular-nums">
                      {formatInr(selected.outstandingDue)}
                    </p>
                  </div>
                </div>

                {/* Bills with Receive Payment button */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                    Sales &amp; Credit Bills
                  </h3>
                  {selected.transactions.length === 0 ? (
                    <p className="text-sm text-[#756F69]">No bills yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selected.transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E3DFD6] p-3 text-xs"
                        >
                          <div>
                            <p className="font-mono font-semibold text-[#353535]">
                              {tx.referenceNumber ?? tx.id.slice(0, 8)}
                            </p>
                            <p className="text-[#756F69]">
                              {new Date(tx.transactionDate).toLocaleDateString(
                                "en-IN"
                              )}{" "}
                              · Total {formatInr(tx.totalAmount)} · Paid{" "}
                              {formatInr(tx.paidAmount)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {tx.outstandingAmount > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayTargetTxnId(tx.id);
                                  setPayMax(tx.outstandingAmount);
                                  setPayAmount(String(tx.outstandingAmount));
                                }}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#F0B03B] px-3 py-1.5 font-semibold text-[#353535] hover:bg-[#DDA02D]"
                              >
                                <IndianRupee className="h-3 w-3" /> Receive{" "}
                                {formatInr(tx.outstandingAmount)}
                              </button>
                            ) : (
                              <Badge variant="success">PAID</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ledger Entries */}
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                    Khata Ledger Entries
                  </h3>
                  {selected.ledgerEntries.length === 0 ? (
                    <p className="text-sm text-[#756F69]">
                      No ledger entries yet.
                    </p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-[#E3DFD6]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#E3DFD6]/35 text-[#756F69]">
                          <tr>
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Entry</th>
                            <th className="p-2.5">Notes</th>
                            <th className="p-2.5 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3DFD6]/70">
                          {selected.ledgerEntries.map((le) => (
                            <tr key={le.id}>
                              <td className="p-2.5 font-mono text-[#756F69]">
                                {new Date(le.createdAt).toLocaleDateString(
                                  "en-IN"
                                )}
                              </td>
                              <td className="p-2.5">
                                <Badge
                                  variant={
                                    le.entryType === "CREDIT"
                                      ? "success"
                                      : "alert"
                                  }
                                >
                                  {le.entryType === "DEBIT"
                                    ? "UDHAAR (+)"
                                    : "PAYMENT (-)"}
                                </Badge>
                              </td>
                              <td className="p-2.5 text-[#756F69]">
                                {le.notes ?? le.referenceNumber ?? "—"}
                              </td>
                              <td className="p-2.5 text-right font-semibold tabular-nums">
                                {formatInr(le.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Add Customer
            </h2>
            <form onSubmit={handleAddCustomer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Customer Name *
                </label>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                  placeholder="e.g. Sunita Devi"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Phone Number (Optional)
                </label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                  placeholder="e.g. +91-9811122233"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-[#D5CFC4] px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-semibold text-[#353535]"
                >
                  {saving ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Payment Modal */}
      {payTargetTxnId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Record Customer Payment
            </h2>
            <p className="mt-1 text-xs text-[#756F69]">
              Maximum remaining due on this bill: {formatInr(payMax)}
            </p>
            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Amount Received (₹) *
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payMax}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Payment Method
                </label>
                <select
                  value={payMethod}
                  onChange={(e) =>
                    setPayMethod(
                      e.target.value as
                        | "CASH"
                        | "UPI"
                        | "BANK_TRANSFER"
                        | "OTHER"
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayTargetTxnId(null)}
                  className="rounded-xl border border-[#D5CFC4] px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-semibold text-[#353535]"
                >
                  {saving ? "Recording..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
