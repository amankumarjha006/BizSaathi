"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpDown,
  History,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
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

interface ProductItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  minimumStock: number;
  unit: string;
  isActive: boolean;
  isLowStock: boolean;
}

interface StockMovementItem {
  id: string;
  movementType: string;
  quantity: number;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

const EMPTY_FORM = {
  name: "",
  sku: "",
  category: "",
  purchasePrice: "",
  sellingPrice: "",
  currentStock: "0",
  minimumStock: "5",
  unit: "pcs",
};

export default function InventoryPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "currentStock" | "sellingPrice">("name");

  // Product modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Adjustment modal state
  const [adjustTarget, setAdjustTarget] = useState<ProductItem | null>(null);
  const [adjustType, setAdjustType] = useState<
    "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "RETURN_IN"
  >("ADJUSTMENT_IN");
  const [adjustQty, setAdjustQty] = useState("1");
  const [adjustNotes, setAdjustNotes] = useState("");

  // Movements drawer state
  const [historyProduct, setHistoryProduct] = useState<ProductItem | null>(null);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadProducts = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeArchived) params.set("includeArchived", "true");
      params.set("sortBy", sortBy);
      const data = await apiFetch<ProductItem[]>(
        `/api/products?${params.toString()}`
      );
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [includeArchived, sortBy]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadProducts();
    }, 0);
    return () => clearTimeout(id);
  }, [loadProducts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== "ALL" && p.category !== categoryFilter) {
        return false;
      }
      if (onlyLowStock && !p.isLowStock) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false) ||
          (p.category?.toLowerCase().includes(q) ?? false);
        if (!match) return false;
      }
      return true;
    });
  }, [products, categoryFilter, onlyLowStock, search]);

  function openCreateModal() {
    setEditingProduct(null);
    setForm(EMPTY_FORM);
    setShowProductModal(true);
  }

  function openEditModal(product: ProductItem) {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku ?? "",
      category: product.category ?? "",
      purchasePrice: String(product.purchasePrice),
      sellingPrice: String(product.sellingPrice),
      currentStock: String(product.currentStock),
      minimumStock: String(product.minimumStock),
      unit: product.unit,
    });
    setShowProductModal(true);
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingProduct) {
        await apiFetch(`/api/products/${editingProduct.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            sku: form.sku || null,
            category: form.category || null,
            purchasePrice: Number(form.purchasePrice),
            sellingPrice: Number(form.sellingPrice),
            minimumStock: Number(form.minimumStock),
            unit: form.unit,
          }),
        });
      } else {
        await apiFetch("/api/products", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            sku: form.sku || undefined,
            category: form.category || undefined,
            purchasePrice: Number(form.purchasePrice),
            sellingPrice: Number(form.sellingPrice),
            currentStock: Number(form.currentStock),
            minimumStock: Number(form.minimumStock),
            unit: form.unit,
          }),
        });
      }
      setShowProductModal(false);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchive(product: ProductItem) {
    setError(null);
    try {
      if (product.isActive) {
        await apiFetch(`/api/products/${product.id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        });
      }
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleAdjustStock(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          productId: adjustTarget.id,
          movementType: adjustType,
          quantity: Number(adjustQty),
          notes: adjustNotes || undefined,
        }),
      });
      setAdjustTarget(null);
      setAdjustQty("1");
      setAdjustNotes("");
      await loadProducts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to adjust stock"
      );
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(product: ProductItem) {
    setHistoryProduct(product);
    setLoadingHistory(true);
    try {
      const data = await apiFetch<StockMovementItem[]>(
        `/api/inventory/${product.id}/movements`
      );
      setMovements(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load stock movements"
      );
    } finally {
      setLoadingHistory(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
              Products &amp; Inventory
            </h1>
            <p className="text-sm text-[#756F69]">
              Manage catalog items, pricing, low-stock thresholds, and stock
              movement history.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-4 py-2.5 text-sm font-semibold text-[#353535] shadow-sm hover:bg-[#DDA02D]"
        >
          <Plus className="h-4 w-4" />
          <span>Add Product</span>
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

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#756F69]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name, SKU, or category..."
              className="w-full rounded-xl border border-[#D5CFC4] bg-white py-2 pl-9 pr-3 text-sm text-[#353535] focus:border-[#F0B03B] focus:outline-none"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-sm text-[#353535]"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-sm">
            <ArrowUpDown className="h-3.5 w-3.5 text-[#756F69]" />
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as "name" | "currentStock" | "sellingPrice"
                )
              }
              aria-label="Sort products"
              className="bg-transparent text-sm text-[#353535] focus:outline-none"
            >
              <option value="name">Sort: Name</option>
              <option value="currentStock">Sort: Stock</option>
              <option value="sellingPrice">Sort: Price</option>
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs font-medium text-[#353535]">
            <input
              type="checkbox"
              checked={onlyLowStock}
              onChange={(e) => setOnlyLowStock(e.target.checked)}
            />
            Low Stock Only
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs font-medium text-[#353535]">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show Archived
          </label>
        </CardContent>
      </Card>

      {/* Product Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Product Catalog ({filteredProducts.length})</CardTitle>
            <CardDescription>
              All stock mutations are tracked via StockMovement records
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {filteredProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D5CFC4] p-8 text-center text-sm text-[#756F69]">
              {loading
                ? "Loading inventory..."
                : "No products match the current filters."}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  <th className="pb-3 pr-4">Product</th>
                  <th className="pb-3 pr-4">Category</th>
                  <th className="pb-3 pr-4 text-right">Purchase</th>
                  <th className="pb-3 pr-4 text-right">Selling</th>
                  <th className="pb-3 pr-4 text-right">Stock</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {filteredProducts.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-[#E3DFD6]/20 ${
                      !p.isActive ? "opacity-60" : ""
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <p className="font-medium text-[#353535]">{p.name}</p>
                      {p.sku && (
                        <p className="font-mono text-xs text-[#756F69]">
                          SKU: {p.sku}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#756F69]">
                      {p.category ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-[#756F69]">
                      {formatInr(p.purchasePrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums text-[#353535]">
                      {formatInr(p.sellingPrice)}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                      {p.currentStock} {p.unit}
                      <span className="block text-[11px] font-normal text-[#756F69]">
                        Min: {p.minimumStock}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {!p.isActive ? (
                        <Badge variant="neutral">Archived</Badge>
                      ) : p.isLowStock ? (
                        <Badge variant="alert">Low Stock</Badge>
                      ) : (
                        <Badge variant="success">In Stock</Badge>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          title="Edit product"
                          className="rounded-lg border border-[#D5CFC4] p-1.5 text-[#353535] hover:bg-[#E3DFD6]/50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAdjustTarget(p)}
                          title="Adjust stock"
                          className="rounded-lg border border-[#D5CFC4] p-1.5 text-[#353535] hover:bg-[#E3DFD6]/50"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void openHistory(p)}
                          title="Stock movements"
                          className="rounded-lg border border-[#D5CFC4] p-1.5 text-[#353535] hover:bg-[#E3DFD6]/50"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleArchive(p)}
                          title={p.isActive ? "Archive product" : "Restore product"}
                          className="rounded-lg border border-[#D5CFC4] p-1.5 text-[#756F69] hover:bg-[#E3DFD6]/50 hover:text-[#353535]"
                        >
                          {p.isActive ? (
                            <Archive className="h-3.5 w-3.5" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#353535]">
              {editingProduct ? "Edit Product" : "Add New Product"}
            </h2>
            <form onSubmit={handleSaveProduct} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#353535]">
                    Product Name *
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                    placeholder="e.g. Amul Taaza Milk 500ml"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#353535]">
                    SKU / Code
                  </label>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#353535]">
                    Category
                  </label>
                  <input
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                    placeholder="e.g. Dairy, Staples"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#353535]">
                    Purchase Price (₹) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.purchasePrice}
                    onChange={(e) =>
                      setForm({ ...form, purchasePrice: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#353535]">
                    Selling Price (₹) *
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.sellingPrice}
                    onChange={(e) =>
                      setForm({ ...form, sellingPrice: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                  />
                </div>
                {!editingProduct && (
                  <div>
                    <label className="block text-xs font-semibold text-[#353535]">
                      Opening Stock
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={form.currentStock}
                      onChange={(e) =>
                        setForm({ ...form, currentStock: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-[#353535]">
                    Min Stock Threshold
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.minimumStock}
                    onChange={(e) =>
                      setForm({ ...form, minimumStock: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#353535]">
                    Unit *
                  </label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                  >
                    <option value="pcs">pcs</option>
                    <option value="kg">kg</option>
                    <option value="litre">litre</option>
                    <option value="pkt">pkt</option>
                    <option value="bag">bag</option>
                    <option value="box">box</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="rounded-xl border border-[#D5CFC4] px-4 py-2 text-sm font-medium text-[#353535]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-semibold text-[#353535] hover:bg-[#DDA02D] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Adjust Stock: {adjustTarget.name}
            </h2>
            <p className="mt-1 text-xs text-[#756F69]">
              Current Stock: {adjustTarget.currentStock} {adjustTarget.unit}
            </p>
            <form onSubmit={handleAdjustStock} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Adjustment Type
                </label>
                <select
                  value={adjustType}
                  onChange={(e) =>
                    setAdjustType(
                      e.target.value as
                        | "ADJUSTMENT_IN"
                        | "ADJUSTMENT_OUT"
                        | "RETURN_IN"
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                >
                  <option value="ADJUSTMENT_IN">Add Stock (ADJUSTMENT_IN)</option>
                  <option value="ADJUSTMENT_OUT">
                    Remove Stock (ADJUSTMENT_OUT)
                  </option>
                  <option value="RETURN_IN">Customer Return (RETURN_IN)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Quantity ({adjustTarget.unit})
                </label>
                <input
                  required
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#353535]">
                  Reason / Notes
                </label>
                <input
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="e.g. Damaged pack, physical stock count"
                  className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="rounded-xl border border-[#D5CFC4] px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-semibold text-[#353535] hover:bg-[#DDA02D] disabled:opacity-50"
                >
                  {saving ? "Updating..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Movement History Modal */}
      {historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
                  Stock Movements: {historyProduct.name}
                </h2>
                <p className="text-xs text-[#756F69]">
                  Current balance: {historyProduct.currentStock}{" "}
                  {historyProduct.unit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryProduct(null)}
                className="rounded-xl border border-[#D5CFC4] px-3 py-1.5 text-xs font-medium"
              >
                Close
              </button>
            </div>
            <div className="mt-4 max-h-80 overflow-y-auto">
              {loadingHistory ? (
                <p className="text-sm text-[#756F69]">Loading history...</p>
              ) : movements.length === 0 ? (
                <p className="text-sm text-[#756F69]">
                  No stock movements recorded for this product yet.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E3DFD6] text-[#756F69]">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 pl-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3DFD6]/70">
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2 font-mono text-[#756F69]">
                          {new Date(m.createdAt).toLocaleDateString("en-IN")}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant={
                              m.movementType.endsWith("_IN")
                                ? "success"
                                : "alert"
                            }
                          >
                            {m.movementType}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {m.movementType.endsWith("_IN") ? "+" : "-"}
                          {m.quantity} {historyProduct.unit}
                        </td>
                        <td className="py-2 pl-3 text-[#756F69]">
                          {m.notes ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
