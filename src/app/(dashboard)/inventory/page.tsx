import { Package } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export default function InventoryPage() {
  return (
    <ModulePlaceholder
      title="Inventory"
      description="Manage products, purchase/selling prices, low-stock thresholds, aliases, and stock movement history."
      phase="Phase 2"
      icon={<Package className="h-5 w-5" />}
      plannedCapabilities={[
        "Create, edit, and search products with SKU, unit, purchase price, and selling price.",
        "Maintain ProductAlias mappings for matching invoice line items to existing inventory.",
        "View immutable StockMovement audit history (PURCHASE_IN, SALE_OUT, RETURN_IN, ADJUSTMENT).",
        "Monitor low-stock alerts when currentStock falls below minimumStock.",
      ]}
      architectureNote="Backed by Product, ProductAlias, and StockMovement models in Prisma. Stock changes are always executed inside database transactions via inventoryService and transactionService."
    />
  );
}
