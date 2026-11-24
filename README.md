# BizSaathi

**Your Business. Your Language. Your Saathi.**

BizSaathi is an AI-powered, multilingual business management assistant designed for small Indian retailers, kirana stores, and independent shopkeepers.

---

## 1. Project Introduction

Small Indian retailers often run their daily operations on handwritten registers, paper supplier invoices, and manual calculations. BizSaathi unifies everyday bookkeeping into a single web application powered by **Document Intelligence** and **Multilingual Voice Operations** (Hindi, English, and Hinglish).

## 2. Product Vision

**Upload documents. Speak naturally. Let AI handle repetitive bookkeeping.**

Rather than acting as just another billing form, BizSaathi lowers the technical barrier for shopkeepers by letting them upload paper bills or speak naturally in their preferred language—while keeping all financial and inventory updates strictly validated, reviewable, and auditable.

## 3. Core Features (Planned Across Phases)

- **AI Document Intelligence (Phase 3):** Upload supplier purchase invoices, sales receipts, customer orders, and expense bills (JPG, PNG, PDF). Gemini extracts structured JSON, matches products via aliases, and awaits user confirmation.
- **Multilingual Voice Assistant (Phase 4):** Speak in Hindi, English, or Hinglish to record sales, check stock, query customer Udhaar, or log expenses—with text fallback and mandatory confirmation.
- **Unified Business Management (Phase 2 & 5):** Inventory tracking, purchase/sales recording, digital billing, customer Khata (Udhaar), payment tracking, and business reports.

## 4. Technology Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, Lucide React
- **Backend:** Node.js via Next.js Route Handlers (REST), Zod validation
- **Database:** PostgreSQL + Prisma 7 ORM (`@prisma/adapter-pg`)
- **AI:** Google Gemini API (`@google/genai`, server-side only)

## 5. Architecture Overview

```text
User Interface (Next.js App Router)
  └─> Next.js API Route Handlers (Node.js runtime, Zod validation)
        └─> Application Services (inventory, transaction, document, voice, analytics)
              └─> Prisma 7 ORM (@prisma/adapter-pg)
                    └─> PostgreSQL Database
```

All document and voice workflows funnel into the same validated backend services. AI modules never mutate database records directly. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## 6. Folder Structure

```text
bizsaathi/
├── docs/                        # Roadmap, architecture, DB design, MVP specs
│   └── design-system-reference/ # Preserved initial static design tokens reference
├── prisma/
│   ├── schema.prisma            # PostgreSQL schema (12 core entities)
│   └── seed.ts                  # Demo business seed script
├── prisma7.config.ts            # Prisma 7 CLI configuration
├── src/
│   ├── app/
│   │   ├── (dashboard)/         # Dashboard shell + 8 module routes
│   │   ├── api/health/          # GET /api/health endpoint
│   │   ├── globals.css          # Tailwind v4 + BizSaathi colour tokens
│   │   ├── layout.tsx           # Root layout (Inter + Plus Jakarta Sans)
│   │   └── page.tsx             # Redirects to /dashboard
│   ├── components/
│   │   ├── layout/              # Sidebar, Topbar, DashboardShell
│   │   └── ui/                  # Card, Badge, ModulePlaceholder
│   ├── constants/               # Navigation & language options
│   ├── generated/prisma/        # Generated Prisma 7 Client
│   ├── lib/                     # Shared client utilities (cn)
│   └── server/
│       ├── ai/                  # Server-only Gemini client factory
│       ├── db/                  # Prisma singleton & DB health check
│       ├── services/            # Service layer placeholders
│       ├── utils/               # Typed AppError & API response helpers
│       └── validations/         # Zod schemas
├── .env.example                 # Environment variable placeholders
└── package.json
```

## 7. Database Overview

The PostgreSQL schema includes 12 core models:
`User`, `Business`, `Product`, `ProductAlias`, `Customer`, `Supplier`, `Document`, `Transaction`, `TransactionItem`, `StockMovement`, `Payment`, and `LedgerEntry`.

See [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) for entity relationships and inventory/transaction rules.

## 8. Environment Variables

Copy `.env.example` to `.env` and fill in your local values:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/bizsaathi
GEMINI_API_KEY=your_gemini_api_key
APP_URL=http://localhost:3000
AUTH_SECRET=your_random_secret
```

> **Security:** Never commit `.env` or expose `GEMINI_API_KEY` to client components.

## 9. Local Installation Instructions

```bash
npm install
```

## 10. PostgreSQL Setup

1. Ensure PostgreSQL is running locally (or provide a hosted PostgreSQL connection string).
2. Create a database named `bizsaathi`.
3. Set `DATABASE_URL` in `.env`.

## 11. Prisma Migration & Seed Instructions

```bash
# Validate schema
npm run db:validate

# Generate Prisma Client
npm run db:generate

# Run initial migration (requires configured DATABASE_URL)
npm run db:migrate

# Optional: seed demo business
npm run db:seed
```

## 12. Running the Development Server

```bash
npm run dev
```

Open `http://localhost:3000` (redirects to `/dashboard`) and verify `GET http://localhost:3000/api/health`.

## 13. Testing and Build Commands

```bash
npm run typecheck   # TypeScript strict check
npm run lint        # ESLint
npm run build       # Production Next.js build
```

## 14. Development Phase Roadmap

See [docs/PROJECT_ROADMAP.md](docs/PROJECT_ROADMAP.md) for Phases 1–7.

## 15. Current Implementation Status

- **Completed (Phase 1 Foundation):**
  - Next.js App Router + TypeScript + Tailwind CSS v4 setup
  - Official BizSaathi colour system (`#E3DFD6`, `#353535`, `#FFFFFF`, `#F0B03B`) and typography (`Inter`, `Plus Jakarta Sans`)
  - Responsive dashboard shell with all 8 navigable routes (`/dashboard`, `/inventory`, `/documents`, `/voice`, `/transactions`, `/customers`, `/reports`, `/settings`)
  - Prisma 7 PostgreSQL schema (12 models) + generated client + seed script
  - Thin backend foundation (`GET /api/health`, Zod validations, error handling, server-only Gemini client, service layer placeholders)
  - Project documentation (`README.md` + `docs/*`)
- **Pending (Future Phases & Local Env):**
  - Live `.env` credentials & running `prisma migrate dev` against PostgreSQL
  - Phase 2–5 business logic implementation
