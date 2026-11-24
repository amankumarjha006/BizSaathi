import { createHash } from "node:crypto";
import path from "node:path";
import { ValidationError } from "@/server/utils/errors";

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const DEFAULT_MAX_PDF_PAGES = 10;

export type AllowedMimeType = "image/jpeg" | "image/png" | "application/pdf";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".pdf"]);
const ALLOWED_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

export function getMaxDocumentSizeBytes(): number {
  const raw = Number(process.env.MAX_DOCUMENT_SIZE_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_BYTES;
}

export function getMaxPdfPages(): number {
  const raw = Number(process.env.MAX_PDF_PAGES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_PDF_PAGES;
}

function matchesJpegSignature(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function matchesPngSignature(buf: Buffer): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < sig.length) return false;
  return sig.every((byte, idx) => buf[idx] === byte);
}

function matchesPdfSignature(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  const head = buf.subarray(0, Math.min(buf.length, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

/**
 * Estimates PDF page count from standard /Type /Page objects and /Pages /Count metadata,
 * and checks basic structural readability without executing any embedded scripts.
 */
export function inspectPdfBuffer(buf: Buffer): { pageCount: number } {
  const text = buf.toString("latin1");
  if (!text.includes("%PDF-")) {
    throw new ValidationError("Uploaded PDF is malformed or unreadable.");
  }

  const pageMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  const countMatches = [...text.matchAll(/\/Type\s*\/Pages[\s\S]{0,300}?\/Count\s+(\d+)/g)].map(
    (m) => Number(m[1])
  );
  const maxDeclaredCount =
    countMatches.length > 0 ? Math.max(...countMatches) : 0;

  const pageCount = Math.max(pageMatches?.length ?? 0, maxDeclaredCount);
  if (pageCount <= 0) {
    throw new ValidationError(
      "Uploaded PDF appears empty or unreadable (no pages detected)."
    );
  }

  const maxPages = getMaxPdfPages();
  if (pageCount > maxPages) {
    throw new ValidationError(
      `PDF has ${pageCount} pages, which exceeds the ${maxPages}-page limit.`
    );
  }

  return { pageCount };
}

export interface ValidatedUploadResult {
  safeExtension: "jpg" | "png" | "pdf";
  verifiedMimeType: AllowedMimeType;
  fileSize: number;
  checksumSha256: string;
  pdfPageCount: number | null;
}

/**
 * Validates file extension, declared MIME type, file size, actual magic-byte signature,
 * and PDF page count. Never trusts client-supplied filenames or MIME headers alone.
 */
export function validateUploadedDocument(params: {
  fileName: string;
  declaredMimeType: string;
  buffer: Buffer;
}): ValidatedUploadResult {
  const { fileName, declaredMimeType, buffer } = params;
  const maxBytes = getMaxDocumentSizeBytes();

  if (!buffer || buffer.length === 0) {
    throw new ValidationError("Uploaded file is empty.");
  }

  if (buffer.length > maxBytes) {
    const limitMb = (maxBytes / (1024 * 1024)).toFixed(1);
    throw new ValidationError(
      `File exceeds maximum allowed size of ${limitMb} MB.`
    );
  }

  const ext = path.extname(fileName || "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new ValidationError(
      "Unsupported file extension. Allowed formats: JPG, JPEG, PNG, PDF."
    );
  }

  const normalizedMime = declaredMimeType.toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new ValidationError(
      "Unsupported file MIME type. Allowed types: image/jpeg, image/png, application/pdf."
    );
  }

  let verifiedMimeType: AllowedMimeType;
  let safeExtension: "jpg" | "png" | "pdf";
  let pdfPageCount: number | null = null;

  if (matchesJpegSignature(buffer)) {
    verifiedMimeType = "image/jpeg";
    safeExtension = "jpg";
  } else if (matchesPngSignature(buffer)) {
    verifiedMimeType = "image/png";
    safeExtension = "png";
  } else if (matchesPdfSignature(buffer)) {
    verifiedMimeType = "application/pdf";
    safeExtension = "pdf";
    pdfPageCount = inspectPdfBuffer(buffer).pageCount;
  } else {
    throw new ValidationError(
      "File content does not match a valid JPG, PNG, or PDF signature."
    );
  }

  if (verifiedMimeType !== normalizedMime) {
    throw new ValidationError(
      `File signature (${verifiedMimeType}) does not match declared file type (${normalizedMime}).`
    );
  }

  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");

  return {
    safeExtension,
    verifiedMimeType,
    fileSize: buffer.length,
    checksumSha256,
    pdfPageCount,
  };
}
