# Multi-Currency Implementation Plan

**Owner:** Engineering
**Status:** Foundation in progress
**Last updated:** 2026-08-11
**Trigger:** Customers need optional alternate-currency reporting while source financials remain stored in the company's accounting/base currency.

---

## Current Product Direction

FinancialScore should remain **source-canonical**. Each company's imported
financial data is stored in the accounting/base currency used by the source
system, such as QBD/QBE/QBO/Xero/Sage. Reporting currency conversion is a
read-side presentation layer, not a mutation of imported accounting data.

### Aug 2026 decisions

| Topic | Decision |
|------|----------|
| Where users set currency | **Company Management → Profile** and **Import Financials** (not left sidebar) |
| FX module | Separate module under `lib/fx/` |
| Free EOD provider | **Frankfurter** (ECB), no API key — `https://api.frankfurter.dev/v1` |
| EOD queue timezone | **America/New_York (EST/EDT)**; Vercel cron `15 11 * * *` UTC |
| Mock company | `baseCurrency = CAD` |

The near-term multi-currency scope is:

- Every company has a configured `baseCurrency`, defaulting to `USD` for
  existing companies (demo/mock → `CAD`).
- Users configure **one optional reporting currency** per company on Profile
  or Import Financials.
- Saving a reporting currency backfills ~3 years of daily EOD rates for the
  pair and the daily cron keeps rates current.
- Historical reports use historical FX rates based on the business date
  (EST calendar date for the EOD job), not the current FX rate.

---

## Daily FX Reporting Plan

### Core Design

Keep imported financial values in the company's `baseCurrency`. When a
reporting currency is configured and differs from base, convert values on the
read side using cached historical FX rates from Frankfurter.

Required company settings:

- `baseCurrency`: ISO 4217 code used by the source accounting system.
- `reportingCurrency`: optional ISO 4217 code.
- `locale`: BCP 47 tag (defaults from currency, e.g. CAD → `en-CA`).

### Company-Level Enablement

1. Open **Company Management → Profile** or **Import Financials**.
2. Set **Base (home) currency** to the accounting books currency.
3. Optionally set **Reporting currency**.
4. Save — triggers FX backfill for `baseCurrency → reportingCurrency`.
5. Daily cron `/api/cron/sync-fx-rates` loads the prior EST calendar day's rate.

### FX Provider And Cache

**Provider: Frankfurter** (free, no API key).

- Historical: `GET /{date}?from=USD&to=CAD`
- Range: `GET /{start}..{end}?from=USD&to=CAD`
- Env override: `FRANKFURTER_API_BASE` (default `https://api.frankfurter.dev/v1`)

Rates are stored in `FxRate` (see schema). Weekend/holiday policy: use the most
recent prior available FX date and mark fallback metadata.

### EST EOD Timing

- Rate dates are **America/New_York** calendar dates stored as UTC midnight.
- Cron runs at **11:15 UTC** daily (~06:15 EST / 07:15 EDT) so the prior EST
  day is complete and ECB/Frankfurter data is usually published.
- The job targets `previousEstCalendarDate()` and stores the provider's
  published date (may be prior business day on weekends).

### Implementation Phases

1. **Schema and settings** — landed (`baseCurrency`, `reportingCurrency`, `locale`, `FxRate`)
2. **FX loader** — landed (`lib/fx`, cron, backfill on save)
3. **Conversion service** — landed (`convertAmount` / `getRateForDate`); wire into report APIs next
4. **API response metadata** — pending
5. **UI formatting** — `lib/format/currency.ts` landed; replace hardcoded `$` call sites next
6. **Reports, exports, and AI narratives** — pending
7. **Operational controls** — pending (admin FX coverage diagnostics)

---

## Base-Currency Reporting Implementation Plan

### Product Rules

| Rule | Decision |
|------|----------|
| Canonical stored currency | Source/base currency |
| Default company behavior | Base currency only; existing companies default to USD; demo → CAD |
| Additional currency count | One optional reporting currency per company |
| Who configures it | Company admin on Profile / Import Financials |
| Where configured | Company Management Profile + Import Financials (not sidebar) |
| FX history window | Three years of daily EOD rates on enable |
| Conversion purpose | Display/reporting only |
| Historical data | Apply historical FX, not today's rate |

### Testing Plan

- USD-only companies remain unchanged when reporting currency is blank.
- Demo/mock company shows `baseCurrency = CAD`.
- Saving CAD reporting on a USD company stores Frankfurter history for USD→CAD.
- Daily cron stores prior EST date rates for active pairs.
- Weekend dates resolve to prior published rate with fallback metadata.

---

## Executive Summary

Corelytics was USD-only at the display layer. Foundation for multi-currency is
now in the repo:

| Phase | Scope | Status |
|------|------|--------|
| **1. Tenant currency settings + formatter** | Base/reporting fields, Profile + Import UI, `formatMoney` | Settings landed; formatter rollout pending |
| **2. FX rates + reporting conversion** | Frankfurter EOD cache, EST cron, convert helpers | Cache + cron landed; report wiring pending |
| **3. Multi-currency at the transaction level** | Mixed-currency AR/AP | Future |

**Strategy:** Work lands on `main` behind per-company fields. Defaults (`USD` /
`en-US`) keep existing tenants unchanged. Demo workspaces use **CAD**.

For detailed Phase 1–3 checklists and call-site inventories that remain, see the
sections below (historical plan body retained for sequencing).

---

## Guiding Principles

1. **Default = current behavior.** Every migration sets `baseCurrency='USD'`
   and `locale='en-US'`. Existing tenants render identically post-deploy.
2. **One central formatter.** Replace duplicated `formatCurrency` helpers with
   `lib/format/currency.ts` (`formatMoney`).
3. **Small PRs, file by file.** Each PR independently revertable.
4. **Display ≠ conversion.** Settings + labels first; FX conversion on read paths second.
5. **FX is a separate module** (`lib/fx`), not buried in accounting adapters.

---

## Data Model Foundation (lands with Phase 1)

```prisma
model Company {
  // ...existing fields...
  baseCurrency      String  @default("USD")  // ISO 4217 code used by source books
  reportingCurrency String?                 // optional alternate reporting currency
  locale            String  @default("en-US") // BCP 47 locale tag
}
```

- `baseCurrency` = the currency the company keeps its books in.
- `reportingCurrency` = optional alternate display/reporting currency.
- `locale` = number/date formatting (`1,234.56` vs `1.234,56`).
- No separate `multiCurrencyEnabled` boolean. The presence of
  `reportingCurrency` is the reporting-currency flag.

A single migration adds two columns with defaults; zero behavior change at
deploy time.

---

## Phase 1 — Tenant-Aware Display Formatting

**Goal:** A non-USD company sees its books labeled in its own currency
end-to-end. No FX conversion. Existing USD tenants are unaffected.

### Step 1.1 — Schema + Site Admin UI (~0.5 day)

- Migration: add `baseCurrency`, `reportingCurrency`, and `locale` to `Company`.
- Site Admin → Company Settings: two dropdowns.
  - **Base Currency** (curated ISO 4217 list, default `USD`).
  - **Reporting Currency** (optional curated ISO 4217 list).
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
| HKD - Hong Kong Dollar | zh-HK / en-HK |
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
  const currency = company?.activeReportingCurrency ?? company?.baseCurrency ?? 'USD';
  const locale = company?.locale ?? 'en-US';
  return useMemo(() => ({
    fmt: (v: number) => formatCurrency(v, { currency, locale }),
    fmtCompact: (v: number) => formatCurrency(v, { currency, locale, compact: true }),
  }), [currency, locale]);
}
```

`FinancialDataContext` (`app/contexts/FinancialDataContext.tsx`) is updated
to expose `baseCurrency`, `reportingCurrency`, active reporting currency, and
`locale` on the company object.

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

For server-side (API routes, email, AI prompts): pass the active reporting
currency, `baseCurrency`, and `locale` into `formatCurrency()` directly.

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

- Provision a demo company on staging with `baseCurrency='CAD'`, `locale='en-CA'`.
- Verify rendering in: dashboard, operations, billing, covenants, valuation
  previews, forecasts, performance analytics, MDA, AI narratives, weekly
  emails, exports.
- Verify USD demo company is byte-identical to pre-change.

### Phase 1 Definition of Done

- [ ] Migration applied; every existing company defaults to `USD` / `en-US`.
- [ ] Site Admin Company Settings exposes Base Currency, Reporting Currency, and Locale dropdowns
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
currency than the tenant's base currency (e.g. portfolio view of a CAD
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
  provider       String   // 'open_exchange_rates' | 'manual' | 'erp'
  rateType       String   // 'daily_eod' | 'provider_transaction'
  isFallback     Boolean  @default(false)
  fallbackFromDate DateTime?
  createdAt      DateTime @default(now())
  @@unique([rateDate, fromCurrency, toCurrency])
  @@index([fromCurrency, toCurrency, rateDate])
}
```

### Step 2.2 — FX feed integration (~1 day)

**Provider: start with Open Exchange Rates behind a provider abstraction**

Reasoning vs. ECB:
- ECB is EUR-base only (need triangulation for non-EUR pairs).
- ECB has no weekend rates.
- Open Exchange Rates gives 170+ currencies and daily historical endpoints.
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
- **Daily P&L / cash flow** = convert each daily value using that day's EOD
  rate, then sum.
- **Monthly-only P&L** = monthly average only when daily source data is not
  available.
- **Balance sheet** = snapshot-date or period-end EOD rate.
- **AR/AP detail** = transaction-date rate, falling back to most recent prior
  available rate when the market date is missing.
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
- Defaults to the company's `baseCurrency`.
- Selection stored in user preference per company (so a viewer can pick a
  default reporting currency for portfolio tenants).
- A subtle "as-of FX: 2026-04-24, source: Open Exchange Rates" note in the
  report footer when the active currency != base currency.
- A banner "Showing values converted from CAD using historical daily FX rates"
  when conversion is active.

### Step 2.5 — Wire conversion into report read paths (~1.5 days)

Touch the read-side of each major report to:
1. Detect if reporting currency != base currency.
2. If so, convert each amount using the appropriate rate type.
3. Emit a meta block with the rate(s) used so the UI can show provenance.

Affected read paths (rough list — finalize during Step 2.5):
- `app/api/master-data/route.ts`
- `app/api/billing/reports/period/route.ts`
- `app/api/performance-analytics/run/route.ts`
- `app/components/operations/*` (data fetch hooks)
- `app/components/billing/*` (data fetch hooks)
- `app/covenants/calculations/index.ts` (decide policy: convert covenant
  thresholds too, or keep covenants in base currency only?)

**Recommendation:** Covenants stay in base currency (lender contracts are
denominated in a specific currency). Add an explicit indicator if the
viewer toggles to a non-base currency on a covenant page.

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
- New `Company.baseCurrency` distribution surfaced on Site Admin overview
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
