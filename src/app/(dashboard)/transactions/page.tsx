import { ArrowLeftRight } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export default function TransactionsPage() {
  return (
    <ModulePlaceholder
      title="Transactions"
      description="Track all confirmed purchases, sales, customer orders, expenses, returns, and payment settlements."
      phase="Phase 2"
      icon={<ArrowLeftRight className="h-5 w-5" />}
      plannedCapabilities={[
        "Record manual sales, supplier purchases, customer orders, expenses, and returns.",
        "Preserve TransactionItem productNameSnapshot even when an item is unmatched.",
        "Track partial and full payments across Cash, UPI, Bank Transfer, and Other.",
        "Enforce non-destructive auditability (no hard deletion of completed financial records).",
      ]}
      architectureNote="Backed by Transaction, TransactionItem, Payment, and LedgerEntry models. Every manual, document, and voice transaction flows through transactionService."
    />
  );
}
