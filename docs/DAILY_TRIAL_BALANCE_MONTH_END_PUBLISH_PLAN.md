# Daily Trial Balance -> Month-End Publish Plan

## Objective

Support automatic daily trial-balance imports for Operations while keeping all core financial reporting unchanged until month-end publish.

## Business Rules (Locked)

- Daily imports run automatically from accounting integrations on schedule.
- Daily mapped financial data is used only for `Operations > Daily Financials`.
- Daily data must **not** update:
  - Data Review
  - Financial KPI's
  - MD&A
  - Financial Reports
  - Valuation
  - Financial Statements
- Core financial reporting updates only at month-end publish:
  - Monthly Income Statement = sum of mapped daily P&L activity for full month.
  - Monthly Balance Sheet = mapped month-end (last day) balance-sheet snapshot.

## Current Core Source of Truth

Core financial reporting is backed by `FinancialRecord.monthlyData` (served by `app/api/master-data/route.ts`).

This remains unchanged as the source for Data Review, Financial Statements, KPI's, MD&A, and Valuation.

## Target Architecture

Two-lane model:

- **Lane A: Daily Operations Lane**
  - Stores mapped daily trial-balance facts and daily statement outputs.
  - Powers only Operations daily financial views.
- **Lane B: Core Monthly Lane**
  - Existing `FinancialRecord.monthlyData`.
  - Updated only by month-end publish.

No direct write path from Lane A into core views except controlled month-end publish process.

## End-to-End Process

1. **Daily Scheduled Pull**
   - Integration scheduler runs daily for each connected company.
   - Pull trial balance for the target day.

2. **Map Daily Trial Balance**
   - Apply existing account mapping rules (same mapping used today).
   - If unmapped accounts are found, flag run and hold publish eligibility until resolved.

3. **Persist Daily Facts (Operations Lane)**
   - Store daily mapped facts with company/date/source/run metadata.
   - Upsert/idempotent behavior by company + date + source.

4. **Build Daily Financial Outputs**
   - Build/update daily Income Statement and daily Balance Sheet outputs for Operations UI.
   - Keep this output isolated from core monthly APIs.

5. **Month-End Publish (Controlled)**
   - For prior month:
     - Aggregate full-month daily P&L activity -> monthly IS values.
     - Use month-end day BS snapshot -> monthly BS values.
   - Write one monthly result set into `FinancialRecord.monthlyData`.

6. **Core Reporting Refresh**
   - Existing pages read latest published `FinancialRecord.monthlyData`.
   - No page-level logic changes required except optional status badges.

## Data Governance and Controls

- Month lifecycle states per company:
  - `open`, `publishing`, `published`, `locked`.
- Publish can be rerun for a month if late postings or mapping corrections occur.
- Audit trail for each publish:
  - publish run id, source runs included, timestamp, actor/system.
- Reconciliation checks before publish:
  - Daily aggregate totals vs month-end expected totals.
  - Balance sheet equation integrity.

## API / UI Boundary Rules

- Operations Daily Financials endpoints read only daily lane tables/views.
- Core financial endpoints (`/api/master-data`, financial statement views, KPI/MD&A feeds) read only monthly lane (`FinancialRecord.monthlyData`).
- Data Review remains monthly and publish-gated.

## Implementation Phases

### Phase 1 - Foundations

- Define daily mapped fact schema and run metadata.
- Define month status tracking schema.
- Add scheduler task contract for daily imports.

### Phase 2 - Daily Pipeline

- Build daily ingest + mapping processor.
- Persist daily mapped facts and daily statement outputs.
- Add Daily Financials tab in Operations (read daily lane only).

### Phase 3 - Month-End Publish

- Build publish job:
  - monthly IS aggregation from daily facts
  - month-end BS snapshot extraction
  - write into `FinancialRecord.monthlyData`
- Add publish/republish controls (system + admin trigger path).

### Phase 4 - Guardrails and Validation

- Add automated checks to prevent core pages from reading daily lane.
- Add reconciliation reports and publish-blocking checks.
- Add alerting for unmapped-account conditions and failed publish runs.

## Acceptance Criteria

- Daily imports run automatically without manual upload.
- Operations Daily Financials updates daily from mapped daily data.
- Core financial pages remain unchanged during month.
- Month-end publish updates `FinancialRecord.monthlyData` and then core pages reflect new month.
- Re-run publish produces deterministic corrected monthly outputs.
- Full audit trace exists for each import and publish event.

## Risks and Mitigations

- **Unmapped new accounts** -> publish blocked + mapping queue.
- **Late journal entries** -> allow republish with full audit.
- **Cross-lane data bleed** -> strict API boundary and tests.
- **Performance on daily volume** -> partitioning/indexing by company + date and batch processing.

## Operating Model

- Daily cadence: automated scheduler.
- Month-end cadence: publish job on month close window with optional manual approval gate.
- Ownership:
  - Integrations pipeline owner for ingestion.
  - Finance/data owner for mapping completeness and publish signoff.
