import { Users } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export default function CustomersPage() {
  return (
    <ModulePlaceholder
      title="Customers & Khata"
      description="Manage customer and supplier profiles, credit balances (Udhaar), and debit/credit ledger entries."
      phase="Phase 2"
      icon={<Users className="h-5 w-5" />}
      plannedCapabilities={[
        "Customer and Supplier directory with phone lookup and business scoping.",
        "Consistent DEBIT / CREDIT LedgerEntry tracking for customer Udhaar and supplier dues.",
        "Record Udhaar repayments linked directly to transactions and payment methods.",
        "Query outstanding customer dues via UI or future voice commands.",
      ]}
      architectureNote="Backed by Customer, Supplier, Payment, and LedgerEntry models with businessId isolation and indexed phone/name lookups."
    />
  );
}
