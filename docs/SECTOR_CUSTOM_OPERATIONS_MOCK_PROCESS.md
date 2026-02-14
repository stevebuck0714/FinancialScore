# Sector Custom Operations Reporting Process (Option C)

This document describes how sector-based defaults and temporary mock operational data are created, saved, and consumed for Company Operations reporting.

## Goal

Support Option C layering:

1. Sector default reporting baseline (by `industrySectorCategory`)
2. Company-level preferences/overrides
3. Real operational snapshots when available, with sector mock fallback when not

## Data Ownership and Persistence

- Company sector selection is stored on `Company.industrySectorCategory`.
- Sector defaults are stored in `OpsSectorLayoutConfig` (one row per sector).
- Company dashboard frequency preferences are stored in `OpsDashboardPreference`.
- Operational snapshots are stored in:
  - `CustomerSalesSnapshot`
  - `ARAgingSnapshot`
  - `APAgingSnapshot`
  - `ProductSalesSnapshot`
  - `InventorySnapshot`
  - `CashSnapshot`

## Sector Top-Line Buckets

Source of truth for top-line operational buckets is now centralized in:

- `lib/operations/sector-mock-data.ts` (`TOP_LINE_BUCKETS_BY_SECTOR`)

The mapping covers all NAICS options currently in Company Details:

- `01`, `11`, `21`, `22`, `23`, `32`, `42`, `45`, `48`, `51`, `52`, `53`, `54`, `56`, `61`, `62`, `71`, `72`, `81`

## Mock Data Strategy

When real operational rows are missing for a company/type/date range, the API returns sector-specific temporary mock data:

- Customer Sales
- AR Aging
- AP Aging
- Product Sales
- Inventory
- Cash

Mock data is generated from deterministic sector profiles (names, account labels, scale factors) so each sector has realistic and distinct behavior.

## Runtime Flow

1. User opens Operations for a company.
2. UI requests `/api/operational-data` by widget type and date/frequency.
3. API validates access (`requireAuth`, `validateCompanyAccess`).
4. API resolves sector:
   - query `sectorCategory` parameter when provided
   - otherwise `Company.industrySectorCategory`
   - fallback to `01` only when missing
5. API returns:
   - real DB rows when present
   - sector mock payload when DB rows are absent
6. UI renders returned payload without needing hardcoded generic fallback constants.
7. Operations tab/widget visibility is resolved from:
   - `opsSectorLayoutConfig.modules` when present
   - otherwise sector top-line bucket map
   - otherwise default tab set

## Implementation Notes

- Sector mock engine:
  - `buildOperationalMockResponse(...)`
  - `buildOperationalMockSummaryCounts(...)`
  - `getSectorArApFallbacks(...)` for detailed AR/AP tables
  - `getTopLineBucketsForSector(...)`
- Sector-aware API fallback:
  - `app/api/operational-data/route.ts`
- Sector-aware dashboard requests:
  - `app/components/operations/OpsDashboard.tsx`
  - `app/components/operations/OperationsTab.tsx`

## How to Update Sector Defaults

1. Update top-line bucket map in `lib/operations/sector-mock-data.ts`.
2. Sector layout defaults are derived from those bucket keys via `lib/operations/sector-layout-defaults.ts`.
3. Update sector layout config via `/api/ops-sector-layouts` (Site Admin).
4. If needed, reseed defaults with `scripts/seed-ops-sector-layouts.ts`.
5. Verify by loading Operations for a company in that sector with no snapshot rows.

## Cutover to Real Data

Mock data is temporary. To cut over:

1. Sync source accounting/operational feeds into snapshot tables.
2. Keep API fallback in place only for missing periods.
3. Remove or reduce fallback usage after data completeness reaches target.
