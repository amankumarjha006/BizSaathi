"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  RefreshCw,
  UploadCloud,
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

type DocType =
  | "PURCHASE_INVOICE"
  | "SALES_RECEIPT"
  | "CUSTOMER_ORDER"
  | "EXPENSE_RECEIPT";

interface DocumentListItem {
  id: string;
  documentType: DocType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  processingStatus: string;
  supplierName: string | null;
  customerName: string | null;
  extractedTotalAmount: number | null;
  confirmedTransactionId: string | null;
  uploadedAt: string;
  failureReason: string | null;
}

interface DocumentListResponse {
  items: DocumentListItem[];
  stats: {
    total: number;
    pendingReview: number;
    confirmed: number;
    failed: number;
  };
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  PURCHASE_INVOICE: "Supplier Purchase Invoice",
  SALES_RECEIPT: "Customer Sales Receipt",
  CUSTOMER_ORDER: "Customer Order",
  EXPENSE_RECEIPT: "Expense Receipt",
};

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pendingReview: 0,
    confirmed: 0,
    failed: 0,
  });
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<DocType>("PURCHASE_INVOICE");
  const [dragActive, setDragActive] = useState(false);
  const [uploadStage, setUploadStage] = useState<
    "IDLE" | "UPLOADING" | "ANALYZING"
  >("IDLE");

  const loadDocuments = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("documentType", typeFilter);
      const data = await apiFetch<DocumentListResponse>(
        `/api/documents?${params.toString()}`
      );
      setDocs(data.items);
      setStats(data.stats);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load documents"
      );
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadDocuments();
    }, 0);
    return () => clearTimeout(id);
  }, [loadDocuments]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleSelectFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    if (file && file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  }

  async function handleUploadAndAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    setError(null);
    setUploadStage("UPLOADING");
    let uploadedId: string | null = null;

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", documentType);

      const uploadRes = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });
      const uploadJson = (await uploadRes.json()) as {
        success: boolean;
        data?: { documentId: string; isDuplicate: boolean };
        error?: { message: string };
      };
      if (!uploadRes.ok || !uploadJson.success || !uploadJson.data) {
        throw new Error(
          uploadJson.error?.message ?? "Document upload failed."
        );
      }

      uploadedId = uploadJson.data.documentId;
      setUploadStage("ANALYZING");

      await apiFetch(`/api/documents/${uploadedId}/analyze`, {
        method: "POST",
      });

      router.push(`/documents/${uploadedId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process document."
      );
      await loadDocuments();
      if (uploadedId) {
        // Still allow navigating to the uploaded document to view/retry
        setSelectedFile(null);
      }
    } finally {
      setUploadStage("IDLE");
    }
  }

  async function handleRetry(id: string) {
    setError(null);
    try {
      await apiFetch(`/api/documents/${id}/retry`, { method: "POST" });
      router.push(`/documents/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
      await loadDocuments();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#353535] text-[#F0B03B]">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[#353535]">
            AI Document Intelligence
          </h1>
          <p className="text-sm text-[#756F69]">
            Upload supplier invoices, sales receipts, customer orders, or
            expense bills for Gemini extraction and verified posting.
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

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-[#756F69]">
                Total Documents
              </p>
              <p className="mt-1 text-2xl font-bold text-[#353535] tabular-nums">
                {stats.total}
              </p>
            </div>
            <FileText className="h-5 w-5 text-[#4285F4]" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-[#756F69]">
                Pending Review
              </p>
              <p className="mt-1 text-2xl font-bold text-[#8A5A00] tabular-nums">
                {stats.pendingReview}
              </p>
            </div>
            <Clock className="h-5 w-5 text-[#F0B03B]" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-[#756F69]">
                Confirmed
              </p>
              <p className="mt-1 text-2xl font-bold text-[#22B55B] tabular-nums">
                {stats.confirmed}
              </p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-[#22B55B]" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium uppercase text-[#756F69]">
                Failed
              </p>
              <p className="mt-1 text-2xl font-bold text-[#FF4F78] tabular-nums">
                {stats.failed}
              </p>
            </div>
            <AlertCircle className="h-5 w-5 text-[#FF4F78]" />
          </CardContent>
        </Card>
      </div>

      {/* Upload Form */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Upload &amp; Process Document</CardTitle>
            <CardDescription>
              Accepted formats: JPG, JPEG, PNG, PDF (max 10 MB, max 10 PDF
              pages). Files are stored privately.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUploadAndAnalyze} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  handleSelectFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition lg:col-span-2 ${
                  dragActive
                    ? "border-[#F0B03B] bg-[#F0B03B]/15"
                    : "border-[#D5CFC4] bg-[#E3DFD6]/20"
                }`}
              >
                <UploadCloud className="mb-2 h-8 w-8 text-[#756F69]" />
                <p className="text-sm font-medium text-[#353535]">
                  {selectedFile
                    ? selectedFile.name
                    : "Drag and drop invoice/receipt here, or click to browse"}
                </p>
                <p className="mt-1 text-xs text-[#756F69]">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB · ${
                        selectedFile.type || "unknown"
                      }`
                    : "JPG, PNG, or PDF up to 10 MB"}
                </p>
                <label className="mt-3 cursor-pointer rounded-xl border border-[#D5CFC4] bg-white px-4 py-2 text-xs font-semibold text-[#353535] hover:bg-[#E3DFD6]/40">
                  Browse File
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    onChange={(e) =>
                      handleSelectFile(e.target.files?.[0] ?? null)
                    }
                    className="sr-only"
                  />
                </label>

                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Selected preview"
                    className="mt-4 max-h-40 rounded-xl border border-[#D5CFC4] object-contain"
                  />
                )}
              </div>

              <div className="flex flex-col justify-between space-y-4 rounded-2xl border border-[#E3DFD6] bg-[#E3DFD6]/20 p-4">
                <div className="space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#353535]">
                    Document Type
                  </label>
                  {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((key) => (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-sm ${
                        documentType === key
                          ? "border-[#F0B03B] bg-[#F0B03B]/20 font-semibold text-[#353535]"
                          : "border-[#D5CFC4] bg-white text-[#756F69]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="documentType"
                        value={key}
                        checked={documentType === key}
                        onChange={() => setDocumentType(key)}
                      />
                      <span>{DOC_TYPE_LABELS[key]}</span>
                    </label>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!selectedFile || uploadStage !== "IDLE"}
                  className="w-full rounded-xl bg-[#F0B03B] py-3 text-sm font-bold text-[#353535] shadow-sm hover:bg-[#DDA02D] disabled:opacity-50"
                >
                  {uploadStage === "UPLOADING"
                    ? "Uploading Securely..."
                    : uploadStage === "ANALYZING"
                    ? "Extracting with Gemini..."
                    : "Process Document"}
                </button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Documents History Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Document History ({docs.length})</CardTitle>
            <CardDescription>
              Review extracted invoices or retry failed analyses
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by document type"
              className="rounded-xl border border-[#D5CFC4] px-3 py-1.5 text-xs"
            >
              <option value="ALL">All Types</option>
              <option value="PURCHASE_INVOICE">Purchase Invoice</option>
              <option value="SALES_RECEIPT">Sales Receipt</option>
              <option value="CUSTOMER_ORDER">Customer Order</option>
              <option value="EXPENSE_RECEIPT">Expense Receipt</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="rounded-xl border border-[#D5CFC4] px-3 py-1.5 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="REVIEW_REQUIRED">Review Required</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="FAILED">Failed</option>
              <option value="DUPLICATE">Duplicate</option>
              <option value="UPLOADED">Uploaded</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {docs.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#756F69]">
              {loading
                ? "Loading documents..."
                : "No documents uploaded yet."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E3DFD6] text-xs font-semibold uppercase tracking-wider text-[#756F69]">
                  <th className="pb-3 pr-4">File Name</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Party</th>
                  <th className="pb-3 pr-4">Uploaded</th>
                  <th className="pb-3 pr-4 text-right">Total</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3DFD6]/70">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#E3DFD6]/20">
                    <td className="py-3 pr-4 font-medium text-[#353535]">
                      {doc.fileName}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#756F69]">
                      {DOC_TYPE_LABELS[doc.documentType]}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#353535]">
                      {doc.supplierName ?? doc.customerName ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#756F69]">
                      {new Date(doc.uploadedAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                      {doc.extractedTotalAmount !== null
                        ? formatInr(doc.extractedTotalAmount)
                        : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={
                          doc.processingStatus === "CONFIRMED"
                            ? "success"
                            : doc.processingStatus === "FAILED"
                            ? "alert"
                            : doc.processingStatus === "DUPLICATE" ||
                              doc.processingStatus === "REVIEW_REQUIRED"
                            ? "amber"
                            : "info"
                        }
                      >
                        {doc.processingStatus}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {doc.processingStatus === "FAILED" && (
                          <button
                            type="button"
                            onClick={() => void handleRetry(doc.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#D5CFC4] px-2.5 py-1 text-xs font-medium text-[#353535] hover:bg-[#E3DFD6]/40"
                          >
                            <RefreshCw className="h-3 w-3" /> Retry
                          </button>
                        )}
                        <Link
                          href={`/documents/${doc.id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#F0B03B] px-3 py-1 text-xs font-semibold text-[#353535] hover:bg-[#DDA02D]"
                        >
                          <Eye className="h-3 w-3" />
                          {doc.processingStatus === "CONFIRMED"
                            ? "View"
                            : "Review"}
                        </Link>
                      </div>
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
