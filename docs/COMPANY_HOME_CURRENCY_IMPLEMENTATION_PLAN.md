# Company Home Currency Implementation Plan

**Owner:** Engineering  
**Status:** In Progress (foundation landed Aug 2026)  
**Last updated:** 2026-08-11  
**Trigger:** New Canadian client whose accounting books and data sources are single-currency CAD; demo/mock companies use CAD.

---

## Objective

Support **single-currency non-USD companies** (first: CAD) by giving each company a **base/home currency**, plus an optional **reporting currency** with daily EOD FX.

Related: [MULTI_CURRENCY_IMPLEMENTATION_PLAN.md](./MULTI_CURRENCY_IMPLEMENTATION_PLAN.md)

---

## Decisions (Aug 2026)

| Topic | Decision |
|------|----------|
| Module | FX lives in `lib/fx/` (separate module). Settings stay on existing company pages. |
| UI location | **Company Management → Profile** and **Import Financials** (not left sidebar) |
| Free FX provider | **Frankfurter** (`api.frankfurter.dev`) — ECB EOD, no API key |
| EOD schedule | Cron `/api/cron/sync-fx-rates` at `15 11 * * *` UTC (~06:15 EST / 07:15 EDT); rate dates use `America/New_York` |
| Mock/demo company | `baseCurrency = CAD`, `locale = en-CA` |

---

## Product Rules

| Rule | Decision |
|------|----------|
| Canonical stored currency | Company **baseCurrency** (source/books) |
| Reporting currency | Optional; when set, presentation may convert via cached EOD FX |
| Existing companies | Default `USD` |
| Platform billing | Remains USD unless product decides otherwise |

**Guiding principle:**

> The app speaks the company’s base currency. Reporting currency is presentation-only FX, not a rewrite of stored books.

---

## Where Currency Is Set in the UI

1. **Admin → Company Management → Profile** — Base + Reporting currency (`CompanyCurrencySettings`)
2. **Company dashboard → Import Financials** — same controls (card variant)

Do **not** put the primary control in the left sidebar.

---

## Implementation Status

### Landed

- [x] `Company.baseCurrency`, `reportingCurrency`, `locale`
- [x] `FxRate` table
- [x] `lib/fx` module (Frankfurter, EST dates, convert, sync/backfill, reporting convert)
- [x] Daily EST EOD cron
- [x] Profile + Import Financials UI
- [x] Demo/mock companies provisioned as CAD
- [x] Saving a reporting currency triggers 3-year FX backfill
- [x] Operational daily-financials + publish-month use company base currency (no USD-only gate)
- [x] Ops dashboard + OperationsTab format with company display currency (tables + chart axes)
- [x] Shared `formatMoney` / `formatMoneyCompact` / `useCurrencyFormatter` / `useCompanyMoneyFormatter`
- [x] Formatter sweep: MDA, PA (Focus/Trend/Opportunity), covenants/loans, custom reports, pulse generator

### Remaining

- [ ] Residual `$` in niche sector-exception / ops mock tables (lower priority)
- [ ] Word/PDF: remaining valuation print-package copy that still hardcodes `$` outside MDA
- [ ] Per-period historical FX on monthly rows (currently one as-of rate for whole payload)

### Recently completed (Aug 11–12)

- [x] Profile Save Profile persists base/reporting currency
- [x] CAD displays as `CA$` (not bare `$`)
- [x] Formatter cache invalidates after currency save
- [x] Valuation/WC narratives use company formatDollar
- [x] Cash flow, forecasts, projections, LOB, WC forecast wired to company currency
- [x] Shared `withCurrencyPresentation` API helper + currency metadata
- [x] Master-data returns `currency` metadata; **auto-converts when reporting ≠ base**
- [x] Operational-data: all `cacheOperationalPayload` types get currency meta + FX convert
- [x] Daily-financials always returns currency metadata
- [x] Pulse exec briefing formats/prompts in company display currency
- [x] Admin FX coverage diagnostics (`GET/POST /api/fx/coverage`) + Profile/Import UI panel
- [x] MDA narrative/valuation amounts + Word export currency note use display currency

---

## Onboarding Checklist (Canadian Single-Currency Client)

1. Confirm accounting system base currency = CAD.
2. Set **Base Currency = CAD** on Profile (or Import Financials) before first sync.
3. Leave Reporting Currency blank unless they need USD (or other) presentation.
4. Sync and spot-check key totals against source in CAD.
5. Confirm UI shows CAD formatting once formatter rollout is complete.
