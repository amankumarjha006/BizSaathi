import type { PrismaClient } from "@/generated/prisma/client";
import { requirePrisma } from "@/server/utils/business-context";
import { decimalToNumber } from "@/server/utils/decimal";

export type MatchClassification =
  | "EXACT_MATCH"
  | "POSSIBLE_MATCH"
  | "NO_MATCH";

export interface CatalogProductCandidate {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  aliases: string[];
}

export interface ProductMatchSuggestion {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  score: number;
  matchReason: string;
}

export interface ProductMatchResult {
  matchStatus: MatchClassification;
  matchedProductId: string | null;
  suggestions: ProductMatchSuggestion[];
}

const UNIT_ALIASES: Record<string, string> = {
  packet: "pkt",
  packets: "pkt",
  pkt: "pkt",
  pkts: "pkt",
  pack: "pkt",
  piece: "pcs",
  pieces: "pcs",
  pc: "pcs",
  pcs: "pcs",
  unit: "pcs",
  units: "pcs",
  kilogram: "kg",
  kilograms: "kg",
  kgs: "kg",
  kg: "kg",
  gram: "g",
  grams: "g",
  gm: "g",
  gms: "g",
  g: "g",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  ltr: "l",
  l: "l",
  ml: "ml",
  millilitre: "ml",
  milliliter: "ml",
  bag: "bag",
  bags: "bag",
  box: "box",
  boxes: "box",
  bottle: "btl",
  bottles: "btl",
  btl: "btl",
};

export function normalizeUnit(unit?: string | null): string {
  if (!unit) return "pcs";
  const cleaned = unit.trim().toLowerCase();
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

/**
 * Extracts explicit package-size tokens (e.g. "500ml", "1l", "5kg", "250g")
 * so products with different package sizes are never silently equated.
 */
export function extractPackageSizeTokens(input: string): string[] {
  const normalized = input
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(ml|l|ltr|litre|litres|liter|liters|kg|kgs|g|gm|gms)\b/g, "$1$2");

  const matches = normalized.match(/\b\d+(?:\.\d+)?(?:ml|l|ltr|litre|litres|liter|liters|kg|kgs|g|gm|gms)\b/g);
  if (!matches) return [];

  return matches.map((token) => {
    const m = token.match(/^(\d+(?:\.\d+)?)(.+)$/);
    if (!m) return token;
    const num = m[1];
    const unit = normalizeUnit(m[2]);
    return `${num}${unit}`;
  });
}

export function normalizeProductText(input: string): string {
  return input
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(ml|l|ltr|litre|litres|liter|liters|kg|kgs|g|gm|gms)\b/g, (_, num, u) => `${num}${normalizeUnit(u)}`)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

function hasIncompatiblePackageSizes(sourceName: string, candidateName: string): boolean {
  const srcSizes = extractPackageSizeTokens(sourceName);
  const candSizes = extractPackageSizeTokens(candidateName);
  if (srcSizes.length === 0 || candSizes.length === 0) {
    return false;
  }
  return srcSizes.join(",") !== candSizes.join(",");
}

/**
 * Matches an extracted line item against an explicit list of catalogue products.
 * Order:
 *   1. Exact SKU/barcode match
 *   2. Normalized exact product name match
 *   3. Existing ProductAlias match
 *   4. Fuzzy token matching (guarding incompatible package sizes)
 *   5. No match
 */
export function matchProductAgainstCatalog(
  input: { sourceProductName: string; sku?: string | null },
  catalog: CatalogProductCandidate[]
): ProductMatchResult {
  const toSuggestion = (
    p: CatalogProductCandidate,
    score: number,
    matchReason: string
  ): ProductMatchSuggestion => ({
    productId: p.id,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
    purchasePrice: p.purchasePrice,
    sellingPrice: p.sellingPrice,
    currentStock: p.currentStock,
    score: Number(score.toFixed(2)),
    matchReason,
  });

  // 1. Exact SKU match
  if (input.sku && input.sku.trim().length > 0) {
    const normalizedSku = input.sku.trim().toLowerCase();
    const skuMatch = catalog.find(
      (p) => p.sku && p.sku.trim().toLowerCase() === normalizedSku
    );
    if (skuMatch) {
      return {
        matchStatus: "EXACT_MATCH",
        matchedProductId: skuMatch.id,
        suggestions: [toSuggestion(skuMatch, 1, "Exact SKU match")],
      };
    }
  }

  const normSource = normalizeProductText(input.sourceProductName);

  // 2. Normalized exact product-name match
  const exactNameMatch = catalog.find(
    (p) => normalizeProductText(p.name) === normSource
  );
  if (exactNameMatch) {
    return {
      matchStatus: "EXACT_MATCH",
      matchedProductId: exactNameMatch.id,
      suggestions: [toSuggestion(exactNameMatch, 1, "Exact normalized name match")],
    };
  }

  // 3. Existing ProductAlias match
  const aliasMatch = catalog.find((p) =>
    p.aliases.some((alias) => normalizeProductText(alias) === normSource)
  );
  if (aliasMatch) {
    return {
      matchStatus: "EXACT_MATCH",
      matchedProductId: aliasMatch.id,
      suggestions: [toSuggestion(aliasMatch, 0.98, "Saved product alias match")],
    };
  }

  // 4. Fuzzy token matching (blocking incompatible package sizes from auto/possible match)
  const scored: ProductMatchSuggestion[] = [];
  for (const p of catalog) {
    if (hasIncompatiblePackageSizes(input.sourceProductName, p.name)) {
      continue;
    }

    const normCandidate = normalizeProductText(p.name);
    let score = tokenOverlapScore(normSource, normCandidate);

    for (const alias of p.aliases) {
      if (!hasIncompatiblePackageSizes(input.sourceProductName, alias)) {
        score = Math.max(score, tokenOverlapScore(normSource, normalizeProductText(alias)));
      }
    }

    if (score >= 0.45) {
      scored.push(
        toSuggestion(
          p,
          score,
          score >= 0.75 ? "Strong name similarity (verify)" : "Partial name similarity"
        )
      );
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topSuggestions = scored.slice(0, 3);

  if (topSuggestions.length > 0) {
    return {
      matchStatus: "POSSIBLE_MATCH",
      matchedProductId: null,
      suggestions: topSuggestions,
    };
  }

  return {
    matchStatus: "NO_MATCH",
    matchedProductId: null,
    suggestions: [],
  };
}

export const productMatchingService = {
  async loadCatalog(
    businessId: string,
    db?: PrismaClient
  ): Promise<CatalogProductCandidate[]> {
    const prisma = db ?? requirePrisma();
    const products = await prisma.product.findMany({
      where: { businessId, isActive: true },
      include: { aliases: { select: { alias: true } } },
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      purchasePrice: decimalToNumber(p.purchasePrice),
      sellingPrice: decimalToNumber(p.sellingPrice),
      currentStock: decimalToNumber(p.currentStock),
      aliases: p.aliases.map((a) => a.alias),
    }));
  },

  async matchItems(
    businessId: string,
    items: Array<{ sourceProductName: string; sku?: string | null }>,
    db?: PrismaClient
  ): Promise<ProductMatchResult[]> {
    const catalog = await productMatchingService.loadCatalog(businessId, db);
    return items.map((item) => matchProductAgainstCatalog(item, catalog));
  },
};
