# Construction Sector Operational Dashboard — Design

**Owner:** Steve  ·  **Status:** Draft for sign-off  ·  **Date:** 2026-04-16

## 1. Goal

Replace the generic construction tabs in the Operational Dashboard with four construction-native tabs that deliver job-level operational and financial visibility, sourced primarily from Trimble Vista Cloud (with a clean fallback to mock data while no Vista customer is live).

## 2. Current State (what we are replacing)

`Company.industrySectorCategory === '23'` currently surfaces these sector tabs (defined in `lib/operations/sector-mock-data.ts → TOP_LINE_BUCKETS_BY_SECTOR['23']`):

| Today's tab | Renderer | Data type | Comment |
|---|---|---|---|
| Cash | `renderCash()` | `cash` | Generic, will remain in Overview / Daily Financials |
| AR | `renderARaging()` | `ar-aging` | Generic |
| AP | `renderAPaging()` | `ap-aging` | Generic |
| **Projects / WIP** | `renderProducts()` | `products` | Generic SKU pipeline reused — wrong shape |
| **Labor & Equipment** | `renderProducts()` | `products` | Same payload as above; duplicate |
| **Backlog / Sales** | `renderCustomers()` | `customers` | Generic customer pipeline |
| **Customers** | `renderCustomers()` | `customers` | Duplicate of above |

The 4 bolded rows are construction-specific labels glued onto generic renderers — no real job-cost model behind them. Cash/AR/AP are sector-neutral and stay in the global tabs (`dashboard`, `daily_financials`, `forecast`) and in the new Billing & Cash tab.

## 3. Target Tab Structure (sector `23` only)

Replace the 4 bolded rows with these 4 construction-native tabs, in **build order** (left-to-right in UI matches build priority):

| # | Tab | Purpose | New `OpsDataType` | New renderer |
|---|---|---|---|---|
| 1 | Job Cost Control | Daily PM/ops view: cost vs budget, code variance, labor | `job-cost-control` | `renderJobCostControl()` |
| 2 | Project Portfolio | Exec view: company-wide job health & margin | `project-portfolio` | `renderProjectPortfolio()` |
| 3 | Commitments & Forecast | Forward-looking commitments, EAC, change orders | `commitments-forecast` | `renderCommitmentsForecast()` |
| 4 | Billing & Cash | Job-level billing, AR, AP, net cash position | `billing-cash` | `renderBillingCash()` |

Cash, AR, AP, Overview, Forecast, Daily Financials remain unchanged in the global tab set so financial screens still work for non-construction users and for the holistic view.

### 3.1 Tab content (one row per table, kept terse — full column lists in the user's brief)

**Job Cost Control**
- Job selector + job header card
- Profitability snapshot (Revised Contract / Cost to Date / Remaining Committed / EAC / Margin %)
- Daily cost vs budget (date × cost type)
- Cost code variance (cost code × budget/actual/committed)
- Cost by type (cost type roll-up)
- Labor detail (date × labor type, OT hours)

**Project Portfolio**
- Portfolio summary (totals + average margin)
- Job profitability table (one row per job)
- Risk flags table (margin %, cost variance, commitment exposure, status)
- Top/bottom jobs by margin

**Commitments & Forecast**
- EAC / forecast summary
- Commitment exposure (Job × Budget/Actual/Committed/Remaining/% Committed)
- Change order impact (Original / Approved CO / Pending CO / Revised)
- Open commitments detail (by vendor/sub)

**Billing & Cash**
- Billing & cash summary (Job × Cost / Billed / Cash Collected / AP / Net Cash)
- AR by job (aging buckets)
- AP by job (aging buckets)
- Collections / payments priority list

## 4. Vista Cloud Resource Map

Resources are pulled via the registry-native Vista Cloud plugin (already built in `lib/accounting-systems/vista-cloud/`). All endpoints follow:

```
https://api.xchange.trimble.com/connect/v1/direct/subscribers/{subscriber_code}/vista/{module}/{version}/data/{resource}/cache/search
```

Auth: `X-Application-Key` header (production + test variants stored per-company).

| New tab | Required Vista resources | Recommended additions |
|---|---|---|
| Job Cost Control | `jc/contract_headers`, `jc/cost_details` | `pr/time_entries`, `jc/contract_items`, equipment management |
| Project Portfolio | `jc/contract_headers`, `jc/cost_details`, `po/po_lines`, `sl/subcontracts` | `jc/contract_items`, PM change-order resources |
| Commitments & Forecast | `po/po_lines`, `sl/subcontracts`, `jc/cost_details`, `jc/contract_headers` | `po/po_headers`, PM change-order resources |
| Billing & Cash | `ar/transaction_lines`, `ap/invoices`, `gl/transactions` | Cash Mgmt, AP payments, customer/vendor master, bank tx |

Trimble defaults several of these endpoints to a 12-month rolling window unless onboarding configures more. The Vista plugin already exposes a per-program `historyMonths` field so we can request the full window when the tenant grants it.

## 5. Data Architecture

### 5.1 New ingestion layer (Phase 2 of construction work — not Phase 1)

When a customer goes live on Vista:

```
Vista Cloud REST API
  └─> lib/vista-cloud/operational-sync.ts        (new) — pulls per-resource via plugin programs
        └─> writes to dedicated construction snapshot tables (new):
            - JobMasterSnapshot
            - JobCostDetailSnapshot
            - JobCommitmentSnapshot
            - JobBillingSnapshot
        └─> /api/operational-data?type=job-cost-control&companyId=… reads those tables
```

Naming and table shapes will be locked in a follow-up data-model doc once we know which Trimble fields the first live customer actually returns.

### 5.2 Phase 1 (immediate): mock-data driven

Until the first Vista customer ships, every new tab reads from synthetic mock data extending the existing pattern in `lib/operations/sector-mock-data.ts`. Add four new builder functions that produce dashboard-ready payloads matching the renderers' contracts:

```
lib/operations/construction-mock-data.ts        (new)
  buildJobCostControlMock(companyId, dateRange) → { jobs[], dailyCost[], costCode[], laborDetail[] }
  buildProjectPortfolioMock(companyId)         → { summary, jobs[], riskFlags[] }
  buildCommitmentsForecastMock(companyId)      → { summary, commitments[], changeOrders[], openCommitments[] }
  buildBillingCashMock(companyId)              → { summary, arByJob[], apByJob[], priority[] }
```

The mocks should be deterministic per `companyId` (seeded RNG) so screenshots/tests don't drift.

### 5.3 API contract

`/api/operational-data` already routes by `type` query param. Add four new branches that:
1. If `Company.forceOperationalMockData === true` OR no Vista connection exists → return mock builder output.
2. Else → query the new construction snapshot tables.

Keeps a single API surface; no separate `/api/construction/*` routes.

## 6. Sector Routing Changes

`OperationsTab.tsx` already merges sector buckets with `daily_financials`, `forecast`, and `dashboard`. Required changes:

1. `lib/operations/sector-mock-data.ts → TOP_LINE_BUCKETS_BY_SECTOR['23']` — replace the 4 generic buckets with: `job_cost_control`, `project_portfolio`, `commitments_forecast`, `billing_cash`. Keep `cash`, `ar`, `ap` if you still want them as standalone tabs (recommendation: drop them for `'23'` since they're now inside Billing & Cash and live in global Daily Financials).
2. `lib/operations/module-registry.ts` — register the 4 new module keys with their `OpsDataType` mapping.
3. `OperationsTab.tsx` — add 4 new `renderXxx()` functions and route the new tab keys to them. Other sectors are unaffected.
4. `lib/operations/sector-layout-defaults.ts` — seed `'23'` layout with the new module list (so Site Admin sector layout editor reflects the change).

## 7. Build Order & Milestones

| Milestone | Scope | Estimate |
|---|---|---|
| **M1 — Scaffolding** | Replace `'23'` bucket list, add 4 empty render stubs, route navigation, add 4 new `OpsDataType` constants. Each tab shows "Coming soon" placeholder. | 0.5 day |
| **M2 — Job Cost Control** | Mock builder + full UI (header, snapshot, daily cost vs budget, cost code variance, cost by type, labor detail). | 1.5 days |
| **M3 — Project Portfolio** | Mock builder + UI (summary, profitability, risk flags, top/bottom). | 1 day |
| **M4 — Commitments & Forecast** | Mock builder + UI (EAC, commitments, change orders, open commitments). | 1 day |
| **M5 — Billing & Cash** | Mock builder + UI (summary, AR by job, AP by job, priority). Wire into global Cash/AR/AP context. | 1.5 days |
| **M6 — Vista ingestion** | Real `lib/vista-cloud/operational-sync.ts` + snapshot tables + Prisma migration + API branch swap. Triggered when first Vista customer signs. | 3-5 days |

Total Phase 1 (M1–M5, mock-driven, ship-ready UI): **~5.5 days**.

## 8. Decisions (locked 2026-04-16)

1. **Cash / AR / AP tabs** — **Keep** standalone for now. Construction sector has 7 tabs total: `cash`, `ar`, `ap`, `job_cost_control`, `project_portfolio`, `commitments_forecast`, `billing_cash`. Revisit after first live customer feedback.
2. **Schedules tab** — Deferred (no defined scope yet). See §10 for a proposed "Schedule Slippage Impact" section that could live inside Project Portfolio if we want lightweight schedule signal without a full schedules tab.
3. **Job Cost Control default view** — All-jobs aggregated rollup at the top of the tab, with a Job picker that drills the lower tables (Daily Cost vs Budget, Cost Code Variance, Cost By Type, Labor Detail) down to a single job. The picker also has an "All Jobs" option to keep the rollup behavior.
4. **Equipment Management** — Mock in M2 as a single Equipment column inside Labor Detail (Date | Labor Type | Hours | Cost | Equipment Hours | Equipment Cost | OT Hours).
5. **PM Change Orders** — Always render the Change Order Impact table in Commitments & Forecast. Show empty-state row "No change orders in scope for the selected period" when there's no data.

## 9. Out of Scope (this design)

- Field-by-field Trimble payload mapping (locked in a follow-up data-model doc once first customer is connected).
- Multi-currency.
- Equipment hour tracking beyond a single labor-table column.
- Forecast/EAC algorithm tuning — initial pass uses straight-line cost-to-complete.
- Drill-down from a portfolio row into a full Job Cost Control view (planned M4-M5 cross-link, but not specified here).

## 10. Proposed: "Schedule Slippage Impact" mini-section (in lieu of a Schedules tab)

A pure scheduling/Gantt experience isn't our wheelhouse — Trimble Vista (and tools like Procore, MS Project, Primavera) own that. But schedule-vs-financial-impact is. Concrete proposal: add a small **Schedule Slippage Impact** card to **Project Portfolio**:

| Job | Scheduled % Complete | Actual % Complete (cost-based) | Slip (days) | Projected Revenue Slip $ | Status |
|-----|---|---|---|---|---|

Where:
- **Scheduled % Complete** comes from job start/end dates + today (or from Trimble Project Management if enabled)
- **Actual % Complete (cost-based)** = `cost to date / EAC`
- **Slip days** = how many days the scheduled-% line is ahead of the actual-% line at today's rate
- **Projected Revenue Slip $** = remaining contract value × (slip days / total job duration), as a rough P&L cash-timing flag

This delivers the financial-pressure signal a Schedules tab would give without committing to an entire scheduling experience. Easy to add as an M3 stretch (Project Portfolio milestone) if you want it.

**Decision (locked 2026-04-16):** Include in M3 backlog. Will be added to Project Portfolio as a 5th card alongside Summary, Job Profitability, Risk Flags, and Top/Bottom Jobs.
