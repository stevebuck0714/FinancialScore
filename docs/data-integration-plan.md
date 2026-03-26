# Data Integration Plan

## Purpose

This document defines the standard integration flow for all ERP/accounting platforms in FinancialScore, including:

- credentials requirements
- accounting programs/endpoints by platform
- sync modes and when to use each
- sync actions and run order
- mapping and data quality guardrails

## Integration Principles

- Treat each ERP chart of accounts (COA) as platform-specific.
- Never assume 1:1 account code compatibility across ERPs.
- Profile each ERP's account structure at onboarding before mapping.
- Keep mapping to a canonical FinancialScore model as a separate layer.
- Make imports idempotent (dedupe + upsert/replace semantics).

## Standard Onboarding Flow (All ERPs)

1. Configure credentials and verify connectivity.
2. Load and save platform-specific accounting programs/endpoints.
3. Pull seed COA/account metadata.
4. Profile account numbering/classification patterns.
5. Build or validate account mappings into canonical target fields.
6. Run initial sync (usually backfill for baseline history).
7. Validate completeness and dedupe.
8. Switch to steady-state sync cadence (daily/weekly/monthly).

## ERP Credentials Requirements

### Infor M3 / Infor CSI

- tenant or base URL
- token/authentication configuration
- environment/config identifier (for CSI, e.g. Mongoose config)
- site/division/company context where required

### QuickBooks (Desktop/Online)

- OAuth or connector credentials
- company file/realm context
- token refresh support where applicable

### Other ERPs (Dynamics, Acumatica, Odoo, Sage)

- API base URL/tenant
- client credentials or token-based auth
- company/entity context
- API permission scope for financial and operational resources

## Accounting Programs / Endpoints

### Infor CSI Recommended Core Programs

- `SLLedgers` (GL transactions)
- `SLCharts` (chart of accounts metadata)
- `GLAcctPeriodBalances` (period balances, when available)
- `SLInvHdrs` and `SLCoitems` (sales/invoice detail)
- `SLArtrans` (AR)
- `SLAptrx` (AP)
- `SLItems` / `SLItemlocs` (inventory and item detail)
- `SLCustomers`, `SLVendors` (master dimensions)
- `SLBankHdrs` (cash/bank reference)

### Program Governance

- Store programs by ERP system and company.
- Enable only required programs in production.
- Version program changes and note effective date.
- Prefer explicit endpoint properties/filters for high-volume IDOs.

## CSI Default Settings (Team Baseline)

Use these as the default operating profile for Infor SyteLine CSI unless a company-specific override is documented.

| Area | Default | Notes |
|---|---|---|
| System | `INFOR_CSI` | Platform stored as Infor connection with CSI system normalization. |
| Site | Required (example: `LYN`) | CSI sync should not run without explicit site context. |
| Core financial transaction source | `SLLedgers` | Primary source for financial transaction completeness and rebuilds. |
| COA metadata source | `SLCharts` | Run when mapping/account metadata changes or appears stale. |
| Period balance source | `GLAcctPeriodBalances` | Preferred for BS month-end cross-checks when endpoint is available. |
| Default `SLLedgers` record cap | `1000` | Keep high enough to reduce round-trips; use cursor continuation until done. |
| CSI page drain cap per request | `20` pages | Guardrail to limit single-request runtime; continuation must still drain cursor. |
| Pagination completion rule | Must end with `hasMore=false` | Do not treat run as complete if cursor remains open. |
| Daily mode | `daily_overlap` | Routine incremental updates and operational refresh. |
| Historical mode | `backfill` | Use for baseline history and recovery/reload work. |
| Backfill window baseline | `36` months | Adjust only with explicit business requirement. |
| Business-day backfill mode | Use sparingly | Only for workflows that require day-by-day operational snapshots. |
| Financial month window default | Through target month, max `36` | Keep reporting window bounded and explicit. |
| Dedupe policy | Always-on | Row identity first (RowPointer), then fallback composite keys. |
| Idempotency policy | Required | Re-running same sync must not inflate counts. |

## CSI Required Program Set (Minimum)

These programs should be present/enabled for reliable CSI financial + operations outputs:

- `SLLedgers` (required)
- `SLCharts` (required for mapping metadata lifecycle)
- `SLInvHdrs` (required for invoice-period analytics)
- `SLCoitems` (required for product/customer sales detail)
- `SLArtrans` (required for AR/open invoice coverage)
- `SLAptrx` (required for AP coverage)
- `SLItems` (required for product dimensions)
- `SLItemlocs` (recommended for inventory/location detail)
- `SLCustomers` (required for customer dimension)
- `SLVendors` (required for AP/vendor dimension)
- `SLBankHdrs` (required for cash/bank dimension)
- `GLAcctPeriodBalances` (recommended for BS month-end controls)

## QuickBooks Desktop Default Settings (Team Baseline)

Use these defaults when onboarding and operating QuickBooks Desktop companies.

| Area | Default | Notes |
|---|---|---|
| System | `QUICKBOOKS_DESKTOP` | Distinct from QBO; use Desktop-specific payload/sync paths. |
| Connector mode | Desktop payload push/sync bridge | Depends on connector agent and company file access. |
| Company file context | Required | Confirm exact QB file/entity before first import. |
| Initial baseline import | Full historical available window | Establish complete starting point before daily runs. |
| Daily mode | Incremental daily pull/push | Prefer lightweight deltas after baseline completes. |
| Financial rebuild window | Through target month, max `36` | Keep windows bounded unless explicitly expanded. |
| Dedupe policy | Always-on | Use transaction/document IDs where available; fallback composite keys when needed. |
| Idempotency policy | Required | Re-running same import cannot inflate records. |
| Mapping policy | Platform-specific COA first | Never assume CSI/QB account code parity. |
| Completion gate | Import success + validation checklist | Include month coverage and key KPI sanity checks. |

## QuickBooks Desktop Data Domains (Minimum)

These domains should be covered for reliable financial + operations reporting:

- chart of accounts and account metadata
- journal/GL activity for financial period outputs
- invoices and sales detail (customer + product analytics)
- payments/receipts (AR collections and cash impact)
- bills/vendor payments (AP analytics)
- item/product master and inventory-related facts (if tracked in file)
- customer and vendor master dimensions

## QuickBooks Desktop Financial Run Profile (Default)

1. Run baseline import for historical financial window.
2. Validate COA profile and map QB accounts to canonical targets.
3. Rebuild monthly financial outputs with account-family logic:
   - BS accounts: month-end snapshot treatment
   - P&L accounts: in-period movement treatment
4. Validate anchor months and major totals against source exports.
5. Move to daily incremental refresh schedule.

## QuickBooks Desktop Operations Run Profile (Default)

1. Import customer, sales/invoice, product/item, AR, AP, and cash-related datasets.
2. Run dedupe/idempotency checks on each domain.
3. Validate chart completeness over last 30/90 days.
4. Fill missing chart dimensions with targeted imports.
5. Lock steady-state daily refresh and monitor sync health.

## Sync Modes

### `daily_overlap`

Use for routine incremental updates.

- narrow window for speed
- supports day-to-day dashboards
- not intended for first-time historical completeness

### `backfill`

Use for historical baseline and recovery.

- pulls multi-month history (for example 12/24/36 months)
- required after major mapping/logic changes
- required when completeness audits show broad gaps

### `manual`

Use for targeted date windows and diagnostics.

- explicit start/end control
- useful for troubleshooting specific periods

### `business_day_backfill`

Use only for operations workflows that truly need business-day snapshots.

- heavier/longer runtime
- not default for financial history rebuilds

## Sync Actions and Run Order

### Financial Recovery / Rebuild

1. Pull `SLLedgers` with full cursor/pagination completion.
2. Pull `SLCharts` only if account metadata/mappings need refresh.
3. Rebuild monthly financial payload with dedupe enabled.
4. Apply account mapping and classification.
5. Persist and validate monthly outputs.

### CSI Financial Run Profile (Default)

1. Run `SLLedgers` sync in `backfill` mode (`36` months) for completeness.
2. Confirm cursor drain completion (`hasMore=false`) and no truncation warnings.
3. Rebuild monthly financial data from deduped ledger payload.
4. Apply mapping with account-family treatment:
   - BS accounts: month-end snapshot logic
   - P&L accounts: in-period movement logic
5. Validate anchor months (historical + latest), then publish.

### Operations Refresh

1. Run dedupe audit for operational modules.
2. Reload operational data (customers, sales, AR/AP, inventory, cash).
3. Validate chart completeness by module and period coverage.
4. Run targeted/specialized pulls for missing chart dimensions.

## Mapping Process Standards

- Build mappings from platform-native accounts to canonical targets.
- Use account code ranges/classification hints per ERP (for example CSI prefixes).
- Separate treatment by account family:
  - balance sheet accounts use month-end snapshot logic
  - P&L accounts use in-period movement aggregation
- Capture mapping exceptions and manual overrides explicitly.

## Dedupe and Idempotency Requirements

- Dedupe must be always-on for every import path.
- Prefer strong source identity keys (e.g., row pointers).
- Use composite fallback keys when source identity is absent.
- Write paths must be idempotent:
  - upsert by natural key, or
  - delete/replace per snapshot key before insert
- Re-running the same sync should not inflate counts.

## Validation Checklist (Post Sync)

- cursor drained (`hasMore=false`) for long-running pulls
- per-module records loaded are within expected range
- per-month financial coverage is continuous for target window
- no abnormal duplicate inflation indicators
- Data Review and Operations charts show expected non-zero activity
- anchor period checks pass (for example historical and latest month)

## Operational Runbook Notes

- If a run times out in UI, verify server-side completion before rerun.
- Prefer chunked backfill windows if runtime is excessive.
- Log warnings when pagination truncates or bookmark stalls are detected.
- Do not mark a sync "complete" when coverage checks fail.

## Team Operating Defaults (Quick Reference)

- Default daily refresh mode: `daily_overlap`
- Default history reload mode: `backfill` with `36` months
- Default CSI site behavior: explicit site required
- Default QB Desktop onboarding: full baseline import before daily increments
- Default financial recovery source priority:
  1. `SLLedgers`
  2. `SLCharts` (only when needed)
  3. `GLAcctPeriodBalances` for month-end control checks
- Default completion gate: cursor fully drained + validation checklist passed

## Ownership

- Product/Finance owner: mapping accuracy and reporting acceptance.
- Engineering owner: import reliability, dedupe, sync orchestration, diagnostics.

