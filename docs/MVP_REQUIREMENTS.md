# BizSaathi MVP Requirements

## 1. Target User
Small Indian retailers, kirana store owners, and independent shopkeepers who need simple, trustworthy bookkeeping in English, Hindi, or Hinglish.

## 2. Expected MVP Capabilities (Phases 1–5)
- **Unified Business Ledger:** Track inventory, purchases, sales, expenses, and customer Udhaar in one PostgreSQL database.
- **AI Document Intelligence:** Upload supplier invoices, sales receipts, customer orders, and expense bills; review Gemini-extracted line items; confirm before updating stock or Khata.
- **Multilingual Voice Assistant:** Speak in Hindi, English, or Hinglish (with text fallback) to record sales, check stock, or query customer dues—always with a confirmation step.
- **Actionable Dashboard:** Daily sales, purchases, outstanding Udhaar, low-stock alerts, and recent transactions.

## 3. Explicitly Excluded from Initial Prototype / Phase 1
- Full authentication / OAuth / RBAC flows (schema is prepared via `User` and `Business`).
- Payment gateway integrations (UPI/card checkout).
- Cloud object storage provisioning (local private storage abstraction is planned for Phase 3).
- GST e-invoicing, multi-branch warehouse transfers, or barcode hardware drivers.
- Direct autonomous AI database writes without user confirmation.
