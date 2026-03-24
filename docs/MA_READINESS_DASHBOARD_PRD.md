# M&A Readiness Dashboard PRD

## Product Objective

Build a buyer-style M&A Readiness Dashboard that helps SMB leadership assess deal readiness using accounting and operational data already available in Corelytics.

The dashboard must:
- Separate EBITDA normalization from cash-flow and working-capital diligence.
- Explain every metric with transparent formulas and data lineage.
- Surface actionable risk signals, not just descriptive KPIs.
- Produce an overall QoE score with a visible confidence level.

## Users and Use Cases

- Company admin: Understand valuation readiness before outreach to buyers.
- Consultant: Identify diligence risks and build remediation plans.
- Internal operator/finance lead: Track month-to-month movement in deal-critical metrics.

Primary use cases:
- Monthly M&A readiness check-in.
- Pre-LOI quality review.
- Diligence prep packet generation.

## Scope

### In Scope (MVP)

- Four QoE modules:
  - EBITDA Adjustments
  - Revenue Quality
  - Working Capital
  - Cash Flow Quality
- Executive snapshot cards.
- Metric-level trends and threshold-based risk flags.
- QoE score and data-confidence score.
- CSV export of metric audit trail.

### Out of Scope (MVP)

- Full accounting-policy automation for all revenue methods.
- AI-only scoring without deterministic rules.
- Industry benchmarking packs beyond baseline defaults.

## Data Inputs and Dependencies

### Core Financial Inputs

From canonical monthly data:
- Revenue and expense fields
- COGS fields
- Balance sheet fields (AR, inventory, AP, current liabilities, fixed assets, etc.)
- Depreciation and interest fields

Primary source objects:
- `MonthlyFinancial` model (`prisma/schema.prisma`)
- canonical mapping helpers (`lib/financial-canonical.ts`)
- monthly dataset in app state (`app/page.tsx`)

### Optional Inputs (Phase 1.5 / Phase 2)

- Invoice-level records
- Cash receipt timing
- Contract/project milestones
- Customer-level revenue rollups

## Functional Requirements

## Module A: EBITDA Adjustments

Purpose: Normalize earnings for buyer comparability.

Metrics:
- Reported EBITDA
- Addbacks total
- Negative adjustments total
- Adjusted EBITDA
- Adjustment %

Formulas:
- Reported EBITDA = Operating income + D&A (or trusted EBITDA source)
- Adjusted EBITDA = Reported EBITDA + Addbacks - Negative Adjustments
- Adjustment % = (Adjusted EBITDA - Reported EBITDA) / Reported EBITDA

Outputs:
- Current period value
- TTM value
- 12- to 36-month trend
- risk tier

## Module B: Revenue Quality

Purpose: Evaluate reliability and repeatability of revenue.

Metrics:
- Top customer concentration %
- Top 5 concentration %
- Recurring revenue %
- Revenue-to-cash gap %
- Recognition anomaly count

Detection rules (MVP deterministic):
- Revenue growth materially exceeds customer cash collections.
- DSO trend spike beyond threshold.
- AR growth outpaces revenue growth over rolling window.

## Module C: Working Capital

Purpose: Estimate normalized operating working capital and likely close adjustment.

Metrics:
- Operating working capital
- Normalized WC target
- Closing WC proxy
- WC surplus/deficit adjustment
- Working capital intensity %
- Cash conversion cycle

Formulas:
- Operating WC = AR + Inventory + Contract Assets - AP - Accrued Op Liabilities
- Normalized WC target = average Operating WC over trailing N months (default N=12)
- WC adjustment = Closing WC (or latest proxy) - Normalized WC target
- Working capital intensity = Operating WC / Revenue
- CCC = DSO + DIO - DPO

## Module D: Cash Flow Quality

Purpose: Assess whether earnings translate into durable free cash flow.

Metrics:
- Cash conversion %
- Maintenance CapEx estimate
- Maintenance CapEx / EBITDA %
- CapEx gap

Formulas:
- Cash conversion % = Operating Cash Flow / EBITDA
- Maintenance CapEx estimate = max(Depreciation proxy, historical average proxy)
- CapEx gap = Maintenance CapEx estimate - Reported CapEx

## Scoring and Risk Framework

## QoE Score

- Scale: 0 to 100
- Weighted categories:
  - Earnings Quality: 30%
  - Revenue Quality: 25%
  - Working Capital Quality: 20%
  - Cash Flow Quality: 25%
- Missing metric policy: remove unavailable metric weight from denominator.

## Confidence Score

Separate from QoE score; reflects data sufficiency and consistency:
- history length coverage
- field completeness
- anomaly reliability
- recency of data

## Default Risk Thresholds (MVP)

- EBITDA adjustment %: `<10 low`, `10-25 medium`, `>25 high`
- Top customer concentration: `<15 low`, `15-25 medium`, `>25 high`
- Recurring revenue %: `>70 low risk`, `40-70 medium`, `<40 high`
- Cash conversion %: `>80 low`, `60-80 medium`, `<60 high`
- CCC YoY deterioration: `>15 days` triggers risk
- Maintenance CapEx / EBITDA: `<10 low`, `10-20 medium`, `>20 high` (initial generic profile)

## UX Requirements

## Executive Snapshot

Must display:
- Estimated Enterprise Value (if valuation module enabled)
- QoE Score
- Adjusted EBITDA (TTM)
- Expected WC close adjustment

## Module Cards

Each card must include:
- current value
- trend sparkline
- risk badge
- one-line "why this matters"
- drill-down action

## Drill-Down View

Must include:
- formula used
- source fields and period window
- threshold comparison
- evidence table for flags
- export action

## API and Data Contract Requirements

- Deterministic metric engine endpoint for QoE calculations.
- Response must include:
  - metric values
  - trend arrays
  - risk flags
  - score breakdown
  - confidence score
  - data lineage metadata

Example response sections:
- `snapshot`
- `modules`
- `flags`
- `qoeScore`
- `confidence`
- `lineage`

## Non-Functional Requirements

- Multi-tenant access control must be enforced via existing tenant-security patterns.
- Calculations should complete under 2 seconds for normal company datasets.
- Every displayed metric must be reproducible from stored fields.
- Alerting logic must avoid one-period noise (require persistence for severe alerts).

## Success Metrics

- 80%+ of active companies can compute all core QoE metrics with available data.
- Users can inspect formula and inputs for 100% of displayed metrics.
- Consultant adoption: repeated monthly usage by pilot firms.

## Release Plan

### MVP

- Deterministic QoE metric engine
- Dashboard module cards and drill-down
- QoE score and confidence
- CSV export

### Phase 2

- Industry-specific threshold packs
- Enhanced revenue-recognition anomaly logic
- Asset-level maintenance CapEx modeling
- Scenario valuation overlays

## Open Decisions

- Final threshold calibration by industry.
- Whether to store monthly metric snapshots or compute on demand.
- Whether to launch under existing dashboard view or dedicated M&A readiness view by default.
