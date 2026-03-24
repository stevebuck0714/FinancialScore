# Company Pulse - Operational Description

## Purpose

Company Pulse is the daily operating-risk front door for company users.  
In the current implementation, Company Pulse is delivered through the `daily-alerts` view and is designed to surface:

- new day-over-day deterioration signals
- unresolved critical findings from performance analytics
- currently-open critical operating conditions

The goal is fast triage and drill-through into the right workspaces.

---

## 1) Where Company Pulse Lives

- Header nav label: `COMPANY PULSE`
- Navigation target: `daily-alerts`
- Main component: `app/components/operations/DailyAlertsView.tsx`
- Render entrypoint: `app/page.tsx` (current view branch for `daily-alerts`)

If no company is selected, Company Pulse shows a guard state (no data).

---

## 2) Data Inputs and APIs

Company Pulse is computed from live API pulls on load.

### 2.1 Operational datasets

`DailyAlertsView` fetches:

- `/api/operational-data?type=ar-aging&frequency=daily`
- `/api/operational-data?type=ap-aging&frequency=daily`
- `/api/operational-data?type=cash&frequency=daily`

Default detection window for alert generation is the last 7 days.

### 2.2 Critical findings feed

It also fetches:

- `/api/performance-analytics/findings?severity=critical`

Resolved states are filtered out using:

- `resolved`, `realized`, `closed`, `done`, `complete`, `completed`

Only unresolved critical findings are converted into Pulse alert items.

### 2.3 Priority focus terms

It fetches operational goals:

- `/api/operational-goals?companyId=<id>`

Then reads special watchlist terms from:

- `goals.__focusWatchlist`

These terms are used to:

- inject "Priority Focus Watch" alert rows
- boost scoring for matching alerts

---

## 3) Alert Types and Detection Logic

Company Pulse builds alerts from three sources:

- `daily-change` (new deterioration vs prior day)
- `open-critical` (critical condition still active now)
- `unresolved` (open critical findings from Performance Analytics)

### 3.1 Daily-change triggers

#### AR deterioration

Computed from latest two daily AR snapshots:

- `latestOver30` = `(days1to30 + days31to60 + days61to90 + days90plus) / totalAR * 100`
- `deltaPts` = `latestOver30 - prevOver30`

Trigger condition:

- `latestOver30 >= 30` **and** `deltaPts >= 2`

Generated alert:

- title: `AR Deteriorated Today`
- owner: `Collections Lead`
- drill view: `pa-critical-issues`

#### AP deterioration

Equivalent AP logic:

- `latestOver30 >= 30` **and** `deltaPts >= 2`

Generated alert:

- title: `AP Pressure Increased Today`
- owner: `AP Manager`
- drill view: `pa-critical-issues`

#### Cash deterioration (total)

From daily total cash day-over-day:

- `pct = ((latest - previous) / previous) * 100`

Trigger condition:

- `pct <= -5`

Generated alert:

- title: `Cash Dropped Today`
- owner: `Controller`
- drill view: `pa-critical-issues`

#### Cash deterioration (account-level)

Per cash account name:

- account day-over-day `%` change

Trigger condition:

- account change `<= -8%`

Generated alert:

- title: `Cash Account Worsened Today`
- owner: `Controller`
- includes `itemLabel = accountName`

### 3.2 Open-critical conditions

Built from current summary levels even if not newly worsened:

#### AR quality critical

Trigger:

- `arOver30 >= 35` **or** `dso >= 50`

Alert:

- `Outstanding Critical: AR Quality`

#### AP pressure critical

Trigger:

- `apOver30 >= 35`

Alert:

- `Outstanding Critical: AP Pressure`

#### Cash risk critical

Inputs:

- `cashChangePct` from cash summary
- runway proxy:
  - `burnProxy = max(1, abs(changeAmount))`
  - `runwayWeeks = (totalCash / burnProxy) * 4.33`

Trigger:

- `cashChangePct <= -10` **or** `runwayWeeks < 8`

Alert:

- `Outstanding Critical: Cash Risk`

### 3.3 Unresolved Performance Analytics findings

Each unresolved critical finding becomes a Pulse alert:

- source: `unresolved`
- title/detail from finding payload/metric
- drill target:
  - anomaly findings -> `pa-anomaly-inbox`
  - others -> `pa-critical-issues`

---

## 4) Priority Scoring and Bucketing

Each built alert is scored and bucketed.

### 4.1 Base scoring

`scoreAlert(alert)` applies:

- source weight:
  - `open-critical`: +85
  - `daily-change`: +75
  - `unresolved`: +55
- percent magnitude boost:
  - extracts largest `%` from detail, adds up to +10
- recency adjustment:
  - updated <= 2 days: +5
  - updated >= 14 days: -10
- cash/runway keyword boost: +5

Score is clamped to `0..100`.

### 4.2 Priority focus boost

If alert text matches a configured focus term from `__focusWatchlist`:

- `+20` bonus added
- matched term is attached to alert (`priorityFocusTerm`)

### 4.3 Bucket assignment

- `attention` if `priorityScore >= 70`
- otherwise `monitoring`

Display summary chips:

- Needs Attention count
- Monitoring count

---

## 5) Trend Preview Subsystem (KPI Preview)

Each alert can expose one or more preview trend links (90-day daily trend).

### 5.1 Preview metrics

Supported metrics:

- AR:
  - `AR >30d %`
  - `DSO`
  - `Total AR`
- AP:
  - `AP >30d %`
  - `Total AP`
- Cash:
  - `Cash Balance`
  - `Runway Weeks`
  - account-specific cash balance when `itemLabel` is present

### 5.2 Preview data flow

When opening preview:

1. fetch 90 days of daily ops records from `/api/operational-data`
2. normalize and aggregate by date
3. compute trend points
4. render sparkline and quick narrative

Narrative compares latest value to approximately 7-day baseline.

---

## 6) Drill-through and Navigation

Alerts include `drillView` targets used by `onNavigate(...)`.

Current drill targets:

- `pa-critical-issues`
- `pa-anomaly-inbox`
- `pa-overview`

This keeps Company Pulse as triage, while deep analysis is done in Performance Analytics views.

---

## 7) Security and Tenant Controls

Company Pulse relies on tenant-safe API layers:

- `requireAuth()` checks
- `validateCompanyAccess(companyId)` checks
- forbidden access is auditable (`auditForbiddenAccess`)

So all operational pulls and findings reads remain company-scoped.

---

## 8) Operational Characteristics

- **Computation model:** live, in-memory composition at request time (not persisted Pulse rows).
- **Primary intent:** prioritize immediate action and unresolved risk.
- **Refresh pattern:** recomputed when component loads for selected company.
- **Dependency chain:** operational snapshots + findings quality directly affect Pulse quality.

---

## 9) Known Limits

- Thresholds are heuristic and currently hardcoded in the view logic.
- Alert acknowledgment/assignment workflow is not yet a persisted lifecycle in Pulse itself.
- Some metrics use simple proxies (e.g., runway derived from recent change amount).
- Quality depends on availability and freshness of daily snapshots.

---

## 10) Recommended Enhancements

1. Move threshold values to configurable company/sector policy settings.
2. Add persistent alert state (new/acknowledged/snoozed/resolved) with owner history.
3. Add explicit SLA/freshness indicators for each upstream data source.
4. Add explainability panel showing exact trigger formula and threshold hit.
5. Add notification routing (email/slack) for high-priority `attention` items.

