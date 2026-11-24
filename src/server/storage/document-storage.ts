import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ValidationError } from "@/server/utils/errors";

export interface DocumentStorageProvider {
  save(
    businessId: string,
    buffer: Buffer,
    extension: string
  ): Promise<{ storageKey: string }>;
  read(storageKey: string): Promise<Buffer>;
  exists(storageKey: string): Promise<boolean>;
  delete(storageKey: string): Promise<void>;
}

const DEFAULT_STORAGE_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "documents"
);

function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Local private disk storage for development.
 * Keeps files outside /public and enforces strict path-traversal protection.
 * Can be swapped for private object storage (S3/GCS) via DocumentStorageProvider.
 */
export class LocalPrivateDocumentStorage implements DocumentStorageProvider {
  private readonly rootDir: string;

  constructor(rootDir = DEFAULT_STORAGE_ROOT) {
    this.rootDir = path.resolve(/*turbopackIgnore: true*/ rootDir);
  }

  private resolveSafePath(storageKey: string): string {
    if (!storageKey || storageKey.includes("..") || path.isAbsolute(storageKey)) {
      throw new ValidationError("Invalid document storage key.");
    }
    const resolved = path.resolve(/*turbopackIgnore: true*/ this.rootDir, storageKey);
    if (!resolved.startsWith(this.rootDir + path.sep)) {
      throw new ValidationError("Document storage path traversal blocked.");
    }
    return resolved;
  }

  async save(
    businessId: string,
    buffer: Buffer,
    extension: string
  ): Promise<{ storageKey: string }> {
    const safeBiz = sanitizeSegment(businessId);
    const safeExt = sanitizeSegment(extension).toLowerCase();
    const generatedName = `${Date.now()}-${randomUUID()}.${safeExt}`;
    const storageKey = path.posix.join(safeBiz, generatedName);
    const fullPath = this.resolveSafePath(storageKey);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    return { storageKey };
  }

  async read(storageKey: string): Promise<Buffer> {
    const fullPath = this.resolveSafePath(storageKey);
    return fs.readFile(fullPath);
  }

  async exists(storageKey: string): Promise<boolean> {
    const fullPath = this.resolveSafePath(storageKey);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = this.resolveSafePath(storageKey);
    await fs.rm(fullPath, { force: true });
  }
}

export const documentStorage: DocumentStorageProvider =
  new LocalPrivateDocumentStorage();
