"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, IndianRupee, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, formatInr } from "@/lib/api-client";

interface SupplierSummary {
  id: string;
  name: string;
  phone: string | null;
  totalPurchased: number;
  totalPaid: number;
  outstandingPayable: number;
  transactionCount: number;
}

interface SupplierProfile {
  id: string;
  name: string;
  phone: string | null;
  totalPurchased: number;
  totalPaid: number;
  outstandingPayable: number;
  transactions: Array<{
    id: string;
    referenceNumber: string | null;
    transactionDate: string;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
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

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [selected, setSelected] = useState<SupplierProfile | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [payTargetTxnId, setPayTargetTxnId] = useState<string | null>(null);
  const [payMax, setPayMax] = useState(0);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<
    "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER"
  >("BANK_TRANSFER");
  const [saving, setSaving] = useState(false);

  const loadSuppliers = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const data = await apiFetch<SupplierSummary[]>(
        `/api/suppliers?${params.toString()}`
      );
      setSuppliers(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load suppliers"
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadSuppliers();
    }, 0);
    return () => clearTimeout(id);
  }, [loadSuppliers]);

  async function openProfile(id: string) {
    setError(null);
    try {
      const profile = await apiFetch<SupplierProfile>(`/api/suppliers/${id}`);
      setSelected(profile);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load supplier profile"
      );
    }
  }

  async function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({ name: newName, phone: newPhone || undefined }),
      });
      setShowAddModal(false);
      setNewName("");
      setNewPhone("");
      await loadSuppliers();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create supplier"
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
      await Promise.all([loadSuppliers(), openProfile(selected.id)]);
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
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
              Suppliers &amp; Payables
            </h1>
            <p className="text-sm text-[#756F69]">
              Manage wholesale distributors, purchase history, and outstanding
              payables.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-4 py-2.5 text-sm font-semibold text-[#353535] shadow-sm hover:bg-[#DDA02D]"
        >
          <Plus className="h-4 w-4" /> Add Supplier
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
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Suppliers ({suppliers.length})</CardTitle>
              <CardDescription>Select a supplier to view payables</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#756F69]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search supplier..."
                className="w-full rounded-xl border border-[#D5CFC4] py-2 pl-9 pr-3 text-sm"
              />
            </div>

            <div className="max-h-[460px] space-y-2 overflow-y-auto">
              {suppliers.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#756F69]">
                  {loading ? "Loading suppliers..." : "No suppliers found."}
                </p>
              ) : (
                suppliers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void openProfile(s.id)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                      selected?.id === s.id
                        ? "border-[#F0B03B] bg-[#F0B03B]/15"
                        : "border-[#E3DFD6] hover:bg-[#E3DFD6]/25"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#353535]">
                        {s.name}
                      </p>
                      <p className="text-xs text-[#756F69]">
                        {s.phone ?? "No phone"} · {s.transactionCount} bills
                      </p>
                    </div>
                    <Badge
                      variant={s.outstandingPayable > 0 ? "amber" : "success"}
                    >
                      {formatInr(s.outstandingPayable)}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>
                {selected ? selected.name : "Supplier Profile"}
              </CardTitle>
              <CardDescription>
                {selected
                  ? selected.phone ?? "No phone recorded"
                  : "Select a supplier to inspect purchases and payables"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-10 text-center text-sm text-[#756F69]">
                Select any supplier on the left to view purchase bills and
                record payments.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#E3DFD6]/35 p-3">
                    <p className="text-xs text-[#756F69]">Total Purchased</p>
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
                  <div className="rounded-xl bg-[#F0B03B]/15 p-3">
                    <p className="text-xs text-[#756F69]">Outstanding Payable</p>
                    <p className="mt-1 text-base font-bold text-[#8A5A00] tabular-nums">
                      {formatInr(selected.outstandingPayable)}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                    Purchase Bills
                  </h3>
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
                            <IndianRupee className="h-3 w-3" /> Pay{" "}
                            {formatInr(tx.outstandingAmount)}
                          </button>
                        ) : (
                          <Badge variant="success">PAID</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Add Supplier
            </h2>
            <form onSubmit={handleAddSupplier} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Supplier Name *
                </label>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Phone / Contact
                </label>
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
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
                  {saving ? "Saving..." : "Save Supplier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payTargetTxnId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Record Supplier Payment
            </h2>
            <p className="mt-1 text-xs text-[#756F69]">
              Maximum remaining payable: {formatInr(payMax)}
            </p>
            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Amount Paid (₹) *
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
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
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
