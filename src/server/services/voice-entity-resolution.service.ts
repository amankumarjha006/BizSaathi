import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import { decimalToNumber } from "@/server/utils/decimal";
import {
  extractPackageSizeTokens,
  matchProductAgainstCatalog,
  normalizeProductText,
  productMatchingService,
} from "./product-matching.service";
import type { ResolvedCandidate } from "@/server/ai/voice-schemas";

const HINDI_RETAIL_SYNONYMS: Record<string, string> = {
  doodh: "milk",
  dudh: "milk",
  cheeni: "sugar",
  chini: "sugar",
  namak: "salt",
  tel: "oil",
  chawal: "rice",
  aata: "atta",
  chai: "tea",
  sabun: "soap",
  roti: "bread",
  biscuit: "biscuits",
};

function expandHindiSynonyms(query: string): string {
  const words = normalizeProductText(query).split(" ").filter(Boolean);
  return words.map((w) => HINDI_RETAIL_SYNONYMS[w] ?? w).join(" ");
}

export interface ProductResolutionResult {
  status: "EXACT" | "AMBIGUOUS" | "NOT_FOUND";
  resolvedProduct: {
    id: string;
    name: string;
    unit: string;
    purchasePrice: number;
    sellingPrice: number;
    currentStock: number;
  } | null;
  candidates: ResolvedCandidate[];
}

export interface PartyResolutionResult {
  status: "EXACT" | "AMBIGUOUS" | "NOT_FOUND";
  resolvedParty: { id: string; name: string; phone: string | null } | null;
  candidates: ResolvedCandidate[];
}

export const voiceEntityResolutionService = {
  async resolveProduct(
    businessId: string,
    queryName: string,
    db?: PrismaClient
  ): Promise<ProductResolutionResult> {
    const catalog = await productMatchingService.loadCatalog(businessId, db);
    const expandedQuery = expandHindiSynonyms(queryName);

    // 1. Try exact/alias match first
    const direct = matchProductAgainstCatalog(
      { sourceProductName: queryName },
      catalog
    );
    if (direct.matchStatus === "EXACT_MATCH" && direct.matchedProductId) {
      const p = catalog.find((c) => c.id === direct.matchedProductId)!;
      return {
        status: "EXACT",
        resolvedProduct: {
          id: p.id,
          name: p.name,
          unit: p.unit,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          currentStock: p.currentStock,
        },
        candidates: [
          {
            id: p.id,
            name: p.name,
            detail: `Stock: ${p.currentStock} ${p.unit} · ₹${p.sellingPrice}`,
            score: 1,
          },
        ],
      };
    }

    // 2. Try synonym-expanded exact match
    if (expandedQuery !== normalizeProductText(queryName)) {
      const synMatch = matchProductAgainstCatalog(
        { sourceProductName: expandedQuery },
        catalog
      );
      if (synMatch.matchStatus === "EXACT_MATCH" && synMatch.matchedProductId) {
        const p = catalog.find((c) => c.id === synMatch.matchedProductId)!;
        return {
          status: "EXACT",
          resolvedProduct: {
            id: p.id,
            name: p.name,
            unit: p.unit,
            purchasePrice: p.purchasePrice,
            sellingPrice: p.sellingPrice,
            currentStock: p.currentStock,
          },
          candidates: [
            {
              id: p.id,
              name: p.name,
              detail: `Stock: ${p.currentStock} ${p.unit} · ₹${p.sellingPrice}`,
              score: 0.98,
            },
          ],
        };
      }
    }

    // 3. Substring / token match across catalog (e.g. "Bread" -> "Britannia Whole Wheat Bread")
    const queryTokens = expandedQuery.split(" ").filter(Boolean);
    const querySizes = extractPackageSizeTokens(expandedQuery);

    const matched: Array<{
      product: (typeof catalog)[number];
      score: number;
    }> = [];

    for (const p of catalog) {
      const normName = normalizeProductText(p.name);
      const nameSizes = extractPackageSizeTokens(p.name);
      if (
        querySizes.length > 0 &&
        nameSizes.length > 0 &&
        querySizes.join(",") !== nameSizes.join(",")
      ) {
        continue;
      }

      if (normName.includes(expandedQuery)) {
        matched.push({ product: p, score: 0.9 });
        continue;
      }

      const nameTokens = new Set(normName.split(" ").filter(Boolean));
      const hits = queryTokens.filter((t) => nameTokens.has(t)).length;
      if (hits > 0) {
        const score = hits / Math.max(queryTokens.length, 1);
        if (score >= 0.5) {
          matched.push({ product: p, score: Number((score * 0.85).toFixed(2)) });
        }
      }
    }

    matched.sort((a, b) => b.score - a.score);

    if (matched.length === 1) {
      const p = matched[0].product;
      return {
        status: "EXACT",
        resolvedProduct: {
          id: p.id,
          name: p.name,
          unit: p.unit,
          purchasePrice: p.purchasePrice,
          sellingPrice: p.sellingPrice,
          currentStock: p.currentStock,
        },
        candidates: [
          {
            id: p.id,
            name: p.name,
            detail: `Stock: ${p.currentStock} ${p.unit} · ₹${p.sellingPrice}`,
            score: matched[0].score,
          },
        ],
      };
    }

    if (matched.length > 1) {
      return {
        status: "AMBIGUOUS",
        resolvedProduct: null,
        candidates: matched.slice(0, 5).map((m) => ({
          id: m.product.id,
          name: m.product.name,
          detail: `Stock: ${m.product.currentStock} ${m.product.unit} · ₹${m.product.sellingPrice}`,
          score: m.score,
        })),
      };
    }

    return {
      status: "NOT_FOUND",
      resolvedProduct: null,
      candidates: [],
    };
  },

  async resolveCustomer(
    businessId: string,
    queryName: string,
    db?: PrismaClient
  ): Promise<PartyResolutionResult> {
    const prisma = db ?? requirePrisma();
    const customers = await prisma.customer.findMany({
      where: { businessId },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    });

    const normQuery = normalizeProductText(queryName);
    const exact = customers.filter(
      (c) => normalizeProductText(c.name) === normQuery
    );
    if (exact.length === 1) {
      return {
        status: "EXACT",
        resolvedParty: exact[0],
        candidates: [
          {
            id: exact[0].id,
            name: exact[0].name,
            detail: exact[0].phone ?? undefined,
            score: 1,
          },
        ],
      };
    }

    const partial = customers.filter((c) => {
      const norm = normalizeProductText(c.name);
      return norm.includes(normQuery) || normQuery.includes(norm);
    });

    if (partial.length === 1) {
      return {
        status: "EXACT",
        resolvedParty: partial[0],
        candidates: [
          {
            id: partial[0].id,
            name: partial[0].name,
            detail: partial[0].phone ?? undefined,
            score: 0.9,
          },
        ],
      };
    }

    if (partial.length > 1) {
      return {
        status: "AMBIGUOUS",
        resolvedParty: null,
        candidates: partial.slice(0, 5).map((c) => ({
          id: c.id,
          name: c.name,
          detail: c.phone ?? undefined,
          score: 0.8,
        })),
      };
    }

    return {
      status: "NOT_FOUND",
      resolvedParty: null,
      candidates: [],
    };
  },

  async resolveSupplier(
    businessId: string,
    queryName: string,
    db?: PrismaClient
  ): Promise<PartyResolutionResult> {
    const prisma = db ?? requirePrisma();
    const suppliers = await prisma.supplier.findMany({
      where: { businessId },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    });

    const normQuery = normalizeProductText(queryName);
    const exact = suppliers.filter(
      (s) => normalizeProductText(s.name) === normQuery
    );
    if (exact.length === 1) {
      return {
        status: "EXACT",
        resolvedParty: exact[0],
        candidates: [
          {
            id: exact[0].id,
            name: exact[0].name,
            detail: exact[0].phone ?? undefined,
            score: 1,
          },
        ],
      };
    }

    const partial = suppliers.filter((s) => {
      const norm = normalizeProductText(s.name);
      return norm.includes(normQuery) || normQuery.includes(norm);
    });

    if (partial.length === 1) {
      return {
        status: "EXACT",
        resolvedParty: partial[0],
        candidates: [
          {
            id: partial[0].id,
            name: partial[0].name,
            detail: partial[0].phone ?? undefined,
            score: 0.9,
          },
        ],
      };
    }

    if (partial.length > 1) {
      return {
        status: "AMBIGUOUS",
        resolvedParty: null,
        candidates: partial.slice(0, 5).map((s) => ({
          id: s.id,
          name: s.name,
          detail: s.phone ?? undefined,
          score: 0.8,
        })),
      };
    }

    return {
      status: "NOT_FOUND",
      resolvedParty: null,
      candidates: [],
    };
  },
};

export function toNumberSafe(v: unknown): number {
  if (typeof v === "number") return v;
  return decimalToNumber(String(v ?? 0));
}
