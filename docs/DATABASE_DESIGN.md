# BizSaathi Database Design

Database: **PostgreSQL** managed via **Prisma 7 ORM** (`prisma/schema.prisma`).

## 1. Entities & Relationships

- **User (`User`):** Owner account (`id`, `name`, `email`). Prepared for future auth.
- **Business (`Business`):** Tenant root (`ownerId`, `businessType`, `preferredLanguage`). Every business-owned record carries `businessId`.
- **Product (`Product`):** Catalog item with `Decimal(12, 2)` prices and `Decimal(12, 3)` stock quantities (`currentStock`, `minimumStock`) to support fractional units (kg, litre, etc.).
- **ProductAlias (`ProductAlias`):** Normalized alias strings (`unique(businessId, normalizedAlias)`) to match messy invoice/voice product names to catalog products.
- **Customer (`Customer`) & Supplier (`Supplier`):** Counterparties for sales, Udhaar, and purchases.
- **Document (`Document`):** Metadata and audit trail for uploaded files (`documentType`, `storageKey`, `processingStatus`, `extractedData` JSON). Binary files are stored privately outside PostgreSQL.
- **Transaction (`Transaction`):** Unified financial record (`PURCHASE`, `SALE`, `CUSTOMER_ORDER`, `EXPENSE`, `RETURN`) with `totalAmount`, `paidAmount`, `paymentStatus`, and `status`.
- **TransactionItem (`TransactionItem`):** Line items with optional `productId` and mandatory `productNameSnapshot` so original descriptions are preserved even if matching fails.
- **StockMovement (`StockMovement`):** Immutable inventory audit log (`PURCHASE_IN`, `SALE_OUT`, `RETURN_IN`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`).
- **Payment (`Payment`):** Individual payment settlements (`CASH`, `UPI`, `BANK_TRANSFER`, `OTHER`).
- **LedgerEntry (`LedgerEntry`):** `DEBIT` / `CREDIT` entries linked to `Customer` or `Supplier` and `Transaction` for consistent Khata balance tracking.

## 2. Critical Inventory & Transaction Rules

1. **Supplier Purchase Invoice (`PURCHASE`):** Increases inventory (`PURCHASE_IN`) **only after user confirmation**.
2. **Confirmed Customer Sale (`SALE`):** Decreases inventory (`SALE_OUT`) atomically inside a Prisma `$transaction`, preventing negative stock unless explicitly authorized.
3. **Customer Order (`CUSTOMER_ORDER`):** Creates an order record and **does not** automatically decrease available stock unless explicitly fulfilled in a later phase.
4. **Expense Receipt (`EXPENSE`):** Records a business expense and **does not** affect inventory stock.
5. **Sales Receipt (`SALES_RECEIPT`):** Must never be treated as a supplier purchase invoice.
6. **Auditability:** Completed financial transactions must never be hard-deleted.
