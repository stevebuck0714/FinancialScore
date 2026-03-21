# Product Margin Weekly Reporting Implementation Plan

## Objective
Deliver weekly product margin reporting in the Operational Hub `Products` tab, with published metrics and rendered charts available by **Saturday 8:00 AM local time** for the prior closed week.

## Scope
- Compute and publish weekly product margin by `Item`, `Site/Division`, and `Customer`.
- Surface KPIs, trend visualizations, and exception reporting in the `Products` tab.
- Reconcile reporting totals with finance-approved revenue and cost logic.
- Provide export-ready report outputs for business review.

## KPI Definitions (Finance Sign-Off Baseline v1)
- `Revenue`: `ExtPrice`, net of line-level discounts.
- Revenue exclusions: taxes excluded, freight excluded, misc charges excluded.
- Non-product amounts tracked separately:
  - freight billed tracked as separate metric,
  - misc charges tracked as `Other Revenue` metric.
- `COGS` hierarchy for v1:
  1. invoice-line cost field from `SLInvItems` (preferred),
  2. fallback to `QtyInvoiced * UnitCost` from `SLItemCosts`.
- `Returns/Credits`: negative revenue and negative COGS included in period (net view).
- `Margin Amount`: `Revenue - COGS`.
- `Margin %`: `Margin Amount / Revenue`.
- Date rule for periodization: invoice date.
- Rounding rule: store raw values; display currency to 2 decimals and percentage to 1 decimal.
- Edge case: if revenue is zero, margin percentage is `NULL`.

## Reporting Grain and Dimensions
- Grain: `WeekStartDate + Item + Site + Customer`.
- Core dimensions:
  - `Item` (SKU, description, product code/category),
  - `Site` (division view),
  - `Customer`,
  - `Calendar` (week, month, quarter).
- Minimum history at go-live: prior 52 weeks.

## Source Data Plan (Infor CSI)
- Revenue (primary): `SLInvItems` (and `SLInvHdrs` as needed for header attributes).
- Item metadata: `SLItems`.
- Cost source:
  - v1: invoice-line cost if available, else `SLItemCosts`.
  - v2+: move to transaction-accurate cost source for tighter margin timing accuracy.
- Critical treatment rules:
  - include credit memos/returns,
  - define discount/freight/tax handling,
  - enforce `Item + Site` keying to avoid cross-site duplication.

## Finance Sign-Off Matrix
- Revenue:
  - Product revenue: include.
  - Line discounts: include as netted effect in `ExtPrice`.
  - Taxes: exclude.
  - Freight billed: configurable (default excluded until finance opts in).
  - Misc charges: configurable (default excluded until finance opts in).
- COGS:
  - Primary: invoice-line cost on `SLInvItems`.
  - Fallback: `QtyInvoiced * UnitCost` from `SLItemCosts`.
- Returns:
  - Include in net margin view (negative revenue and negative COGS).
  - Also publish supporting metrics: Gross Revenue, Returns, Net Revenue.
- Period date:
  - Use invoice date for weekly reporting buckets.

## Canonical Data Model
- Fact table: `fact_product_margin_weekly`
  - `week_start_date`
  - `item_id`
  - `site_id`
  - `customer_id`
  - `qty_invoiced`
  - `revenue`
  - `cogs`
  - `margin_amount`
  - `margin_pct`
- Dimensions:
  - `dim_item`
  - `dim_site`
  - `dim_customer`
  - `dim_calendar`

## ETL / Processing Workflow
1. Extract posted invoices and supporting dimensions incrementally.
2. Resolve cost using approved hierarchy.
3. Apply returns and adjustments.
4. Calculate transaction-level margin.
5. Aggregate to weekly grain for reporting.
6. Publish derived datasets for UI rendering.
7. Run reconciliation and quality checks.

## Publish Cadence and SLA
- Reporting week closes Friday end-of-day **EST**.
- Automated run start: **Saturday 2:00 AM EST**.
- Publish deadline: **Saturday 8:00 AM EST**.
- SLA:
  - data freshness: complete prior week by deadline,
  - success notification: sent on completion,
  - failure alert: immediate escalation to engineering + operations owner.

## Products Tab Deliverables
Create a dedicated `Product Margins` section in the Operational Hub `Products` tab:

- KPI cards:
  - Weekly Revenue
  - Weekly COGS
  - Weekly Margin $
  - Weekly Margin %
- Rendered charts:
  - Weekly margin trend (line chart, 12- and 52-week options)
  - Top/Bottom margin movers (bar chart, week-over-week deltas)
  - Margin by division/site (stacked bar or heatmap)
  - Negative margin watchlist trend (count over time)
  - Revenue bridge chart (Gross Revenue -> Returns -> Net Revenue), available by toggle
- Data grids:
  - Margin by item (sortable/filterable)
  - Margin by customer/division
  - Exception list (negative margin, missing cost, outliers)
- Filters:
  - week range, item/category, site/division, customer.
- Actions:
  - CSV export,
  - print-friendly snapshot/PDF export.
- View behavior:
  - default view: net margin metrics
  - toggle: `Show Revenue Bridge` to expose gross/returns/net decomposition

## Data Quality and Reconciliation Controls
- Automated checks:
  - duplicate invoice line detection,
  - null or missing cost coverage,
  - zero-revenue/nonzero-cost exceptions,
  - invalid key joins (item/site/customer).
- Reconciliation checks:
  - weekly Revenue tie-out to finance baseline,
  - weekly COGS tie-out to finance baseline,
  - variance threshold and exception workflow:
    - `< 0.5%`: acceptable
    - `0.5% - 1.0%`: warning
    - `> 1.0%`: investigate before final sign-off
- Trust controls in UI:
  - last refresh timestamp,
  - data quality status indicator,
  - reconciliation pass/fail status.

## Build Lock Status
- Locked decisions:
  - freight excluded from revenue/margin and tracked separately,
  - misc charges excluded from revenue/margin and tracked as `Other Revenue`,
  - default report view is net, with optional `Show Revenue Bridge` toggle,
  - reconciliation thresholds set to acceptable/warning/investigate bands,
  - schedule anchor set to Saturday 2:00 AM EST run start,
  - publish deadline enforced at Saturday 8:00 AM EST for all tenants.
- Remaining implementation confirmations:
  - none; v1 definition is fully locked.

## Implementation Phases

### Phase 1 - Definition and Mapping (Week 1)
- Finalize KPI definitions and adjustment rules.
- Document source-to-target mapping.
- Confirm timezone and week-close conventions.
- Output: signed `Margin Logic Spec`.

### Phase 2 - Data Pipeline Build (Weeks 2-3)
- Build incremental extracts and canonical fact population.
- Backfill last 52 weeks.
- Add scheduling and run monitoring.
- Output: stable weekly dataset.

### Phase 3 - Controls and Validation (Week 4)
- Implement quality checks and reconciliation jobs.
- Validate top SKUs and divisions with finance.
- Output: approved variance tolerance and exception playbook.

### Phase 4 - Products Tab Integration (Weeks 5-6)
- Implement API/data access layer for charts and grids.
- Build UI cards, charts, and drill-down tables.
- Add exports and filter state persistence.
- Output: UAT-ready reporting experience in `Products` tab.

### Phase 5 - Go-Live and Hypercare (Week 7)
- Enable Saturday production schedule.
- Run parallel validation for two cycles.
- Monitor exceptions and tune thresholds.
- Output: production launch with support runbook.

## Roles and Ownership
- Finance: KPI definition, reconciliation sign-off.
- Operations: requirements, exception triage, adoption.
- Data/Engineering: ETL, data model, scheduling, monitoring.
- Product/UX: chart design and tab integration behavior.

## Acceptance Criteria
- Weekly report publishes by Saturday 8:00 AM for two consecutive cycles.
- Margin metrics available by item, site/division, and customer.
- Chart rendering and filters perform within target response time.
- Reconciliation variances are within agreed thresholds.
- Negative-margin and data exceptions are visible and actionable.

## Risks and Mitigations
- Cost timing mismatch vs invoice date:
  - mitigate with explicit method labeling and staged upgrade path.
- Multi-site item duplication:
  - enforce composite keys including site.
- Incomplete return/credit handling:
  - include return logic in v1 validation gates.
- Stakeholder trust risk:
  - publish reconciliation status in report UI.

## Immediate Next Steps
1. Approve v1 cost method for initial release (invoice cost fallback already defined).
2. Start source-to-target mapping and pipeline build.
3. Implement Products tab net-default with revenue bridge toggle.
4. Configure scheduler and alerts for 2:00 AM to 8:00 AM EST execution window.
