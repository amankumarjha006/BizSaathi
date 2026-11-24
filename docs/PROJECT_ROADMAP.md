# BizSaathi Project Roadmap

BizSaathi is built incrementally across seven well-defined phases so that core data integrity and architecture remain clean at every stage.

## Phase 1: Foundation Setup (Current)
- Next.js App Router + TypeScript + Tailwind CSS initialization
- Node.js Route Handler backend foundation with Zod validation and centralized error handling
- PostgreSQL + Prisma 7 schema (`12` core entities) and client generation
- Official BizSaathi design system (`#E3DFD6`, `#353535`, `#FFFFFF`, `#F0B03B`)
- Responsive dashboard shell and 8 navigable module routes
- `GET /api/health` endpoint with honest database connectivity reporting
- Architecture, database, and MVP documentation

## Phase 2: Core Business Management
- Product CRUD and `ProductAlias` management
- Inventory tracking and `StockMovement` history
- Manual purchase, sale, customer order, and expense recording via `transactionService`
- Customer & Supplier management and Digital Khata (`LedgerEntry` + `Payment`)

## Phase 3: AI Document Intelligence
- Private file upload pipeline for JPG, JPEG, PNG, and PDF
- Gemini multimodal extraction into Zod-validated JSON
- Product alias matching and confidence indicators
- Side-by-side user review and confirmation UI before posting to `transactionService`

## Phase 4: Multilingual Voice Assistant
- Speech-recognition provider abstraction (browser Web Speech API + text fallback)
- Hindi, English, and Hinglish transcript processing
- Gemini structured intent extraction
- Confirmation card UI before executing via `transactionService` or `inventoryService`

## Phase 5: Dashboard & Business Intelligence
- Live PostgreSQL-backed KPIs (today's sales, purchases, Udhaar, low-stock alerts)
- Expense tracking and reports module
- Voice-based business queries

## Phase 6: Integration & Testing
- End-to-end workflow testing
- AI extraction accuracy benchmarks
- Transaction atomicity and negative-stock guard verification
- Security & performance refinement

## Phase 7: Deployment & Demonstration
- Production deployment configuration
- Demo business dataset and walkthrough
- Final GitHub documentation
