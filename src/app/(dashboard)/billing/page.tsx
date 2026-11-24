"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
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

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  sellingPrice: number;
  currentStock: number;
  unit: string;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  outstandingDue: number;
}

interface CartItem {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  availableStock: number;
  quantity: number;
}

interface CompletedBill {
  id: string;
  referenceNumber: string | null;
  transactionDate: string;
  customerName: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: string;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  payments: Array<{
    paymentMethod: string;
    amount: number;
  }>;
}

export default function BillingPage() {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "UPI" | "BANK_TRANSFER" | "OTHER"
  >("CASH");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [notes, setNotes] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedBill, setCompletedBill] = useState<CompletedBill | null>(null);

  async function loadCatalog() {
    await Promise.resolve();
    try {
      const [prods, custs] = await Promise.all([
        apiFetch<ProductOption[]>("/api/products"),
        apiFetch<CustomerOption[]>("/api/customers"),
      ]);
      setProducts(prods);
      setCustomers(custs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      void loadCatalog();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q) ?? false)
    );
  }, [products, search]);

  const cartTotal = useMemo(
    () =>
      Number(
        cart
          .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
          .toFixed(2)
      ),
    [cart]
  );

  const effectivePaid =
    paidAmountInput === "" ? cartTotal : Math.max(0, Number(paidAmountInput));
  const estimatedDue = Math.max(
    0,
    Number((cartTotal - effectivePaid).toFixed(2))
  );

  function addToCart(product: ProductOption) {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.currentStock) {
          setError(
            `Only ${product.currentStock} ${product.unit} available for ${product.name}.`
          );
          return prev;
        }
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      if (product.currentStock <= 0) {
        setError(`${product.name} is currently out of stock.`);
        return prev;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          unitPrice: product.sellingPrice,
          availableStock: product.currentStock,
          quantity: 1,
        },
      ];
    });
  }

  function updateQty(productId: string, nextQty: number) {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, quantity: nextQty } : i
      )
    );
  }

  async function handleConfirmSale() {
    setSubmitting(true);
    setError(null);
    try {
      const bill = await apiFetch<CompletedBill>("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          customerId: customerId || undefined,
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          paidAmount: effectivePaid,
          paymentMethod,
          notes: notes || undefined,
        }),
      });
      setCompletedBill(bill);
      setCart([]);
      setPaidAmountInput("");
      setNotes("");
      setShowConfirm(false);
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete sale");
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
              Sales &amp; Digital Billing
            </h1>
            <p className="text-sm text-[#756F69]">
              Point-of-Sale billing with atomic stock deduction and customer
              Udhaar tracking.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-4 text-sm text-[#B81D43] print:hidden"
        >
          {error}
        </div>
      )}

      {/* Printable Bill Receipt View */}
      {completedBill && (
        <Card className="border-2 border-[#22B55B]/40">
          <CardHeader className="print:hidden">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-[#22B55B]" />
              <div>
                <CardTitle>Sale Confirmed — Receipt Ready</CardTitle>
                <CardDescription>
                  Bill {completedBill.referenceNumber} saved and inventory
                  updated.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-4 py-2 text-sm font-semibold text-[#353535] hover:bg-[#DDA02D]"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setCompletedBill(null)}
                className="rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm font-medium"
              >
                New Bill
              </button>
            </div>
          </CardHeader>
          <CardContent className="rounded-xl bg-[#E3DFD6]/20 p-6 print:bg-white">
            <div className="mx-auto max-w-md space-y-4 rounded-xl border border-[#D5CFC4] bg-white p-6">
              <div className="border-b border-dashed border-[#D5CFC4] pb-3 text-center">
                <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
                  Shree Ganesh Kirana Store
                </h2>
                <p className="text-xs text-[#756F69]">
                  Bill No: {completedBill.referenceNumber}
                </p>
                <p className="text-xs text-[#756F69]">
                  {new Date(completedBill.transactionDate).toLocaleString(
                    "en-IN"
                  )}
                </p>
                {completedBill.customerName && (
                  <p className="mt-1 text-xs font-medium text-[#353535]">
                    Customer: {completedBill.customerName}
                  </p>
                )}
              </div>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E3DFD6] text-[#756F69]">
                    <th className="pb-1.5 text-left">Item</th>
                    <th className="pb-1.5 text-right">Qty</th>
                    <th className="pb-1.5 text-right">Rate</th>
                    <th className="pb-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3DFD6]/60">
                  {completedBill.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1.5 text-[#353535]">
                        {item.productNameSnapshot}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatInr(item.unitPrice)}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">
                        {formatInr(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 border-t border-dashed border-[#D5CFC4] pt-3 text-xs">
                <div className="flex justify-between font-bold text-[#353535] text-sm">
                  <span>Final Amount</span>
                  <span className="tabular-nums">
                    {formatInr(completedBill.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-[#22B55B]">
                  <span>
                    Paid (
                    {completedBill.payments[0]?.paymentMethod ?? "UNPAID"})
                  </span>
                  <span className="tabular-nums">
                    {formatInr(completedBill.paidAmount)}
                  </span>
                </div>
                {completedBill.outstandingAmount > 0 && (
                  <div className="flex justify-between font-semibold text-[#B81D43]">
                    <span>Outstanding Udhaar</span>
                    <span className="tabular-nums">
                      {formatInr(completedBill.outstandingAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* POS Workspace */}
      <div className="grid gap-6 lg:grid-cols-5 print:hidden">
        {/* Product Picker */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Select Products</CardTitle>
              <CardDescription>
                Tap any in-stock item to add it to the current bill
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#756F69]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name or SKU..."
                className="w-full rounded-xl border border-[#D5CFC4] py-2.5 pl-9 pr-3 text-sm"
              />
            </div>

            <div className="grid max-h-[460px] gap-3 overflow-y-auto sm:grid-cols-2">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  disabled={p.currentStock <= 0}
                  className="flex flex-col justify-between rounded-xl border border-[#D5CFC4] bg-white p-3.5 text-left transition hover:border-[#F0B03B] hover:bg-[#E3DFD6]/20 disabled:opacity-50"
                >
                  <div>
                    <p className="font-semibold text-[#353535] text-sm">
                      {p.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[#756F69]">
                      Stock: {p.currentStock} {p.unit}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-bold text-[#353535] tabular-nums">
                      {formatInr(p.sellingPrice)}
                    </span>
                    <Badge variant={p.currentStock > 0 ? "success" : "alert"}>
                      {p.currentStock > 0 ? "Add +" : "Out"}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cart & Checkout */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Current Bill ({cart.length})</CardTitle>
              <CardDescription>
                Review quantities, customer, and payment
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-6 text-center text-sm text-[#756F69]">
                Cart is empty. Select products on the left to start a bill.
              </div>
            ) : (
              <div className="max-h-64 space-y-2.5 overflow-y-auto">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#E3DFD6] bg-[#E3DFD6]/20 p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[#353535]">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-[#756F69]">
                        {formatInr(item.unitPrice)} / {item.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateQty(item.productId, item.quantity - 1)
                        }
                        className="rounded-lg border border-[#D5CFC4] bg-white p-1"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        max={item.availableStock}
                        value={item.quantity}
                        onChange={(e) =>
                          updateQty(item.productId, Number(e.target.value))
                        }
                        className="w-14 rounded-lg border border-[#D5CFC4] bg-white px-1.5 py-1 text-center text-xs tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateQty(item.productId, item.quantity + 1)
                        }
                        className="rounded-lg border border-[#D5CFC4] bg-white p-1"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, 0)}
                        className="ml-1 text-[#FF4F78]"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-[#E3DFD6] pt-3">
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Customer (Optional for Cash, Required for Udhaar)
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                >
                  <option value="">Walk-in Customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-[#353535]">
                    Paid Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={String(cartTotal)}
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
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
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-[#E3DFD6]/40 p-3 text-sm">
                <div className="flex justify-between font-bold text-[#353535]">
                  <span>Bill Total</span>
                  <span className="tabular-nums">{formatInr(cartTotal)}</span>
                </div>
                <div className="mt-1 flex justify-between text-xs text-[#756F69]">
                  <span>Customer Udhaar Due</span>
                  <span className="font-semibold text-[#8A5A00] tabular-nums">
                    {formatInr(estimatedDue)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setShowConfirm(true)}
                className="w-full rounded-xl bg-[#F0B03B] py-3 text-sm font-bold text-[#353535] shadow-sm hover:bg-[#DDA02D] disabled:opacity-50"
              >
                Preview &amp; Confirm Sale
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Confirm Sale?
            </h2>
            <p className="mt-2 text-sm text-[#756F69]">
              Total bill is <strong>{formatInr(cartTotal)}</strong>, with{" "}
              <strong>{formatInr(effectivePaid)}</strong> paid via{" "}
              <strong>{paymentMethod}</strong>
              {estimatedDue > 0
                ? ` and ${formatInr(estimatedDue)} added to Customer Udhaar.`
                : "."}
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
                onClick={() => void handleConfirmSale()}
                className="rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-semibold text-[#353535] hover:bg-[#DDA02D] disabled:opacity-50"
              >
                {submitting ? "Recording..." : "Confirm & Generate Bill"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
