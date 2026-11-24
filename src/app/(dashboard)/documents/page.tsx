import { FileText } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export default function DocumentsPage() {
  return (
    <ModulePlaceholder
      title="Documents"
      description="Upload supplier purchase invoices, sales receipts, customer orders, and expense bills for AI extraction."
      phase="Phase 3"
      icon={<FileText className="h-5 w-5" />}
      plannedCapabilities={[
        "Private upload handling for JPG, JPEG, PNG, and PDF documents.",
        "Gemini multimodal extraction into strict Zod-validated JSON payloads.",
        "Automatic product alias matching with a side-by-side review & confirmation UI.",
        "Audit-linked posting through transactionService only after user confirmation.",
      ]}
      architectureNote="Backed by the Document model (storageKey, processingStatus, extractedData) and server-only documentService + Gemini integration. Binary files are never stored in PostgreSQL or exposed publicly."
    />
  );
}
