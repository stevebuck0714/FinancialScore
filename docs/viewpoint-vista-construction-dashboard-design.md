# Viewpoint Vista — Construction Operational Dashboard

**Status:** Design v1
**Author:** Engineering
**Last updated:** 2026-04-17
**Audience:** Engineering, Product, Construction-sector pilot stakeholders

---

## 1. Goal & Scope

Replace the current generic operational tabs for Construction-sector tenants
(`Projects/WIP`, `Labor/Equipment`, `Backlog/Sales`, `Customers`) with a
purpose-built, job-centric dashboard sourced from **Trimble Viewpoint Vista**
via the Vista Direct API.

### v1 Tab Layout (4 tabs, Schedule punted to v2)

| # | Tab | Audience | Primary Question |
|---|---|---|---|
| 1 | **Project Portfolio** | Owner / CFO | Which jobs make money? Where is exposure? |
| 2 | **Job Cost Control** | PMs / Ops | What happened today? Where are we overrunning? |
| 3 | **Commitments & Forecast** | PM / CFO | What cost is still coming? What will final margin be? |
| 4 | **Billing & Cash** | CFO / Controller | Are we getting paid? Where is cash pressure? |

Schedule is delivered in v1 as a "Schedule risk" strip on **Project Portfolio**
(top jobs by days slipped). It graduates to a 5th dedicated tab in v2 once
Vista PM module enablement is confirmed and we've validated data quality with
a live tenant.

### Build Order (v1)

1. **Job Cost Control** (depends on `JC/Cost Details` — the longest pole)
2. **Project Portfolio**
3. **Commitments & Forecast**
4. **Billing & Cash**

Each tab is gated on the Vista resources it needs (see §6). Tabs degrade
gracefully with empty-state messaging when a resource is not enabled in the
tenant.

---

## 2. Out of Scope (v1)

- Schedule as its own tab (v2; v1 has the Portfolio strip only)
- Cash-collected-by-job allocation (requires AR receipt → invoice → job
  trace; defer to v2)
- Bonding capacity, lien filing deadlines, COI expirations
- Equipment Management module (optional; only if tenant asks)
- Pending-CO-impacted projected margin scenarios (column shown, scenario
  toggle deferred)
- Multi-currency / multi-company consolidation

---

## 3. Data Model

Six new core entities live alongside the existing `Company` /
`AccountingConnection` infrastructure. All are scoped by `companyId` +
`accountingConnectionId`. Source-of-truth is the Vista tenant; we cache and
denormalize for query performance.

### 3.1 `Job` (Vista: JC/Contract Headers)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | Internal |
| `companyId` | uuid | FK |
| `sourceJobNo` | string | Vista Job No. (stable per tenant) |
| `name` | string | |
| `status` | enum | `OPEN`, `CLOSED`, `ON_HOLD` |
| `pmName` | string | |
| `customerName` | string | |
| `originalContract` | decimal(18,2) | |
| `revisedContract` | decimal(18,2) | OriginalContract + ApprovedCOs |
| `startDate` | date | |
| `projectedFinishDate` | date | If PM module enabled |
| `baselineFinishDate` | date | If PM module enabled |
| `lastSyncedAt` | timestamptz | |

### 3.2 `JobCostCode` (Vista: JC/Contract Items)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `jobId` | uuid | FK |
| `costCode` | string | |
| `description` | string | |
| `costType` | enum | `LABOR`, `MATERIAL`, `EQUIPMENT`, `SUB`, `OTHER` (tenant-mappable) |
| `phase` | string \| null | If tenant uses phase coding |
| `originalBudget` | decimal(18,2) | |
| `revisedBudget` | decimal(18,2) | |

### 3.3 `JobCostDetail` (Vista: JC/Cost Details — **largest table, partition**)

| Field | Type | Notes |
|---|---|---|
| `id` | bigserial (pk) | |
| `jobId` | uuid | FK |
| `jobCostCodeId` | uuid | FK |
| `transactionDate` | date | Partition key |
| `costType` | enum | Denormalized from cost code |
| `amount` | decimal(18,2) | |
| `hours` | decimal(10,2) \| null | For labor/equipment |
| `vendorRef` | string \| null | |
| `sourceRecordId` | string | Vista line key — **unique** per tenant |

**Indexes:** `(jobId, transactionDate)`, `(jobCostCodeId, transactionDate)`,
partial unique on `sourceRecordId WHERE sourceRecordId IS NOT NULL`.

**Partitioning:** by `transactionDate` monthly. Anticipate 100k–10M rows per
year per tenant depending on size.

### 3.4 `Commitment` (unifies Vista PO/PO Lines + SL/Subcontracts)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `jobId` | uuid | FK |
| `jobCostCodeId` | uuid \| null | FK |
| `commitmentType` | enum | `PO`, `SUBCONTRACT` |
| `vendorName` | string | |
| `referenceNo` | string | PO# or SL# |
| `originalAmount` | decimal(18,2) | |
| `incurredAmount` | decimal(18,2) | Cost-to-date against this commitment |
| `remainingAmount` | decimal(18,2) | Computed |
| `dueDate` | date \| null | |
| `status` | enum | `OPEN`, `CLOSED` |

### 3.5 `ChangeOrder`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `jobId` | uuid | FK |
| `coNumber` | string | |
| `status` | enum | `APPROVED`, `PENDING`, `REJECTED` |
| `amount` | decimal(18,2) | |
| `submittedDate` | date | |
| `approvedDate` | date \| null | |
| `description` | string | |

**Rule:** `APPROVED` rolls into `Job.revisedContract`. `PENDING` is shown but
does not change Revised Contract. Projected-margin column uses Revised; a
separate "with pending COs" scenario column is v2.

### 3.6 `JobBudgetSnapshot` (optional, daily)

Stored daily so we can show budget-trend; mirrors the Job + Cost Code budget
state at end-of-day. If Vista's budget revision history is unreliable, this
becomes our source of truth for "budget changed when?" investigations.

---

## 4. Calculation Methodology

These are **our** decisions, not Vista fields. Document them in the UI as
tooltips on every column header.

### 4.1 EAC (Estimate at Completion)

**Default:** `EAC = Cost-to-Date + Remaining Committed + Remaining Budget Not Yet Committed`

Where `Remaining Budget Not Yet Committed = max(0, RevisedBudget − CTD − RemainingCommitted)`.

Alternative methods (PM-selectable in v2):
- **CPI-based:** `EAC = RevisedBudget / CPI` where `CPI = EarnedValue / CTD`
- **PM Override:** manual entry on the Job

### 4.2 % Complete

**Default:** Cost-based: `CTD / EAC`

Alternatives (v2):
- Physical: PM enters per cost code
- Schedule-based: from PM module if enabled

### 4.3 WIP (Work-in-Process)

**WIP = EarnedRevenue − BilledToDate**

Where `EarnedRevenue = (CTD / EAC) × RevisedContract`.

- WIP > 0 → **Underbilled** (we've done work we haven't billed)
- WIP < 0 → **Overbilled** (we've billed ahead of work)

WIP appears as a column on Project Portfolio AND on Billing & Cash.

### 4.4 Projected Profit & Margin

```
ProjectedProfit = RevisedContract − EAC
ProjectedMargin% = ProjectedProfit / RevisedContract
```

### 4.5 Risk Flags (deterministic, no vibes)

A job is flagged on Portfolio when **any** of:

- `ProjectedMargin% < (originalMargin% − 5pts)` → **Margin Drift**
- `CTD / RevisedBudget > 1.05` → **Cost Overrun**
- `% Committed > 100%` (CTD + RemainingCommitted > RevisedBudget) → **Commitment Overrun**
- `% Complete > 90% AND WIP > 5% of RevisedContract` → **Underbilled / Closeout Risk**
- `DaysSlipped > 30` (if schedule data available) → **Schedule Risk**

Thresholds tenant-overridable in v2.

---

## 5. Tab Specs

All tables described in the original brief are accepted; deltas and clarifications below.

### 5.1 Project Portfolio

**Add to Job Profitability table:**
- `WIP $` and `WIP %` columns (between Margin % and risk flags)
- `Days Slipped` column (if schedule available; nullable)

**Add Schedule risk strip** (top of tab, above Job Profitability):
- Top 5 jobs by `Days Slipped` (when available)
- One-line summary: "3 jobs > 30 days behind, 1 job > 60 days behind"
- Empty state: "Schedule data not available — enable Vista PM module to see schedule risk"

### 5.2 Job Cost Control

**Top selector adds:**
- Job picker (required)
- Date range (default last 30 days, max last 12 months)

**Cost-by-type:** Render as horizontal bar chart, not table. Include
`% of Total` as bar label.

**Labor detail:** Collapsed by default. Header shows "Requires PR/Time Entries
— [enable to view]" if not available.

### 5.3 Commitments & Forecast

**Add per-job commitment burn chart (mini-sparkline)** in the Commitment Exposure
table, showing `IncurredAmount / OriginalAmount` over time. Predicts overruns
better than a snapshot.

**Open Commitments table:** Add filter chips for `PO` / `Subcontract` / `All`.
Default sorted by `Remaining Amount DESC`.

### 5.4 Billing & Cash

**Drop:** "Cash Collected" column from billing summary (deferred to v2).

**AR by Job table** — add columns:
- `Retention` (separate from Current/30/60/90+)
- `% Retention of Total AR`

**AP by Job table** — add footer row:
- "Unallocated AP (overhead/G&A)" — total AP not coded to a job
- This makes the columns reconcile to total AP

**Net Cash by Job:** Replace with **"Job Cash Position"** = `BilledToDate − APOnJob`. Acknowledge in tooltip this excludes cash receipts (v2).

---

## 6. Vista Resource Requirements & Tenant Gating

Per Trimble's onboarding model, customers only get the resources enabled in
their tenant. The dashboard must gracefully degrade.

### 6.1 Required (each tab disabled if not present)

| Resource | Tabs requiring it |
|---|---|
| `JC/Contract Headers` | All tabs |
| `JC/Contract Items` | Portfolio, JCC, C&F |
| `JC/Cost Details` | All tabs (core grain) |
| `PO/PO Headers` + `PO/PO Lines` | C&F |
| `SL/Subcontracts` | C&F |
| `AR/Transaction Lines` | B&C |
| `AP/Invoices` | B&C |
| `GL/Transactions` | B&C (reconciliation only) |

### 6.2 Recommended (degrade gracefully)

| Resource | Adds |
|---|---|
| Project Management — Pending Change Orders | Pending CO column on Portfolio + C&F |
| Project Management — Schedule | Schedule strip on Portfolio (v1), Schedule tab (v2) |
| `PR/Time Entries` | Labor detail panel on JCC |
| Cash Management | Cash receipts trace (v2) |
| Equipment Management | Equipment cost detail on JCC (v2) |

### 6.3 Per-Tenant Resource Gating UX

For every resource-gated UI element:
- **Available + has data:** render normally
- **Available + no data:** "No data in selected window" empty state
- **Not enabled:** disabled state with text "Ask your Vista admin to enable
  `<resource name>` to see this report" + link to docs
- Tenant resource availability is fetched once on connection and cached on
  the `AccountingConnection`. Re-checked on a 24h cadence.

---

## 7. Trimble Vista Direct API — Engineering Conventions

### 7.1 Connection / Auth

- New `accountingConnection.platform = 'viewpoint_vista'`
- OAuth2 / API key per Trimble's current Direct API auth (TBD — confirm at
  credential intake)
- Per-tenant base URL stored on `AccountingConnection`

### 7.2 The 12-Month Default Window — Mandatory Convention

Several Vista GET endpoints **default to 12 months of history** when no date
parameters are provided. This has caused silent data truncation in other
implementations.

**Convention:** Every Vista fetcher in this codebase **must** pass an
explicit `dateFrom` / `dateTo` (or equivalent). Direct calls without a date
range are forbidden. Lint rule + code review checklist enforced.

Affected endpoints include:
- `AP/Invoices`
- `AR/Transaction Lines`
- `GL/Transactions`
- `JC/Cost Details`
- `PO/PO Headers`
- `SL/Subcontracts`

### 7.3 Resource Selection

Use the **granular** resources, not the broad ones:
- `JC/Contract Headers` + `JC/Contract Items` (not `JC/Contracts`)
- `PO/PO Headers` + `PO/PO Lines` (not `PO/Purchase Orders`)

### 7.4 Idempotency

All Vista-sourced records use Vista's stable line/header IDs as
`sourceRecordId`. Apply the same partial unique index pattern we now use
on `InforRawRecord` to prevent the duplicate-records issue we just cleaned
up on the Infor CSI side.

---

## 8. Mock Data Strategy

For pre-tenant development, demo, and CI tests, seed three reference jobs:

1. **Job A — Early stage** (15% complete, on budget, no commitments overruns)
2. **Job B — Mid stage with overruns** (60% complete, margin drift, pending COs)
3. **Job C — Near completion** (95% complete, underbilled, retention exposure)

Plus:
- 5–10 cost codes per job, all 5 cost types represented
- 90 days of `JobCostDetail` per job
- Mix of POs and subcontracts as commitments
- 1 approved CO + 1 pending CO per job

Lives in `lib/operations/sector-mock-data.ts` keyed under `CONSTRUCTION`.

---

## 9. Accounting Integration UI

This dashboard requires two new admin pages (per stakeholder confirmation —
templates exist, credentials pending):

1. **Accounting Integration page** — adds Viewpoint Vista as a connection
   option alongside existing platforms (Sage Intacct, QuickBooks Desktop,
   Infor CSI, Infor M3). Fields: tenant URL, OAuth/API credentials, company
   ID mapping.
2. **Accounting Programs page** — per-tenant view of which Vista resources
   are enabled, last sync time per resource, row counts. Drives the gating
   logic in §6.3.

Format follows existing pattern (see
`docs/sage-intacct-accounting-integration-settings-intake.md`).

---

## 10. Build Phases & Estimates

| Phase | Scope | Rough Effort |
|---|---|---|
| **0. Setup** | Accounting Integration UI, Accounting Programs UI, Vista connector skeleton, mock dataset | 1–2 weeks |
| **1. JCC tab** | Data model (Job, JobCostCode, JobCostDetail), Vista fetchers for JC resources, JCC tab UI | 2–3 weeks |
| **2. Portfolio tab** | EAC/WIP calculation layer, risk flags engine, Portfolio tab UI, Schedule strip | 2 weeks |
| **3. C&F tab** | Commitment unification, ChangeOrder model, C&F tab UI, commitment burn charts | 2 weeks |
| **4. B&C tab** | AR/AP fetchers, retention handling, B&C tab UI | 1.5 weeks |
| **5. Hardening** | Per-tenant gating UX, rate limiting, error handling, mock → real swap, pilot tenant validation | 1–2 weeks |

**Total v1:** ~10–12 weeks engineering for one person, less with parallel
work on Portfolio + B&C once the data model is set.

---

## 11. Open Decisions Before Build

1. **Vista auth model** — confirm at credentials intake (OAuth2 vs API key vs both)
2. **Cost type mapping** — Vista cost types are tenant-customizable. Provide a
   mapping UI on the Accounting Programs page or hard-default to L/M/E/S/O?
3. **Multi-tenant Vista** — does our pilot tenant have one Vista instance or
   multiple? Affects connection model.
4. **Pilot tenant identity** — needed to start mock → real validation in Phase 5.
5. **WIP method confirmation** — cost-based (default in §4.3) vs PM-overridable.
   Confirm with first tenant's CFO.
6. **Retention reporting** — Vista exposes retention on AR transactions.
   Confirm tenant uses Vista's retention fields vs an internal workaround.

---

## 12. v2 / Backlog (Out of v1)

- Schedule tab (5th tab) with critical path, baseline vs current finish per job
- Cash receipts traced to job (true Cash Collected by Job)
- Pending-CO scenario toggle on margin
- PM-overridable EAC and % complete
- Equipment Management cost detail
- Bonding capacity tracker
- Lien filing deadline alerts
- Multi-company consolidation rollup
- Tenant-overridable risk flag thresholds
