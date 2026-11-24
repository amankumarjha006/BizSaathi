# BizSaathi Architecture

## 1. High-Level Architecture

BizSaathi is a **single full-stack Next.js (App Router) application**. There is no separate Express, FastAPI, or standalone backend server.

```text
+-------------------------------------------------------+
|                Client (React / Tailwind)              |
|  Dashboard Shell, Forms, Review Modals, Voice Input   |
+---------------------------+---------------------------+
                            | HTTP / JSON (Zod-validated)
+---------------------------v---------------------------+
|       Next.js API Route Handlers (Node.js Runtime)    |
|  Thin controllers: parse, validate, delegate, respond |
+---------------------------+---------------------------+
                            |
+---------------------------v---------------------------+
|               Application Services Layer              |
|  inventory | transaction | document | voice | analytics|
+-------------+---------------------------+-------------+
              |                           |
+-------------v-------------+ +-----------v-------------+
|   Prisma 7 ORM + pg Pool  | |  Server-Only Gemini AI  |
|   Atomic $transactions    | |  Structured JSON Output |
+-------------+-------------+ +-------------------------+
              |
+-------------v-------------+
|    PostgreSQL Database    |
+---------------------------+
```

## 2. Layer Responsibilities

- **UI (`src/app`, `src/components`):** Presentation, responsive navigation, user review & confirmation flows. Never accesses the database or `GEMINI_API_KEY` directly.
- **API Route Handlers (`src/app/api/*`):** Run on `runtime = "nodejs"`. Validate inputs with Zod, invoke services, and format consistent JSON responses via `jsonOk` / `handleApiError`.
- **Services (`src/server/services/*`):** Encapsulate business rules, stock invariants, and multi-table Prisma `$transaction` boundaries.
- **AI Integration (`src/server/ai/*`):** Server-only `@google/genai` client. AI outputs are treated as untrusted proposals that must pass Zod validation and explicit user confirmation before any database mutation.

## 3. Unified Mutation Rule

Whether a sale or purchase originates from:
1. Manual UI entry,
2. An uploaded document (Phase 3), or
3. A voice command (Phase 4),

it must execute through `transactionService` so stock, payments, and ledger balances remain consistent.

## 4. Security Boundaries

- `GEMINI_API_KEY` and `DATABASE_URL` are strictly server-side.
- Uploaded documents will be stored in private storage (never public `public/` assets or PostgreSQL bytea columns).
- Completed financial transactions are never hard-deleted.
