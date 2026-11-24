"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Save,
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
import type {
  FinancialValidationSummary,
  ReviewedDocumentDraft,
  ReviewedLineItem,
} from "@/server/validations/document-extraction";

interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  sellingPrice: number;
  purchasePrice: number;
  currentStock: number;
}

interface PartyOption {
  id: string;
  name: string;
}

export interface DocumentDetailModel {
  id: string;
  documentType:
    | "PURCHASE_INVOICE"
    | "SALES_RECEIPT"
    | "CUSTOMER_ORDER"
    | "EXPENSE_RECEIPT";
  fileName: string;
  mimeType: string;
  fileSize: number;
  processingStatus: string;
  extractionWarnings: string[];
  failureReason: string | null;
  confirmedTransactionId: string | null;
  uploadedAt: string;
  processedAt: string | null;
  confirmedAt: string | null;
  draft: ReviewedDocumentDraft | null;
  financialSummary: FinancialValidationSummary | null;
}

interface Props {
  document: DocumentDetailModel;
  products: CatalogProduct[];
  suppliers: PartyOption[];
  customers: PartyOption[];
  onRefresh: () => Promise<void>;
}

export function DocumentReviewWorkspace({
  document,
  products,
  suppliers,
  customers,
  onRefresh,
}: Props) {
  const [draft, setDraft] = useState<ReviewedDocumentDraft | null>(
    document.draft
  );
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isConfirmed =
    document.processingStatus === "CONFIRMED" ||
    Boolean(document.confirmedTransactionId);

  const calculated = useMemo(() => {
    if (!draft) return null;
    const subtotal = Number(
      draft.items
        .reduce(
          (sum, item) =>
            sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
          0
        )
        .toFixed(2)
    );
    const discount = Number(draft.discountAmount) || 0;
    const tax = Number(draft.taxAmount) || 0;
    const isSummaryExpense =
      draft.selectedDocumentType === "EXPENSE_RECEIPT" &&
      draft.items.length === 0 &&
      draft.extractedTotalAmount !== null &&
      draft.extractedTotalAmount !== undefined;

    const netTotal = isSummaryExpense
      ? Number(draft.extractedTotalAmount)
      : Math.max(0, Number((subtotal - discount + tax).toFixed(2)));
    const extracted =
      draft.extractedTotalAmount !== null &&
      draft.extractedTotalAmount !== undefined
        ? Number(draft.extractedTotalAmount)
        : null;
    const discrepancy =
      extracted !== null && !isSummaryExpense
        ? Number(Math.abs(extracted - netTotal).toFixed(2))
        : 0;
    return {
      subtotal: isSummaryExpense ? netTotal : subtotal,
      netTotal,
      extracted,
      discrepancy,
      hasDiscrepancy: !isSummaryExpense && extracted !== null && discrepancy > 0.01,
    };
  }, [draft]);

  const unmatchedCount = useMemo(() => {
    if (!draft) return 0;
    if (
      draft.selectedDocumentType === "EXPENSE_RECEIPT" ||
      draft.selectedDocumentType === "CUSTOMER_ORDER"
    ) {
      return 0;
    }
    return draft.items.filter(
      (i) =>
        !i.matchedProductId &&
        !(
          draft.selectedDocumentType === "PURCHASE_INVOICE" &&
          i.createNewProduct
        )
    ).length;
  }, [draft]);

  function updateItem(index: number, patch: Partial<ReviewedLineItem>) {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((item, idx) =>
        idx === index ? { ...item, ...patch } : item
      ),
    });
  }

  function addBlankItem() {
    if (!draft) return;
    setDraft({
      ...draft,
      items: [
        ...draft.items,
        {
          id: `manual-${Date.now()}`,
          sourceProductName: "New Item",
          sku: null,
          quantity: 1,
          unit: "pcs",
          unitPrice: 0,
          matchedProductId: null,
          matchStatus: "NO_MATCH",
          suggestions: [],
          createNewProduct: false,
          needsReview: true,
          reviewReason: "Added manually during review",
        },
      ],
    });
  }

  async function handleSaveDraft() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const updated = await apiFetch<DocumentDetailModel>(
        `/api/documents/${document.id}/review`,
        {
          method: "PATCH",
          body: JSON.stringify(draft),
        }
      );
      setDraft(updated.draft);
      setSuccessMsg("Review draft saved.");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAnalyzeOrRetry() {
    setAnalyzing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const endpoint =
        document.processingStatus === "FAILED"
          ? `/api/documents/${document.id}/retry`
          : `/api/documents/${document.id}/analyze`;
      const analyzed = await apiFetch<DocumentDetailModel>(endpoint, {
        method: "POST",
      });
      setDraft(analyzed.draft);
      setSuccessMsg("Gemini analysis completed. Please review the extracted fields.");
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to analyze document."
      );
      await onRefresh();
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleConfirmDocument() {
    if (!draft) return;
    setConfirming(true);
    setError(null);
    try {
      // Save latest reviewed draft first, then execute atomic confirmation
      await apiFetch(`/api/documents/${document.id}/review`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      const result = await apiFetch<{
        confirmedTransactionId: string;
        processingStatus: string;
      }>(`/api/documents/${document.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          discrepancyAcknowledged: draft.discrepancyAcknowledged,
        }),
      });
      setShowConfirmModal(false);
      setSuccessMsg(
        `Document confirmed! Transaction ${result.confirmedTransactionId} created and records updated.`
      );
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Document confirmation failed."
      );
      setShowConfirmModal(false);
    } finally {
      setConfirming(false);
    }
  }

  const filePreviewUrl = `/api/documents/${document.id}/file`;

  return (
    <div className="space-y-6">
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

      {isConfirmed && (
        <Card className="border-2 border-[#22B55B]/40 bg-[#22B55B]/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[#22B55B]" />
              <div>
                <p className="font-semibold text-[#353535]">
                  Document Confirmed &amp; Posted
                </p>
                <p className="text-xs text-[#756F69]">
                  Linked Transaction ID: {document.confirmedTransactionId}
                </p>
              </div>
            </div>
            <Link
              href="/transactions"
              className="rounded-xl bg-[#353535] px-4 py-2 text-xs font-semibold text-white hover:bg-[#353535]/90"
            >
              View in Transactions →
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Original Document Preview */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Original Document</CardTitle>
              <CardDescription>
                {document.fileName} · {(document.fileSize / 1024).toFixed(1)} KB
              </CardDescription>
            </div>
            <Badge
              variant={
                document.processingStatus === "CONFIRMED"
                  ? "success"
                  : document.processingStatus === "FAILED"
                  ? "alert"
                  : document.processingStatus === "DUPLICATE"
                  ? "amber"
                  : "info"
              }
            >
              {document.processingStatus}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#D5CFC4] bg-[#E3DFD6]/30">
              {document.mimeType === "application/pdf" ? (
                <iframe
                  src={filePreviewUrl}
                  title={document.fileName}
                  className="h-[480px] w-full"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={filePreviewUrl}
                  alt={document.fileName}
                  className="max-h-[480px] w-full object-contain"
                />
              )}
            </div>

            {document.failureReason && (
              <div className="rounded-xl border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-3 text-xs text-[#B81D43]">
                <strong>Extraction Error:</strong> {document.failureReason}
              </div>
            )}

            {document.extractionWarnings.length > 0 && (
              <div className="rounded-xl border border-[#F0B03B]/50 bg-[#F0B03B]/15 p-3 text-xs text-[#353535]">
                <p className="flex items-center gap-1.5 font-semibold text-[#8A5A00]">
                  <AlertTriangle className="h-4 w-4" />
                  Verification Warnings
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[#756F69]">
                  {document.extractionWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {!isConfirmed && (
              <button
                type="button"
                disabled={analyzing}
                onClick={() => void handleAnalyzeOrRetry()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#353535] bg-[#353535] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#353535]/90 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${analyzing ? "animate-spin" : ""}`}
                />
                <span>
                  {analyzing
                    ? "Analyzing with Gemini..."
                    : draft
                    ? "Re-run Gemini Extraction"
                    : "Run Gemini Extraction"}
                </span>
              </button>
            )}
          </CardContent>
        </Card>

        {/* Right: Extracted & Editable Review Panel */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Extracted Data &amp; Review</CardTitle>
              <CardDescription>
                Verify party, matched products, quantities, and totals before
                confirming
              </CardDescription>
            </div>
            {draft && !isConfirmed && (
              <Badge
                variant={
                  unmatchedCount > 0 || calculated?.hasDiscrepancy
                    ? "amber"
                    : "success"
                }
              >
                {unmatchedCount > 0
                  ? `${unmatchedCount} unmatched item(s)`
                  : calculated?.hasDiscrepancy
                  ? "Total mismatch"
                  : "Ready for confirmation"}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {!draft ? (
              <div className="rounded-xl border border-dashed border-[#D5CFC4] p-10 text-center text-sm text-[#756F69]">
                <FileText className="mx-auto mb-2 h-8 w-8 text-[#756F69]" />
                This document has not been analyzed yet. Click{" "}
                <strong>Run Gemini Extraction</strong> to extract line items.
              </div>
            ) : (
              <div className="space-y-5">
                {/* Document Metadata Fields */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {document.documentType === "PURCHASE_INVOICE" && (
                    <div>
                      <label className="block text-xs font-semibold text-[#353535]">
                        Matched Supplier
                      </label>
                      <select
                        disabled={isConfirmed}
                        value={draft.supplierId ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            supplierId: e.target.value || null,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                      >
                        <option value="">
                          Create / Match by Name below
                        </option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <input
                        disabled={isConfirmed}
                        value={draft.supplierName ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, supplierName: e.target.value })
                        }
                        placeholder="Extracted supplier name"
                        className="mt-1.5 w-full rounded-xl border border-[#D5CFC4] px-3 py-1.5 text-xs"
                      />
                    </div>
                  )}

                  {(document.documentType === "SALES_RECEIPT" ||
                    document.documentType === "CUSTOMER_ORDER") && (
                    <div>
                      <label className="block text-xs font-semibold text-[#353535]">
                        Matched Customer
                      </label>
                      <select
                        disabled={isConfirmed}
                        value={draft.customerId ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            customerId: e.target.value || null,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                      >
                        <option value="">
                          Walk-in / Create by Name below
                        </option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        disabled={isConfirmed}
                        value={draft.customerName ?? ""}
                        onChange={(e) =>
                          setDraft({ ...draft, customerName: e.target.value })
                        }
                        placeholder="Extracted customer name"
                        className="mt-1.5 w-full rounded-xl border border-[#D5CFC4] px-3 py-1.5 text-xs"
                      />
                    </div>
                  )}

                  {document.documentType === "EXPENSE_RECEIPT" && (
                    <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-[#353535]">
                          Merchant / Vendor
                        </label>
                        <input
                          disabled={isConfirmed}
                          value={draft.supplierName ?? ""}
                          onChange={(e) =>
                            setDraft({ ...draft, supplierName: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#353535]">
                          Expense Category
                        </label>
                        <input
                          disabled={isConfirmed}
                          value={draft.expenseCategory ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              expenseCategory: e.target.value,
                            })
                          }
                          placeholder="e.g. Electricity, Transport"
                          className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-[#353535]">
                          Expense Description
                        </label>
                        <input
                          disabled={isConfirmed}
                          value={draft.expenseDescription ?? ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              expenseDescription: e.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#353535]">
                      Invoice / Reference No.
                    </label>
                    <input
                      disabled={isConfirmed}
                      value={draft.invoiceNumber ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, invoiceNumber: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#353535]">
                      Document Date
                    </label>
                    <input
                      disabled={isConfirmed}
                      type="date"
                      value={draft.documentDate ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, documentDate: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-[#D5CFC4] px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Line Items & Product Matching */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                      Line Items ({draft.items.length})
                    </h3>
                    {!isConfirmed && (
                      <button
                        type="button"
                        onClick={addBlankItem}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#D5CFC4] px-2.5 py-1 text-xs font-semibold text-[#353535] hover:bg-[#E3DFD6]/40"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Item
                      </button>
                    )}
                  </div>

                  {draft.items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="space-y-2.5 rounded-xl border border-[#D5CFC4] bg-[#E3DFD6]/20 p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              item.matchedProductId
                                ? "success"
                                : item.matchStatus === "POSSIBLE_MATCH"
                                ? "amber"
                                : "alert"
                            }
                          >
                            {item.matchedProductId
                              ? "MATCHED"
                              : item.matchStatus}
                          </Badge>
                          <span className="text-xs font-semibold text-[#353535]">
                            Extracted: &ldquo;{item.sourceProductName}&rdquo;
                          </span>
                        </div>
                        {!isConfirmed && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                items: draft.items.filter((_, i) => i !== idx),
                              })
                            }
                            className="text-xs text-[#FF4F78]"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {item.reviewReason && !item.matchedProductId && (
                        <p className="text-[11px] text-[#8A5A00]">
                          {item.reviewReason}
                        </p>
                      )}

                      <div className="grid gap-2 sm:grid-cols-12">
                        <div className="sm:col-span-5">
                          <label className="block text-[11px] font-medium text-[#756F69]">
                            Catalog Product Match
                          </label>
                          <select
                            disabled={isConfirmed}
                            value={item.matchedProductId ?? ""}
                            onChange={(e) => {
                              const pid = e.target.value || null;
                              updateItem(idx, {
                                matchedProductId: pid,
                                matchStatus: pid ? "EXACT_MATCH" : "NO_MATCH",
                                createNewProduct: false,
                              });
                            }}
                            className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-xs"
                          >
                            <option value="">-- Unmatched --</option>
                            {item.suggestions && item.suggestions.length > 0 && (
                              <optgroup label="Suggested Matches">
                                {item.suggestions.map((s) => (
                                  <option key={`sug-${s.productId}`} value={s.productId}>
                                    ★ {s.name} ({Math.round(s.score * 100)}%)
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="All Catalog Products">
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.currentStock} {p.unit})
                                </option>
                              ))}
                            </optgroup>
                          </select>

                          {!item.matchedProductId &&
                            document.documentType === "PURCHASE_INVOICE" &&
                            !isConfirmed && (
                              <label className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#353535]">
                                <input
                                  type="checkbox"
                                  checked={Boolean(item.createNewProduct)}
                                  onChange={(e) =>
                                    updateItem(idx, {
                                      createNewProduct: e.target.checked,
                                    })
                                  }
                                />
                                Create new product &ldquo;{item.sourceProductName}
                                &rdquo;
                              </label>
                            )}
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-[#756F69]">
                            Qty
                          </label>
                          <input
                            disabled={isConfirmed}
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(idx, {
                                quantity: Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2 py-1.5 text-xs tabular-nums"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-[#756F69]">
                            Unit
                          </label>
                          <input
                            disabled={isConfirmed}
                            value={item.unit}
                            onChange={(e) =>
                              updateItem(idx, { unit: e.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2 py-1.5 text-xs"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-medium text-[#756F69]">
                            Unit Price (₹)
                          </label>
                          <input
                            disabled={isConfirmed}
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateItem(idx, {
                                unitPrice: Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2 py-1.5 text-xs tabular-nums"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals & Payment */}
                <div className="grid gap-3 rounded-xl border border-[#D5CFC4] bg-[#E3DFD6]/25 p-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#353535]">
                      Discount (₹)
                    </label>
                    <input
                      disabled={isConfirmed}
                      type="number"
                      step="0.01"
                      min="0"
                      value={draft.discountAmount}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          discountAmount: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#353535]">
                      Tax (₹)
                    </label>
                    <input
                      disabled={isConfirmed}
                      type="number"
                      step="0.01"
                      min="0"
                      value={draft.taxAmount}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          taxAmount: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#353535]">
                      Amount Paid (₹)
                    </label>
                    <input
                      disabled={isConfirmed}
                      type="number"
                      step="0.01"
                      min="0"
                      value={draft.amountPaid}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          amountPaid: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#353535]">
                      Payment Method
                    </label>
                    <select
                      disabled={isConfirmed}
                      value={draft.paymentMethod}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          paymentMethod: e.target.value as
                            | "CASH"
                            | "UPI"
                            | "BANK_TRANSFER"
                            | "OTHER",
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-1.5 text-sm"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                {calculated && (
                  <div className="space-y-2 rounded-xl border border-[#D5CFC4] bg-white p-4 text-sm">
                    <div className="flex justify-between text-[#756F69]">
                      <span>Calculated Items Subtotal</span>
                      <span className="tabular-nums">
                        {formatInr(calculated.subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-[#353535] text-base">
                      <span>Calculated Net Total</span>
                      <span className="tabular-nums">
                        {formatInr(calculated.netTotal)}
                      </span>
                    </div>
                    {calculated.extracted !== null && (
                      <div className="flex justify-between text-xs text-[#756F69]">
                        <span>Printed Total Extracted from Document</span>
                        <span className="tabular-nums">
                          {formatInr(calculated.extracted)}
                        </span>
                      </div>
                    )}
                    {calculated.hasDiscrepancy && (
                      <div className="mt-2 rounded-lg border border-[#FF4F78]/40 bg-[#FF4F78]/10 p-3 text-xs text-[#B81D43]">
                        <p className="font-semibold">
                          Discrepancy of {formatInr(calculated.discrepancy)}{" "}
                          detected between line items and printed document total.
                        </p>
                        {!isConfirmed && (
                          <label className="mt-2 flex items-center gap-2 font-medium text-[#353535]">
                            <input
                              type="checkbox"
                              checked={draft.discrepancyAcknowledged}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  discrepancyAcknowledged: e.target.checked,
                                })
                              }
                            />
                            Acknowledge discrepancy and use calculated net total
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isConfirmed && (
                  <div className="flex flex-wrap justify-end gap-3 pt-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveDraft()}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#D5CFC4] bg-white px-4 py-2.5 text-sm font-semibold text-[#353535] hover:bg-[#E3DFD6]/40 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      <span>{saving ? "Saving..." : "Save Draft"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => setShowConfirmModal(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#F0B03B] px-5 py-2.5 text-sm font-bold text-[#353535] shadow-sm hover:bg-[#DDA02D] disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirm and Update Business Records</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {showConfirmModal && draft && calculated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#353535]/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-[#353535]">
              Confirm Document &amp; Update Records?
            </h2>
            <p className="mt-2 text-sm text-[#756F69]">
              This will create a{" "}
              <strong>{document.documentType.replace("_", " ")}</strong>{" "}
              transaction for{" "}
              <strong>{formatInr(calculated.netTotal)}</strong> through the
              central transaction engine and mark this document as{" "}
              <strong>CONFIRMED</strong>.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl border border-[#D5CFC4] px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={() => void handleConfirmDocument()}
                className="rounded-xl bg-[#F0B03B] px-5 py-2 text-sm font-bold text-[#353535] hover:bg-[#DDA02D] disabled:opacity-50"
              >
                {confirming ? "Confirming..." : "Confirm & Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
