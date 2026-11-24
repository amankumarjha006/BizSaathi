"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  DocumentReviewWorkspace,
  type DocumentDetailModel,
} from "@/components/documents/DocumentReviewWorkspace";
import { apiFetch } from "@/lib/api-client";

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

function DocumentDetailContent() {
  const params = useParams<{ id: string }>();
  const documentId = params.id;

  const [doc, setDoc] = useState<DocumentDetailModel | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const [docData, prodData, supData, custData] = await Promise.all([
        apiFetch<DocumentDetailModel>(`/api/documents/${documentId}`),
        apiFetch<CatalogProduct[]>("/api/products"),
        apiFetch<PartyOption[]>("/api/suppliers"),
        apiFetch<PartyOption[]>("/api/customers"),
      ]);
      setDoc(docData);
      setProducts(prodData);
      setSuppliers(supData);
      setCustomers(custData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(id);
  }, [loadAll]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D5CFC4] bg-white px-3 py-2 text-xs font-semibold text-[#353535] hover:bg-[#E3DFD6]/40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Documents
          </Link>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#353535]" />
            <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[#353535]">
              Document Review
            </h1>
          </div>
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

      {loading && !doc ? (
        <div className="rounded-2xl border border-[#D5CFC4] bg-white p-10 text-center text-sm text-[#756F69]">
          Loading document review workspace...
        </div>
      ) : doc ? (
        <DocumentReviewWorkspace
          key={doc.id + doc.processingStatus + (doc.processedAt ?? "")}
          document={doc}
          products={products}
          suppliers={suppliers}
          customers={customers}
          onRefresh={loadAll}
        />
      ) : null}
    </div>
  );
}

export default function DocumentDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[#D5CFC4] bg-white p-10 text-center text-sm text-[#756F69]">
          Loading document review workspace...
        </div>
      }
    >
      <DocumentDetailContent />
    </Suspense>
  );
}
