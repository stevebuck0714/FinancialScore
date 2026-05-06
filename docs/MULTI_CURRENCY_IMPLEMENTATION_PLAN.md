# Multi-Currency Implementation Plan

**Owner:** Engineering
**Status:** Draft / Not Started
**Last updated:** 2026-04-30
**Trigger:** Customers need optional alternate-currency reporting while FinancialScore remains USD-canonical.

---

## Current Product Direction

FinancialScore will remain **USD-canonical**. All companies default to USD,
and existing company data remains stored and reported in USD unless a viewer
chooses an optional reporting currency.

The near-term multi-currency scope is:

- Every company defaults to USD.
- Site Admins can configure **one additional reporting currency** per company.
- Customer-facing pages can switch between USD and the configured alternate
  currency.
- The alternate currency is for **display and reporting translation only**,
  not accounting remeasurement.
- The app stores **three years of daily EOD FX rates** for each active USD
  reporting pair and refreshes rates daily going forward.
- Historical reports use historical FX rates based on the business date,
  not the current FX rate.

This supersedes the older "tenant home currency" emphasis below for the
initial implementation. Phase 3 transaction-level multi-currency remains a
future capability and should not be mixed into the first reporting-currency
release.

---

## USD Reporting Currency Implementation Plan

### Product Rules

| Rule | Decision |
|------|----------|
| Canonical stored currency | USD |
| Default company behavior | USD only |
| Additional currency count | One optional reporting currency per company |
| Who configures it | Site Admin |
| Where users switch | Customer-facing global currency selector, likely left sidebar |
| FX history window | Three years of daily EOD rates |
| Conversion purpose | Display/reporting only |
| Historical data | Apply historical FX, not today's rate |

### Company Configuration

Add company-level configuration for the optional reporting currency:

- `baseCurrency`: defaults to `USD`
- `reportingCurrency`: nullable ISO 4217 code such as `CAD`, `EUR`, or `GBP`

If `reportingCurrency` is empty, the customer sees USD only. If it is set,
the customer can switch between USD and the alternate reporting currency.

The accounting/admin container should expose the setting only to Site Admins.
Changing the reporting currency should trigger a three-year FX backfill for
the new USD pair.

### Customer-Facing Currency Selector

Add a global reporting-currency selector in the customer experience, preferably
in the left sidebar because it affects the whole reporting context.

Selector behavior:

- Hide or disable the selector when no alternate reporting currency is set.
- Show exactly two options when configured: `USD` and the alternate currency.
- Persist the user's selected currency as view preference, not company data.
- Apply the selection consistently to dashboards, reports, charts, exports,
  AI narratives, and operational pages.

UI copy should make clear that alternate-currency reporting is presentation
translation:

> Reporting currency conversion is for presentation only. Source financials
> remain stored in USD.

### FX Rate Storage

Store rates once per currency pair, not per company.

Suggested FX rate fields:

| Field | Purpose |
|-------|---------|
| `provider` | Source such as `open_exchange_rates`, `oanda`, or `xe` |
| `baseCurrency` | `USD` |
| `quoteCurrency` | Alternate reporting currency |
| `rateDate` | Historical EOD date |
| `rate` | USD-to-quote conversion rate |
| `rateType` | `eod` initially |
| `retrievedAt` | When the app loaded the rate |
| `sourceTimestamp` | Provider timestamp, if available |
| `sourcePayloadHash` | Optional audit/debug trace |

Use a uniqueness constraint on provider, base currency, quote currency, rate
date, and rate type.

### FX EOD Timing Policy

FX EOD rates are stored by **UTC/GMT rate date**.

Standard convention:

- `rateDate` is a UTC calendar date, such as `2026-04-30`.
- The EOD period is `2026-04-30T00:00:00Z` through
  `2026-04-30T23:59:59Z`.
- The EOD close point is effectively `23:59:59Z`.
- The daily job loads the prior day's EOD rate after the provider publishes
  it, typically shortly after `00:05 GMT` the next day for Open Exchange Rates.
- A record's business date selects the FX rate, not the import timestamp.

Example: an ERP invoice with business date `2026-04-30` uses
`rateDate = 2026-04-30`, even if FinancialScore imports it on May 1 or May 3.

If no rate exists for the business date due to weekend, holiday, or provider
gap, use the most recent prior available FX date and mark the conversion as
using a fallback rate.

### FX Loading Jobs

Build two FX jobs:

1. **Backfill job:** when a Site Admin enables an alternate reporting currency,
   load three years of daily EOD rates for `USD -> reportingCurrency`.
2. **Daily refresh job:** load the latest available EOD rate for every active
   reporting currency pair.

Operational behavior:

- Cache every fetched rate permanently.
- Load each active pair once, even if many companies use it.
- Fill weekends and holidays using a deterministic rule, preferably the
  previous available business-day rate unless the provider already normalizes
  historical dates.
- Track missing dates and provider failures in admin diagnostics.

### Historical Conversion Rules

Use historical FX based on the data's business date.

| Reporting area | FX rule |
|----------------|---------|
| Daily ERP P&L rollups | Convert each daily value using that day's EOD rate, then sum |
| Daily operational transactions | Transaction/business-date EOD rate |
| AR/AP aging snapshots | Snapshot-date EOD rate |
| Balance sheet | Period-end EOD rate |
| Monthly-only P&L imports | Monthly average EOD fallback |
| Cash flow | Daily conversion when daily source exists; monthly fallback otherwise |
| Percentages and pure ratios | Usually unchanged |

The important distinction for large ERP systems is that P&L is a rollup of
daily data. For those systems, convert the daily activity first and then
aggregate the converted values. Monthly average FX is only a fallback when
the source data exists only at monthly grain.

### Conversion Service

Create one server-side reporting conversion layer and avoid ad hoc conversion
inside React components.

The service should support:

- Convert a USD amount to the selected reporting currency as of a date.
- Convert a daily series to the selected reporting currency.
- Convert period-end balances using period-end FX.
- Convert daily ERP P&L rows before monthly aggregation.
- Return rate metadata with the converted value.

Every converted value should be traceable to:

- selected currency
- FX rate used
- FX date used
- provider
- rate type
- fallback indicator, if any

### Reporting Rollout Order

Roll out by surface area:

1. Core dashboard KPI cards
2. P&L and revenue/expense charts
3. Balance sheet
4. Cash flow
5. AR/AP aging and working capital
6. Operations dashboards
7. Exports and AI-generated narratives

USD-only companies should behave exactly as they do today throughout rollout.

### Admin and Observability

Expose FX readiness in Site Admin:

- configured reporting currency
- latest loaded FX rate
- three-year backfill coverage
- missing dates
- provider errors
- last successful refresh
- active companies per currency pair

If FX coverage is incomplete for a requested historical period, either block
alternate-currency display for that period or show a clear warning.

### Testing Plan

Required test cases:

- USD-only companies remain unchanged.
- A company with `CAD` configured sees only `USD` and `CAD` in the selector.
- Historical March 2024 reporting uses March 2024 FX, not current FX.
- Daily ERP P&L converts daily rows and then sums them.
- Balance sheet uses period-end FX.
- Weekend and holiday dates resolve consistently.
- Exports match on-screen selected currency.
- AI/report narratives label the selected currency correctly.

### Rollout Plan

Ship behind a feature flag:

1. Enable internally with one dev company and one alternate currency.
2. Validate three-year FX backfill and daily refresh.
3. Enable Site Admin configuration in staging.
4. Enable the customer-facing selector for one pilot company.
5. Expand after dashboards, exports, and narratives show consistent currency
   behavior.

The guiding principle for this release is:

> Store USD, store FX rates, convert through one shared reporting layer, and
> keep the selected display currency as view state.

---

## Executive Summary

Corelytics is currently USD-only at the display layer. The underlying data
model already captures `currencyCode`, `amountCurrency`, and `amountHome` on
AR/AP detail tables, but every UI surface, email, and AI narrative hardcodes
the `$` symbol and the `en-US` locale.

This plan delivers multi-currency support in **three independently shippable
phases**:

| Phase | Scope | Risk to existing USD tenants | Effort |
|------|------|------------------------------|--------|
| **1. Tenant-aware display formatting** | Render every tenant in its own currency/locale label. No FX conversion. | Zero (defaults preserve current behavior byte-for-byte) | ~4 days |
| **2. FX rates + reporting-currency toggle** | Pull daily FX from openexchangerates.org. Let users view a tenant's reports in a *different* currency. | Low (additive feature, gated by toggle) | ~5 days |
| **3. Multi-currency at the transaction level** | Mixed-currency AR/AP within a single tenant. Per-line FX gain/loss. | Medium (touches ingestion + accounting logic) | ~10–15 days |

**Strategy:** All work lands on `main` behind a per-company configuration
field — no long-lived "international" branch. Default values (`USD` /
`en-US`) make every change a no-op for existing tenants.

---

## Guiding Principles

1. **Default = current behavior.** Every migration sets `homeCurrency='USD'`
   and `locale='en-US'`. Existing tenants render identically post-deploy.
2. **One central formatter.** Replace the two duplicated `formatCurrency`
   helpers (`app/covenants/calculations/utils.ts`, `lib/billing/billingHelpers.ts`)
   plus all inline `'$' + value.toLocaleString('en-US')` patterns with a
   single helper backed by `Intl.NumberFormat`.
3. **Small PRs, file by file.** Each PR independently revertable.
4. **Staging first.** Provision the international client on staging
   (Render preview env or staging service) before production rollout.
5. **No long-lived branch.** Feature-flag everything; merge to `main` early
   and often.
6. **Display ≠ conversion.** Phase 1 only changes labels. Phase 2 introduces
   actual FX conversion. Don't conflate them.

---

## Data Model Foundation (lands with Phase 1)

```prisma
model Company {
  // ...existing fields...
  homeCurrency  String  @default("USD")  // ISO 4217 code
  locale        String  @default("en-US") // BCP 47 locale tag
}
```

- `homeCurrency` = the currency the company keeps its books in.
- `locale` = number/date formatting (`1,234.56` vs `1.234,56`).
- No separate `multiCurrencyEnabled` boolean. The presence of a non-USD
  `homeCurrency` *is* the flag.

A single migration adds two columns with defaults; zero behavior change at
deploy time.

---

## Phase 1 — Tenant-Aware Display Formatting

**Goal:** A non-USD company sees its books labeled in its own currency
end-to-end. No FX conversion. Existing USD tenants are unaffected.

### Step 1.1 — Schema + Site Admin UI (~0.5 day)

- Migration: add `homeCurrency` and `locale` to `Company`.
- Site Admin → Company Settings: two dropdowns.
  - **Home Currency** (curated ISO 4217 list, default `USD`).
  - **Locale** (curated BCP 47 list, default `en-US`).
- Confirmation modal on change of a non-default value:
  > "This changes how all financial data displays for **{Company Name}**.
  > Existing data is **not converted** — only the label and formatting
  > change. Continue?"
- Audit log entry on change (who / when / old → new). Reuse existing
  company-settings audit pattern.
- Initially gate the dropdown so it can only be edited by SiteAdmin role.

**Initial dropdown contents:**

| Currency | Suggested locale |
|---------|------------------|
| USD - US Dollar | en-US |
| CAD - Canadian Dollar | en-CA |
| EUR - Euro | de-DE / fr-FR / es-ES |
| GBP - British Pound | en-GB |
| AUD - Australian Dollar | en-AU |
| MXN - Mexican Peso | es-MX |
| JPY - Japanese Yen | ja-JP |

Add additional currencies on demand.

### Step 1.2 — Central formatter (~0.5 day)

Create `lib/format/currency.ts`:

```ts
export function formatCurrency(
  value: number,
  opts: { currency: string; locale: string; decimals?: number; compact?: boolean }
): string;

export function formatNumber(
  value: number,
  opts: { locale: string; decimals?: number }
): string;
```

Create `app/hooks/useCurrencyFormatter.ts`:

```ts
export function useCurrencyFormatter() {
  const { company } = useFinancialData();
  const currency = company?.homeCurrency ?? 'USD';
  const locale = company?.locale ?? 'en-US';
  return useMemo(() => ({
    fmt: (v: number) => formatCurrency(v, { currency, locale }),
    fmtCompact: (v: number) => formatCurrency(v, { currency, locale, compact: true }),
  }), [currency, locale]);
}
```

`FinancialDataContext` (`app/contexts/FinancialDataContext.tsx`) is updated
to expose `homeCurrency` and `locale` on the company object.

**Delete the duplicate helpers:**
- `app/covenants/calculations/utils.ts` line 165 → re-export from
  `lib/format/currency.ts`.
- `lib/billing/billingHelpers.ts` line 8 → re-export from
  `lib/format/currency.ts`.

### Step 1.3 — Replace hardcoded USD / `en-US` call sites (~2.5 days)

Mechanical replacement, file by file. Approximate occurrence counts (from
grep) shown to size each file.

**Tier A — High volume (must do first; biggest visible impact):**

| File | `$` hits | Notes |
|------|---------:|-------|
| `app/page.tsx` | ~100 | Many in narrative copy / `outcome`/`meaning`/`impact` strings |
| `app/components/operations/OperationsTab.tsx` | 26 | |
| `app/components/FinancialForecastTab.tsx` | 21 | Includes `formatCurrencyIntegerInput` (line 149) |
| `app/components/DashboardView.tsx` | 19 | |
| `app/components/CashFlowTab.tsx` | 17 | |
| `app/components/operations/OpsDashboard.tsx` | 12 | |

**Tier B — Medium volume:**

| File | `$` hits |
|------|---------:|
| `app/components/siteadmin/SiteAdminDashboard.tsx` | 8 |
| `app/components/valuation/ValuationSdeSection5Preview.tsx` | 7 |
| `app/components/ProjectionsTab.tsx` | 6 |
| `lib/sde-recommendations.ts` | 6 |
| `app/covenants/components/CovenantsTab.tsx` | 4 |
| `app/components/performance-analytics/TrendExplorer.tsx` | 4 |
| `app/components/AIAnalysisView.tsx` | 3 |
| `app/components/MDAView.tsx` | 3 |
| `app/components/AggregatedFinancialsTab.tsx` | 3 |
| `app/components/WorkingCapitalTab.tsx` | 3 |
| `lib/email.ts` | 3 |
| `app/covenants/alerts/service.ts` | 3 |

**Tier C — Low volume:**

| File | `$` hits |
|------|---------:|
| `app/components/valuation/ValuationEbitdaSection6Preview.tsx` | 1 |
| `app/components/valuation/ValuationDcfSection7Preview.tsx` | 1 |
| `app/components/operations/WorkingCapitalForecastTab.tsx` | 2 |
| `app/components/operations/DailyAlertsView.tsx` | 2 |
| `app/components/dashboard/LOBReportingTab.tsx` | 1 |
| `app/components/performance-analytics/FocusBoard.tsx` | 1 |
| `app/components/performance-analytics/OpportunityWorkspace.tsx` | 1 |
| `app/components/shared/FinancialRow.tsx` | 1 |
| `app/components/GoalsView.tsx` | 2 |
| `app/components/auth/MFAEnrollmentModal.tsx` | 2 |
| `app/api/ai-analysis/ask/route.ts` | 1 |
| `app/api/billing/reports/period/route.ts` | 1 |
| `app/api/performance-analytics/run/route.ts` | 9 |
| `app/covenants/components/LoansManagement.tsx` | 1 |

**Total ≈ 310 call sites across ~32 files.**

**Replacement pattern:**

Before:
```tsx
<div>{`$${value.toLocaleString('en-US')}`}</div>
```

After:
```tsx
const { fmt } = useCurrencyFormatter();
// ...
<div>{fmt(value)}</div>
```

For server-side (API routes, email, AI prompts): pass the company's
`homeCurrency` and `locale` into `formatCurrency()` directly.

**Excluded from Phase 1:**
- `tmp/**` — diagnostic scripts.
- `temp_jsx.txt`, `temp.txt`, `app/page-simple.tsx` — verify and delete or
  skip.
- `prisma/seed-*.ts`, `scripts/seed-*` — internal seed scripts.
- Date locale call sites (`app/utils/date.ts`, `app/components/charts/Charts.tsx`,
  etc.) — date-locale work is a separate concern.

### Step 1.4 — Server-side / email / AI threading (~0.5 day)

- `lib/email.ts` (3 hits) — emails render in the recipient company's
  currency.
- `app/api/billing/reports/period/route.ts`, `app/api/ai-analysis/ask/route.ts`,
  `app/api/performance-analytics/run/route.ts` — load company currency once,
  pass into formatter.
- AI prompts (`lib/sde-recommendations.ts`, `app/api/ai-analysis/ask/route.ts`)
  — include the currency code in the prompt context so the model doesn't
  write "$" in narrative text.

### Step 1.5 — QA on a non-USD demo company (~0.5 day)

- Provision a demo company on staging with `homeCurrency='CAD'`, `locale='en-CA'`.
- Verify rendering in: dashboard, operations, billing, covenants, valuation
  previews, forecasts, performance analytics, MDA, AI narratives, weekly
  emails, exports.
- Verify USD demo company is byte-identical to pre-change.

### Phase 1 Definition of Done

- [ ] Migration applied; every existing company defaults to `USD` / `en-US`.
- [ ] Site Admin Company Settings exposes Home Currency and Locale dropdowns
      with confirmation modal and audit log.
- [ ] Single `formatCurrency` helper in `lib/format/currency.ts`; both
      duplicates removed.
- [ ] `useCurrencyFormatter()` hook consumed by all UI components.
- [ ] Zero `'$'` literal currency strings remain in user-facing components
      (excluded list documented).
- [ ] Zero `'en-US'` literals in currency formatting paths (date paths
      may remain).
- [ ] Non-USD canary tenant validated end-to-end on staging.
- [ ] USD tenants verified unchanged in production after rollout.

### Phase 1 Risks

| Risk | Mitigation |
|------|-----------|
| Missed call site shows `$` next to non-USD numbers | Grep CI rule that blocks PRs introducing literal `'$'` in `app/` and `lib/` outside the central formatter |
| Currency symbol changes width and breaks UI alignment | QA pass on tabular layouts; column widths use min-width or right-aligned numerics |
| Site admin sets wrong currency for an existing USD tenant | Confirmation modal + audit log + initial restriction to SiteAdmin role |
| Formatter performance regression in tight loops | Cache `Intl.NumberFormat` instances per (currency, locale) pair |

---

## Phase 2 — FX Rates and Reporting-Currency Toggle

**Goal:** Allow a viewer to see a tenant's reports in a *different*
currency than the tenant's home currency (e.g. portfolio view of a CAD
tenant in USD; or a USD tenant rendering in EUR for an investor pitch).

This is the first phase that introduces actual currency *conversion*, not
just label changes.

### Step 2.1 — FX data model (~0.5 day)

```prisma
model FxRate {
  id             String   @id @default(cuid())
  rateDate       DateTime
  fromCurrency   String   // ISO 4217
  toCurrency     String   // ISO 4217
  rateSpot       Float    // close-of-day spot rate
  rateAverage    Float?   // optional period average (computed)
  source         String   // 'openexchangerates' | 'manual' | 'erp'
  createdAt      DateTime @default(now())
  @@unique([rateDate, fromCurrency, toCurrency])
  @@index([fromCurrency, toCurrency, rateDate])
}
```

### Step 2.2 — FX feed integration (~1 day)

**Provider: openexchangerates.org**

Reasoning vs. ECB:
- ECB is EUR-base only (need triangulation for non-EUR pairs).
- ECB has no weekend rates.
- openexchangerates.org gives 170+ currencies, daily historical endpoint,
  free tier supports 1,000 requests/month (sufficient for daily cron).
- Paid tier (~$12/mo) gives hourly rates and more pairs if needed.

**Implementation:**
- `lib/fx/openExchangeRates.ts` — typed client wrapper.
- `app/api/cron/sync-fx-rates/route.ts` — daily cron pulls latest spot
  rates for the universe of currencies any tenant currently uses.
- Backfill script: `tmp/backfill-fx-rates.ts` to load history for the
  earliest tenant data point forward.
- Env: `OPENEXCHANGERATES_APP_ID`.

**FX rate type policy:**
- **P&L / cash flow** = period average rate (sum of spot ÷ N days in
  the reporting period).
- **Balance sheet** = period-end (last business day of period) spot rate.
- **AR/AP detail** = transaction-date spot rate, falling back to most
  recent prior business day.
- **Ratios / percentages** = unitless, no conversion.

### Step 2.3 — Conversion helper (~0.5 day)

```ts
// lib/fx/convert.ts
export async function convert(
  amount: number,
  opts: {
    from: string;
    to: string;
    asOf: Date;
    rateType: 'spot' | 'average' | 'periodEnd';
    periodStart?: Date;
    periodEnd?: Date;
  }
): Promise<number>;
```

Bulk variant for report rendering:

```ts
export async function convertSeries(
  rows: Array<{ date: Date; amount: number }>,
  opts: { from: string; to: string; rateType: 'spot' | 'average' }
): Promise<Array<{ date: Date; amountConverted: number; rate: number }>>;
```

Cache rates per (from, to, date) in-memory per request.

### Step 2.4 — Reporting-currency toggle UI (~1 day)

- Header dropdown: "View in: **[CAD]** ▾  USD | EUR | GBP | …"
- Defaults to the company's `homeCurrency`.
- Selection stored in user preference per company (so a viewer can pick a
  default reporting currency for portfolio tenants).
- A subtle "as-of FX: 2026-04-24, source: openexchangerates" note in the
  report footer when the active currency != home currency.
- A banner "Showing values converted from CAD at period-average rates"
  when conversion is active.

### Step 2.5 — Wire conversion into report read paths (~1.5 days)

Touch the read-side of each major report to:
1. Detect if reporting currency != home currency.
2. If so, convert each amount using the appropriate rate type.
3. Emit a meta block with the rate(s) used so the UI can show provenance.

Affected read paths (rough list — finalize during Step 2.5):
- `app/api/master-data/route.ts`
- `app/api/billing/reports/period/route.ts`
- `app/api/performance-analytics/run/route.ts`
- `app/components/operations/*` (data fetch hooks)
- `app/components/billing/*` (data fetch hooks)
- `app/covenants/calculations/index.ts` (decide policy: convert covenant
  thresholds too, or keep covenants in home currency only?)

**Recommendation:** Covenants stay in home currency (lender contracts are
denominated in a specific currency). Add an explicit indicator if the
viewer toggles to a non-home currency on a covenant page.

### Step 2.6 — QA (~0.5 day)

- A USD tenant rendered in EUR matches an external reference
  (xe.com / Google) within rounding tolerance.
- A CAD tenant's portfolio view in USD reconciles back to the CAD source
  values when toggled back.
- AI narratives that quote dollar amounts honor the active reporting
  currency.

### Phase 2 Definition of Done

- [ ] `FxRate` table populated with daily history for every currency
      currently in use by any tenant.
- [ ] Cron job pulls and stores fresh rates daily; alerts on failure.
- [ ] `convert()` and `convertSeries()` helpers exported from `lib/fx`.
- [ ] Header reporting-currency dropdown live with provenance footer.
- [ ] All major report read paths honor the active reporting currency.
- [ ] Documented FX rate-type policy (avg / period-end / spot).

### Phase 2 Risks

| Risk | Mitigation |
|------|-----------|
| FX feed outage breaks reports | Use last-known-good rate; surface a "stale FX" warning in UI |
| Rate-type mismatch causes BS to not balance | Apply period-end consistently to *all* BS line items in a single render |
| Conversion math drift from ERP's own home conversion | Always store ERP-provided home values as the source of truth; only convert when reporting currency != home |
| API key leakage | Server-side only; never call FX from client |

---

## Phase 3 — Multi-Currency at the Transaction Level

**Goal:** A single tenant transacts in multiple currencies (e.g. a
Canadian company with USD vendors and EUR customers). Each transaction
keeps its native currency; the books are kept in home; FX gain/loss is
recognized.

This is the largest piece and is **only required for tenants with mixed-
currency operations**. Single-currency international tenants are fully
served by Phase 1+2.

### Step 3.1 — Audit current data model (~0.5 day)

The schema already has the right columns on AR/AP detail (`currencyCode`,
`amountCurrency`, `amountHome`). Verify:
- Are non-USD currencies actually populated by current ERP adapters?
- Are GL/journal models capturing both native and home amounts?
- Is the `amountHome` value trusted from the ERP, or do we re-derive?

### Step 3.2 — Ingestion adapter audit (~2 days)

Per-adapter review and fixes:

| Adapter | Current state | Phase 3 work |
|--------|--------------|--------------|
| **Infor M3** | Populates `amountCurrency` and `amountHome`. Mostly compliant. | Verify all entity types (vouchers, invoices, payments) carry both. |
| **QuickBooks Online** | Adapter currently extracts `TotalAmt` only. | Use `HomeTotalAmt` + `ExchangeRate` from QBO API; store both. |
| **Xero** | Adapter has currency awareness but inconsistent. | Use `CurrencyRate` from Xero invoice payload; store native + home. |
| **Sage Intacct** | Multi-book/multi-entity; needs review. | Confirm reporting currency vs. txn currency mapping. |
| **Viewpoint Vista** | US-construction only; likely USD-only. | Defer until international Vista customer exists. |

Each adapter PR: ensure native amount + home amount + native currency
code + ERP-supplied FX rate are all persisted.

### Step 3.3 — Multi-currency display in detail tables (~1 day)

AR/AP open-item tables, invoice/bill detail views:
- Show native currency amount with currency badge ("CAD 1,234.56").
- Show home-currency equivalent in a secondary column ("USD 920.45 @ 1.341").
- Reporting-currency toggle from Phase 2 controls the secondary column.

### Step 3.4 — FX gain/loss recognition (~3 days)

When a foreign-currency receivable is paid:
- Original AR booked at invoice-date FX rate.
- Cash received at payment-date FX rate.
- Difference = realized FX gain/loss → posted to a designated GL account.

For period-end open foreign balances:
- Revalue at period-end FX rate.
- Difference vs. carrying amount = unrealized FX gain/loss.

This requires:
- A new `FxGainLoss` fact table (date, account, txn ref, amount, type).
- Backfill logic for historical periods if the customer wants to restate.
- UI surface on P&L (FX gain/loss line) and on AR/AP aging
  (revaluation note).

### Step 3.5 — Reporting changes (~2 days)

- P&L: add "Foreign currency gain/(loss)" line below operating income.
- BS: revalued foreign balances tied out to period-end rates.
- AR/AP aging: dual-column native + home; aging buckets based on home
  amounts to keep consistency with USD-only logic.
- Cash flow: separate FX impact line in indirect method.

### Step 3.6 — QA (~1 day)

- Test tenant with mixed CAD home + USD/EUR transactions.
- Reconcile FX gain/loss against a manual Excel calculation.
- Verify aging buckets match between native-currency and home-currency
  views (count, not amount).
- Verify P&L FX line matches the sum of realized + unrealized
  movements for the period.

### Phase 3 Definition of Done

- [ ] All adapters persist native + home amounts + ERP FX rate.
- [ ] AR/AP detail views show native currency with home equivalent.
- [ ] FX gain/loss table populated and surfaced on P&L.
- [ ] Period-end revaluation runs as part of month-end publish.
- [ ] One mixed-currency pilot tenant in production for one full close
      cycle without manual reconciliation.

### Phase 3 Risks

| Risk | Mitigation |
|------|-----------|
| Restating history breaks existing published months | Restrict revaluation to current open period; require explicit re-publish for prior periods |
| ERP FX rate disagrees with our FX feed | Always trust the ERP rate for transactions the ERP processed; only use our rate for our own conversions |
| FX gain/loss double-counted (ERP already books it) | If ERP books FX gain/loss to a specific account, exclude that account from our derived line and just surface the ERP figure |
| Mixed-currency customer with no ERP FX support | Manual rate entry UI as a fallback |

---

## Cross-Cutting Concerns

### Branching strategy
- All work on `main` behind tenant-level configuration.
- Short-lived feature branches per PR (`feat/currency-helper-consolidation`,
  `feat/replace-hardcoded-usd-page-tsx`, `feat/fx-rates-table`, etc.).
- **No long-lived "international" branch.** Drift cost > perceived safety
  benefit.

### Staging / canary plan
- Provision the international prospect on staging first.
- Render preview environment (`render.yaml` already supports it) for
  per-PR validation.
- Production rollout: enable for the new tenant only; existing tenants
  unaffected.

### Testing strategy
- **Phase 1:** snapshot tests on a small set of report fixtures rendered
  in USD and CAD. USD output must be byte-identical pre/post.
- **Phase 2:** integration tests that exercise the FX cron + conversion
  helpers against a fixed `FxRate` fixture.
- **Phase 3:** end-to-end test that mixes currencies on one tenant and
  walks the full ingest → revalue → publish → render path.

### Observability
- New `Company.homeCurrency` distribution surfaced on Site Admin overview
  (count of tenants per currency).
- FX cron job emits a metric (rates fetched, errors, last successful run).
- Report renders log the active reporting currency for traceability in
  support cases.

### Documentation updates needed
- `OPERATIONAL_MANUAL.md` — add multi-currency section.
- `USER_MANUAL.md` — explain reporting-currency toggle.
- `ASK_CORELYTICS_OPERATIONAL_MANUAL.md` — note that AI narratives honor
  active currency.
- `ENVIRONMENT_BRANCH_DB_MATRIX.md` — note FX provider env var.
- New: `MULTI_CURRENCY_OPERATIONAL_NOTES.md` once Phase 2 is live.

---

## Suggested Sequencing

| Week | Work |
|------|------|
| Week 1 | Phase 1 Steps 1.1 (schema + admin UI), 1.2 (helper + hook). Ship to prod (no behavior change). |
| Week 2 | Phase 1 Step 1.3 Tier A (top 6 high-volume files). Daily PRs. |
| Week 3 | Phase 1 Step 1.3 Tiers B + C, Step 1.4 (server/email/AI), Step 1.5 (QA). Onboard international canary on staging. |
| Week 4 | Promote canary to prod. Begin Phase 2 (FX feed + conversion helper). |
| Week 5 | Phase 2 reporting-currency toggle + read-path wiring. QA. |
| Week 6+ | Phase 2 production rollout. Begin Phase 3 only when a mixed-currency tenant is committed. |

---

## Open Questions

1. **Locale on user vs. company?** Decision: keep on Company for now.
   Revisit if a single tenant has users in multiple locales.
2. **Currency symbol vs. ISO code in display?** Default to symbol with
   currency code where ambiguous (e.g. `CA$1,234.56` not `$1,234.56`
   for Canadian tenants).
3. **Can Site Admin change currency on a tenant with existing data?**
   Phase 1: yes with confirmation. Phase 3: probably no (lock once
   transactions exist).
4. **Where do we surface "stale FX rate" warnings?** Footer on every
   converted report; alert in Site Admin if cron has not run in 24h.
5. **Do we need historical lock on FX rates used for already-published
   months?** Yes — Phase 3 should snapshot the rate used at publish time
   to a `PublishedReportFxSnapshot` so re-renders are reproducible.
