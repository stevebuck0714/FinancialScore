# Value Creation Recommendations PRD

## Objective

Build an explainable recommendation system that turns Corelytics financial signals into prioritized actions that increase enterprise value.

The system should:
- Identify value gaps from QoE, SDE, working capital, and cash flow metrics.
- Recommend practical actions with owners, timelines, and expected value impact.
- Use agentic AI for reasoning and prioritization while keeping calculations deterministic.

## Product Positioning

Corelytics should evolve from:
- **Diagnostic**: "what is happening"
to:
- **Prescriptive**: "what to do next"
and then:
- **Execution-aware**: "did actions improve value"

## User Personas

- Company CEO/Owner
- Finance lead/CFO
- Consultant
- M&A advisor (read-only stakeholder view)

## Core Use Cases

- Monthly value-creation review
- Pre-sale readiness improvement plan
- Quarterly board/advisor action plan
- Benchmarking expected value lift from operational changes

## Scope

### In Scope (MVP)

- Rules + deterministic metric triggers
- AI-generated recommendation narrative and prioritization
- Estimated value impact ranges with confidence
- 30/60/90-day action plans
- Recommendation tracking status

### Out of Scope (MVP)

- Fully autonomous workflow execution
- External market data ingestion at large scale
- Industry custom model training

## Functional Architecture

## Layer 1: Facts Engine (Deterministic)

Input from existing metrics:
- Adjusted EBITDA and addback profile
- Working capital normalization and CCC
- Cash conversion and maintenance CapEx gap
- Revenue quality signals (concentration, recurrence, anomalies)

Output:
- normalized signal set
- threshold breach flags
- trend direction and severity

## Layer 2: Agentic Recommendation Engine

Specialized agents interpret signals by domain:
- EBITDA/Margin Agent
- Revenue Quality Agent
- Working Capital Agent
- Cash Flow/CapEx Agent
- Deal Risk Agent

Each recommendation includes:
- Issue summary
- Root-cause hypothesis
- Recommended actions (ordered)
- Estimated value impact (EBITDA / multiple / cash)
- Confidence score
- Required assumptions

## Layer 3: Action Planning and Tracking

System converts recommendations into execution plans:
- 30/60/90-day milestones
- owner assignment
- KPI target and due date
- status transitions (planned, in progress, blocked, done)

## Recommendation Object Schema

Required fields:
- `id`
- `companyId`
- `category` (`earnings`, `revenue_quality`, `working_capital`, `cash_flow`, `deal_risk`)
- `title`
- `problemStatement`
- `evidence` (metric/value/period/threshold)
- `rootCauseHypothesis`
- `recommendedActions[]`
- `expectedImpact`:
  - `ebitdaImpactAnnual`
  - `workingCapitalRelease`
  - `multipleDeltaRange`
  - `enterpriseValueDeltaRange`
- `confidence` (`low` | `medium` | `high`)
- `effort` (`low` | `medium` | `high`)
- `timeToImpactMonths`
- `ownerRole`
- `status`
- `createdAt`, `updatedAt`

## Value Impact Methodology

## Deterministic Impact Models

- **EBITDA lift model**:
  - Annualized margin improvement x revenue base
- **Working capital release model**:
  - DSO/DIO/DPO delta translated to cash release
- **Multiple effect model**:
  - Risk-to-multiple adjustment band based on concentration, recurrence, reporting quality
- **Enterprise value delta**:
  - `(EBITDA delta x base multiple) + WC release + multiple expansion effect`

## Confidence Logic

Confidence should be based on:
- signal strength
- data completeness
- trend consistency
- number of supporting metrics

## Recommendation Prioritization

Priority score (0-100) should combine:
- expected EV impact
- confidence
- effort
- time to impact
- strategic importance (user-selectable weighting)

Priority tiers:
- `P1` High value + high confidence + near-term impact
- `P2` Medium impact or medium confidence
- `P3` Longer-term or lower-confidence actions

## UX Requirements

## Main Dashboard Section: Value Creation Recommendations

Must show:
- Top 5 recommendations by priority
- expected value impact range
- confidence and effort badges
- owner and due date
- status chip

## Recommendation Detail Drawer

Must include:
- "Why this recommendation exists" (evidence)
- assumptions
- action checklist
- impact simulator controls
- KPI tracking history

## Scenario Simulator

User can test "what-if" adjustments:
- reduce DSO by X days
- improve recurring revenue by X%
- reduce concentration by X%
- improve EBITDA margin by X points

Output should show:
- estimated EV delta range
- estimated timeframe
- risk-adjusted confidence

## AI Safety and Governance

- AI must not overwrite source metrics.
- Every recommendation must reference deterministic evidence.
- Confidence and assumptions are mandatory fields.
- High-impact recommendations require user confirmation before action-plan creation.
- Audit trail for recommendation generation and edits.

## API Requirements

### Read recommendations

- `GET /api/value-recommendations?companyId=...`

### Generate recommendations

- `POST /api/value-recommendations/generate`

### Update execution status

- `PATCH /api/value-recommendations/:id`

### Simulate value impact

- `POST /api/value-recommendations/simulate`

## Non-Functional Requirements

- Access controlled by existing tenant-security rules.
- End-to-end recommendation generation under 5 seconds for typical datasets.
- Deterministic impact calculators versioned and test-covered.
- AI output must degrade gracefully to rules-only mode.

## MVP Release Plan

### MVP

- Rules engine + deterministic impact model
- AI narrative + prioritization layer
- Recommendation list/detail UI
- Manual owner assignment and status tracking
- Basic simulator

### Phase 2

- Industry-specific recommendation packs
- Cross-company benchmark-informed recommendations
- Automated follow-up nudges and progress forecasting
- Deeper advisor-ready export packs

## Success Metrics

- Recommendation adoption rate (% moved to in-progress)
- Realized value vs estimated value (6-12 months)
- Time-to-first-action after recommendation generation
- Increase in QoE score over time
- Consultant/user retention linked to recommendation usage

## Open Decisions

- Persist recommendation snapshots monthly vs on-demand generation.
- Whether to include multiple-expansion math in MVP UI or hide in advanced mode.
- Recommended default weightings for priority score.
