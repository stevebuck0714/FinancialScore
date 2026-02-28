# Daily Trial Balance Implementation Map (File-by-File)

## Scope

Implement automated daily mapped trial-balance ingestion for Operations, and month-end publish into core monthly financial reporting (`FinancialRecord.monthlyData`) without changing current core report read paths during the month.

## Existing Core Read Paths (No Change During Month)

- `app/api/master-data/route.ts`
- `app/api/financials/route.ts`
- `app/components/dashboard/DataReviewTab.tsx`
- `app/components/FinancialStatementsView.tsx`
- KPI/MD&A/Valuation views currently sourcing monthly data via page state + master-data.

These continue to read monthly lane only.

## New Data Lane (Daily Ops Lane)

### 1) Prisma models

**File:** `prisma/schema.prisma`

Add:

- `DailyFinancialSnapshot`
  - company/date/frequency
  - mapped daily IS fields and BS fields
  - source metadata (`sourcePlatform`, `sourceRunId`)
  - unique key `(companyId, snapshotDate, frequency)`
- `DailyFinancialImportRun`
  - run status + counts + error metadata per scheduled import
- `FinancialMonthPublish`
  - month publish state (`open/published/locked`) + audit metadata

### 2) Daily ingest endpoint (scheduler target)

**New file:** `app/api/operational-sync/daily-financials/route.ts`

Responsibilities:

- Accept mapped daily payload for a company/date from integration scheduler.
- Upsert `DailyFinancialSnapshot` rows idempotently.
- Write `DailyFinancialImportRun` audit record.
- Validate access using cron secret pattern (`CRON_SECRET`) or service auth key.

### 3) Month-end publish endpoint

**New file:** `app/api/financials/publish-month/route.ts`

Responsibilities:

- Input: `companyId`, `month` (`YYYY-MM`), optional `force`.
- Aggregate daily P&L fields from first day to last day of target month.
- Select last-day BS snapshot from `DailyFinancialSnapshot`.
- Upsert target month row in `FinancialRecord.monthlyData`.
- Record publish metadata in `FinancialMonthPublish`.

## Operations Dashboard: Daily Financials Tab

### 4) Operational data API extension

**File:** `app/api/operational-data/route.ts`

Add new `type`:

- `daily-financials`

Behavior:

- Query `DailyFinancialSnapshot` by date range and frequency (`daily`).
- Return:
  - records for charting
  - summary cards (latest daily revenue/expense/net, cash, AR/AP trend)
- Never read/write `FinancialRecord.monthlyData`.

### 5) Operations tab UI module

**File:** `app/components/operations/OperationsTab.tsx`

Add:

- new data type in dashboard module ordering: `daily-financials`
- tab render function for Daily Financials (daily IS + BS trend blocks)
- API fetch wiring using existing `/api/operational-data?type=...` pattern

### 6) Module registry update

**File:** `lib/operations/module-registry.ts`

Add module mapping for:

- display label `Daily Financials`
- data type `daily-financials`

## Guardrails (Prevent Data Bleed)

### 7) Keep core financial pages monthly-only

No direct file changes required if reads remain on existing `master-data` and `financials` APIs.

Add tests/validation assertions in:

- `app/api/master-data/route.ts` (optional inline guard comments)
- new tests under existing test structure (if present) to ensure daily lane not referenced.

### 8) Scheduler integration orchestration

**Likely files to wire:**

- `app/api/cron/sync-operational-data/route.ts`
- integration-specific operational runner files under `lib/operational-sync/*` or platform routes

Add optional call to daily financial ingest after operational pull completes for eligible integrations.

## Publish Logic Detail

- P&L monthly fields: sum over all daily snapshots in month.
- BS monthly fields: take last available day in month (prefer month-end date; fallback to latest in month).
- If monthly row exists in latest `FinancialRecord`, update it; otherwise create.
- Preserve existing field names in `MonthlyFinancial` to avoid UI rewrites.

## Suggested Delivery Sequence

1. Add Prisma models + generate client.
2. Build daily ingest route with idempotent upsert.
3. Extend operational-data API + Operations Daily Financials tab.
4. Build month publish route writing into `FinancialRecord.monthlyData`.
5. Wire scheduler call + add reconciliation logs.
6. Validate that Data Review/Financial Statements remain unchanged until publish.

## Validation Checklist

- Daily scheduler writes `DailyFinancialSnapshot` for multiple days.
- Operations Daily Financials tab reflects those days.
- Data Review and Financial Statements unchanged before publish.
- Publish month creates/updates monthly row and then core pages reflect month.
- Republish updates same month deterministically.
