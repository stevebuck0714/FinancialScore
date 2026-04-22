# Monthly Data Single Source of Truth — Migration Plan

## Background

The Data Review tab and the rest of the financial reports (Reports tab, Financial
KPIs, Ratios, Cash Flow, Forecasts, etc.) historically read monthly financial data
through two separate paths:

1. **Data Review** uses `useMasterData(companyId)` (`lib/master-data-store.ts`),
   which fetches `/api/master-data` with `cache: 'no-store'` and a `_ts`
   cache-buster. It is always live.
2. **All other report tabs** consumed `prefetchedMonthlyData` — a prop populated
   in `app/page.tsx` from a `useEffect` that called `/api/financials`. That fetch
   had no cache directive, so the App Router's default fetch cache and Vercel's
   edge could serve a stale response. This caused report tabs to lag Data Review
   by a month after a publish.

## Phase 1 (shipped)

Make both data routes uncacheable end-to-end so the existing prefetch chain
delivers fresh data without changing component contracts.

- `app/api/financials/route.ts` and `app/api/master-data/route.ts`:
  - `export const dynamic = 'force-dynamic'`
  - `export const revalidate = 0`
  - `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` on every
    response (success and error paths).
- All client fetches to these routes pass `{ cache: 'no-store' }` and append
  `&_ts=${Date.now()}`:
  - `app/page.tsx` (monthly data loader, master-data goals loader, reprocess
    month-discovery fallback)
  - `app/components/operations/OperationsTab.tsx` (cash conversion fetcher)
  - `app/components/FinancialForecastTab.tsx` (master-data loader)

This solves the immediate production symptom (stale monthly data in non-Data-
Review tabs) with zero shape risk.

## Phase 2 (planned — architectural cleanup)

Make `/api/master-data` the single source of truth for all monthly financial
reporting, so there is one normalization layer (server-side) instead of two
(server-side in `/api/master-data` plus the parent's bespoke mapping in
`app/page.tsx` lines ~4932–5004).

### Steps

1. Audit every field the parent's `loadFinancialData` mapping produces vs. what
   `/api/master-data` returns. Confirmed gaps today:
   - `ownersRetirement`
   - `operatingExpenseTotal`
   - `netProfit`
   - `totalLAndE`
   - `lobBreakdowns`
   - COGS legacy-field fallback semantics differ (parent falls back to payroll;
     master-data zeroes legacy fields when sector COGS exists).
   Add these fields to `/api/master-data`'s formatter so the output is a strict
   superset of what consumers expect.
2. Migrate the parent's `useEffect` loader in `app/page.tsx` from `/api/financials`
   to `useMasterData(selectedCompanyId)`. Delete `loadedMonthlyData` state.
3. Delete every `prefetchedMonthlyData={monthly as any}` prop passed to report
   tabs. Each tab already accepts `useMasterData` — make them call it directly.
   Tabs to migrate:
   - `RatiosTab`
   - `CashFlowTab`
   - `FinancialReportsTab`
   - `FinancialKPIsTab`
   - any other consumer of `prefetchedMonthlyData` discovered in audit
4. Replace post-save `setLoadedMonthlyData(...)` calls with
   `masterDataStore.clearCompanyCache(companyId)` followed by `refetch()` from
   the hook so all tabs immediately re-render with fresh data.
5. Add a comment guard / lint rule near `app/page.tsx` discouraging
   re-introduction of a parent-level monthly-data cache.
6. Audit the parent-page UI sections that read `loadedMonthlyData` directly
   (RGS calc, growth_24mo display, etc.) and migrate them to consume
   `masterDataStore` snapshots.

### Why staged

`app/page.tsx` is ~22000 lines with ~30 references to `loadedMonthlyData`,
including derived `monthly` useMemo logic that downstream consumers depend on.
The shape gaps above are real and would silently zero fields in production
charts if shipped without coverage. Each tab migration must be tested locally
against a real company snapshot before merge.

## References

- `docs/DAILY_TRIAL_BALANCE_MONTH_END_PUBLISH_PLAN.md` — two-lane data model
  (daily ops lane vs. core monthly lane) that this work aligns to.
- `lib/master-data-store.ts` — the canonical client-side cache and fetcher.
