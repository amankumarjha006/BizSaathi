"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, formatInr } from "@/lib/api-client";

interface SupplierOption {
  id: string;
  name: string;
  phone: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  purchasePrice: number;
  unit: string;
}

interface PurchaseLine {
  productId: string;
  quantity: string;
  unitPrice: string;
}

interface PurchaseRecord {
  id: string;
  referenceNumber: string | null;
  transactionDate: string;
  supplierName: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: string;
}

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [lines, setLines] = useState<PurchaseLine[]>([
    { productId: "", quantity: "1", unitPrice: "0" },
  ]);
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER"
  >("BANK_TRANSFER");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function loadAll() {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const [supData, prodData, purData] = await Promise.all([
        apiFetch<SupplierOption[]>("/api/suppliers"),
        apiFetch<ProductOption[]>("/api/products"),
        apiFetch<PurchaseRecord[]>("/api/purchases"),
      ]);
      setSuppliers(supData);
      setProducts(prodData);
      setPurchases(purData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load purchase data"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      setTransactionDate((prev) => prev || new Date().toISOString().slice(0, 10));
      void loadAll();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function updateLine(index: number, patch: Partial<PurchaseLine>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.productId) {
          const prod = products.find((p) => p.id === patch.productId);
          if (prod) {
            next.unitPrice = String(prod.purchasePrice);
          }
        }
        return next;
      })
    );
  }

  const totalAmount = useMemo(
    () =>
      Number(
        lines
          .reduce(
            (sum, l) =>
              sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
            0
          )
          .toFixed(2)
      ),
    [lines]
  );

  const numericPaid = Math.max(0, Number(paidAmount) || 0);
  const remainingPayable = Math.max(
    0,
    Number((totalAmount - numericPaid).toFixed(2))
  );

  async function handleConfirmPurchase() {
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const validItems = lines
        .filter((l) => l.productId && Number(l.quantity) > 0)
        .map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        }));

      const created = await apiFetch<PurchaseRecord>("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId,
          referenceNumber: referenceNumber || undefined,
          transactionDate,
          items: validItems,
          paidAmount: numericPaid,
          paymentMethod,
        }),
      });

      setSuccessMsg(
        `Purchase ${created.referenceNumber} recorded (${formatInr(
          created.totalAmount
        )}). Inventory and supplier ledger updated.`
      );
      setReferenceNumber("");
      setLines([{ productId: "", quantity: "1", unitPrice: "0" }]);
      setPaidAmount("0");
      setShowConfirm(false);
      await loadAll();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to record purchase"
      );
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
            Purchase Management
          </h1>
          <p className="text-sm text-[#756F69]">
            Record supplier purchases, increase inventory atomically, and track
            supplier payables.
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

      {successMsg && (
        <div className="rounded-2xl border border-[#22B55B]/40 bg-[#22B55B]/10 p-4 text-sm text-[#16793D]">
          {successMsg}
        </div>
      )}

      {/* New Purchase Form */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Record Supplier Purchase</CardTitle>
            <CardDescription>
              Stock increases only after you review and confirm the purchase
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#353535]">
                Supplier *
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#353535]">
                Purchase Date
              </label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#353535]">
                Supplier Invoice / Ref No.
              </label>
              <input
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Optional (auto-generated if blank)"
                className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                Purchased Items
              </span>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { productId: "", quantity: "1", unitPrice: "0" },
                  ])
                }
                className="inline-flex items-center gap-1 rounded-lg border border-[#D5CFC4] px-2.5 py-1 text-xs font-semibold text-[#353535] hover:bg-[#E3DFD6]/40"
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </button>
            </div>

            {lines.map((line, idx) => {
              const subtotal =
                (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
              return (
                <div
                  key={idx}
                  className="grid items-center gap-2 rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/20 p-2.5 sm:grid-cols-12"
                >
                  <select
                    value={line.productId}
                    onChange={(e) =>
                      updateLine(idx, { productId: e.target.value })
                    }
                    className="rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-2 text-sm sm:col-span-5"
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(idx, { quantity: e.target.value })
                    }
                    placeholder="Qty"
                    className="rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-2 text-sm tabular-nums sm:col-span-2"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.unitPrice}
                    onChange={(e) =>
                      updateLine(idx, { unitPrice: e.target.value })
                    }
                    placeholder="Rate ₹"
                    className="rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-2 text-sm tabular-nums sm:col-span-2"
                  />
                  <div className="text-right text-sm font-semibold text-[#353535] tabular-nums sm:col-span-2">
                    {formatInr(subtotal)}
                  </div>
                  <div className="flex justify-end sm:col-span-1">
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-[#FF4F78]"
                        aria-label="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-[#E3DFD6] pt-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-[#353535]">
                Amount Paid (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#353535]">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
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
            <div className="rounded-xl bg-[#E3DFD6]/35 p-3 text-xs">
              <p className="text-[#756F69]">Total Purchase</p>
              <p className="mt-0.5 text-base font-bold text-[#353535] tabular-nums">
                {formatInr(totalAmount)}
              </p>
            </div>
            <div className="rounded-xl bg-[#E3DFD6]/35 p-3 text-xs">
              <p className="text-[#756F69]">Remaining Payable</p>
              <p className="mt-0.5 text-base font-bold text-[#8A5A00] tabular-nums">
                {formatInr(remainingPayable)}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={
                !supplierId ||
                lines.every((l) => !l.productId || Number(l.quantity) <= 0)
              }
              onClick={() => setShowConfirm(true)}
              className="rounded-xl bg-[#F0B03B] px-6 py-2.5 text-sm font-bold text-[#353535] shadow-sm hover:bg-[#DDA02D] disabled:opacity-50"
            >
              Review &amp; Confirm Purchase
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Purchase History */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent Purchases ({purchases.length})</CardTitle>
            <CardDescription>Confirmed supplier invoices</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {purchases.length === 0 ? (
            <p className="text-sm text-[#756F69]">
              {loading ? "Loading purchases..." : "No purchases recorded yet."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  <th className="pb-3 pr-4">Ref</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Supplier</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4 text-right">Paid</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {purchases.map((pur) => (
                  <tr key={pur.id} className="hover:bg-[#E3DFD6]/20">
                    <td className="py-3 pr-4 font-mono text-xs text-[#756F69]">
                      {pur.referenceNumber ?? pur.id.slice(0, 8)}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#756F69]">
                      {new Date(pur.transactionDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="py-3 pr-4 font-medium text-[#353535]">
                      {pur.supplierName ?? "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={
                          pur.paymentStatus === "PAID"
                            ? "success"
                            : pur.paymentStatus === "PARTIAL"
                            ? "amber"
                            : "alert"
                        }
                      >
                        {pur.paymentStatus}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-[#756F69]">
                      {formatInr(pur.paidAmount)}
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums text-[#353535]">
                      {formatInr(pur.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Confirm Supplier Purchase?
            </h2>
            <p className="mt-2 text-sm text-[#756F69]">
              Total purchase is <strong>{formatInr(totalAmount)}</strong>. Paid{" "}
              <strong>{formatInr(numericPaid)}</strong> via{" "}
              <strong>{paymentMethod}</strong>; remaining payable{" "}
              <strong>{formatInr(remainingPayable)}</strong>. Inventory will
              increase immediately upon confirmation.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-xl border border-[#D5CFC4] px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmPurchase()}
                className="rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-semibold text-[#353535] hover:bg-[#DDA02D] disabled:opacity-50"
              >
                {submitting ? "Recording..." : "Confirm Purchase"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
