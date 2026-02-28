# Sector Playbook Library — Design

This document defines the **sector playbook library** used to focus Performance Analytics (Focus Board, Trend Explorer, Anomaly Inbox, and future recommendations) by company sector. Playbooks ensure analysis and recommendations are sector-appropriate and scale as COA and operational data expand (e.g. from ERP).

---

## 1. Purpose

- **Tie analysis to company sector**: Use the company’s `industrySectorCategory` to select one of 11 standard operational flavors (plus DEFAULT when sector is unset).
- **Focus the agent**: Prioritize which COA categories and ops metrics to analyze, how to triage (Fix now / Investigate / Monitor / Opportunities), and how to interpret anomalies and trends.
- **Support recommendations**: Provide sector-specific opportunity themes so COA + ops findings can be turned into actionable recommendations (title, family, when they apply, objective, owner).
- **Scale with data**: Playbooks define *what to care about* and *how to interpret*; the set of series analyzed comes from actual data. As ERP adds more COA lines and ops metrics, the same pipeline runs with the playbook guiding priority and narrative.

---

## 2. Schema: Sector Playbook

Each playbook is a structured object keyed by sector (same keys as `lib/performance-analytics/ops-metric-profiles.ts`).

### 2.1 Type definitions (conceptual)

```ts
// Sector key: same as ops profile (e.g. AGRICULTURE, RETAIL_TRADE, DEFAULT).
type SectorKey = string;

// Focus bucket for triage.
type FocusBucket = 'fix_now' | 'investigate' | 'monitor' | 'opportunities';

// COA category hints: which P&L / balance sheet areas to emphasize for this sector.
type COACategoryHint =
  | 'revenue'
  | 'cogs'
  | 'labor'
  | 'materials'
  | 'overhead'
  | 'working_capital'
  | 'ar_ap'
  | 'inventory'
  | 'project_costs'
  | 'claims_losses'
  | 'interest_margin'
  | 'other';

// One focus priority: what to look at and which bucket it maps to when severe.
type FocusPriority = {
  coaCategory?: COACategoryHint;           // optional COA emphasis
  opsCategory?: OpsMetricCategory;        // optional ops group (from ops profile)
  metricHint?: string;                     // e.g. "job margin", "inventory turns"
  whenSevere: FocusBucket;                 // bucket when signal is severe
  whenModerate: FocusBucket;               // bucket when signal is moderate
  rank: number;                            // 1 = highest priority for this sector
};

// Anomaly context: how to interpret anomalies in this sector.
type AnomalyContext = {
  seasonalityNote?: string;               // e.g. "Strong Q4 peak; harvest-driven spikes in Q3"
  typicalVarianceNote?: string;           // e.g. "Month-over-month ±15% common on job completions"
  highSeverityTriggers?: string[];        // metric/pattern names that should elevate severity
  narrativeTemplates?: Record<string, string>; // optional: metric key -> "likely cause" template
};

// One recommendation theme: standard opportunity type for this sector.
type RecommendationTheme = {
  id: string;                              // stable id, e.g. "retail_markdown_optimization"
  title: string;                           // display title
  family: string;                          // e.g. "Pricing & merchandising"
  whenCondition: string;                   // when to suggest (e.g. "margin pressure + high inventory")
  objective: 'cash' | 'margin' | 'growth' | 'risk';
  suggestedOwner?: 'Sales' | 'Ops' | 'Finance' | 'Marketing' | 'General';
  coaRelevant?: COACategoryHint[];        // COA areas that support this theme
  opsRelevant?: string[];                  // ops metric hints that support this theme
};

// Full playbook for one sector.
type SectorPlaybook = {
  sector: SectorKey;
  label: string;                           // display name (can match ops profile label)
  opsProfileRef: SectorKey;               // key into getOpsMetricProfile(); usually same as sector

  focusPriorities: FocusPriority[];
  anomalyContext: AnomalyContext;
  recommendationThemes: RecommendationTheme[];
};
```

### 2.2 Selection and fallback

- **Selection**: Use `Company.industrySectorCategory` (normalized: trim, uppercase, spaces/dashes → underscore). Look up playbook by that key.
- **Fallback**: If no playbook for key, use `DEFAULT` playbook. If sector is null/empty, use `DEFAULT`.
- **Ops profile**: Continue using `getOpsMetricProfile(industrySectorCategory)` for metric groups and suggested goals; playbook references the same sector key via `opsProfileRef`.

---

## 3. How the playbook is used

| Consumer | Use of playbook |
|----------|------------------|
| **Run (performance-analytics/run)** | Load playbook by `industrySectorCategory`. Use `focusPriorities` to rank and bucket findings (Fix now / Investigate / Monitor / Opportunities). Use `anomalyContext` to set severity and narrative for anomaly findings. Use `recommendationThemes` (later) to generate sector-appropriate opportunity/recommendation findings from COA + ops. |
| **Focus Board** | Display findings already bucketed by run; playbook influenced which series were prioritized and how they were scored. |
| **Trend Explorer** | Emphasize trends for COA categories and ops groups in `focusPriorities`; label drivers using `metricHint` and ops profile. |
| **Anomaly Inbox** | Anomalies generated with sector context: severity from `highSeverityTriggers`, narrative from `anomalyContext`. COA and ops series both run through anomaly; playbook defines which categories to scan first and how to describe. |
| **Recommendation layer (future)** | Map findings to `recommendationThemes` by sector; generate concrete recommendations (title, rationale, evidence, owner) from COA/ops data. |

**Data expansion**: When new COA lines or ops metrics appear (e.g. ERP), the run still uses the same playbook. New series are analyzed with the same logic; playbook determines *priority* (which series to surface first) and *interpretation* (narrative, severity, recommendation family). No need to enumerate every possible GL or ops field in the playbook.

---

## 4. Playbook content by sector

Below: for each of the 11 sectors plus DEFAULT, outline of **focus priorities**, **anomaly context**, and **recommendation themes**. Implementation can store these as JSON/TS constants keyed by sector.

---

### 4.1 DEFAULT (General Operations)

**Use when**: `industrySectorCategory` is missing or does not match any sector key.

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Revenue, orders | fix_now | investigate |
| 2 | Gross margin %, unit economics | fix_now | monitor |
| 3 | AR days, inventory days, working capital | investigate | monitor |
| 4 | Cycle time, on-time %, fulfillment | investigate | monitor |
| 5 | Churn, repeat rate, customer | monitor | opportunities |

**Anomaly context**

- Seasonality: Generic; no sector-specific pattern.
- Typical variance: Revenue and margin often ±10–20% MoM for small businesses.
- High severity: Large single-period revenue drop, margin collapse, or cash/AR spike.
- Narrative: Neutral (“Variance in [metric] relative to recent history.”).

**Recommendation themes**

- Improve collections and terms to reduce DSO (working_capital; cash; Finance).
- Optimize inventory and payables to free cash (working_capital; cash; Ops).
- Strengthen unit economics and contribution per order (unitEconomics; margin; Ops).
- Improve on-time delivery and cycle time (fulfillment; growth; Ops).
- Reduce churn and improve retention (customer; growth; Sales/Marketing).

---

### 4.2 AGRICULTURE

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Yield per acre, price per unit, orders | fix_now | investigate |
| 2 | Input cost per unit, capacity utilization (supply) | fix_now | investigate |
| 3 | Shrink %, defect % (quality) | investigate | monitor |
| 4 | Inventory days, cash conversion | investigate | monitor |
| 5 | COGS, materials, labor | monitor | opportunities |

**Anomaly context**

- Seasonality: Harvest and planting cycles; quarterly yield and price spikes are common.
- Typical variance: Yield and price can swing ±20%+ by season; input costs volatile.
- High severity: Collapse in yield or price, or sharp input-cost spike vs prior period.
- Narrative: Use “yield,” “price,” “input cost,” “shrink” in likely-cause text.

**Recommendation themes**

- Improve yield per acre and input efficiency (supply, demand; margin; Ops).
- Reduce shrink and defect rates (quality; margin; Ops).
- Shorten cash conversion cycle and inventory days (working_capital; cash; Finance).
- Lock in price or hedge input costs when volatility is high (revenue, cogs; risk; Finance).
- Optimize capacity utilization and seasonal planning (supply, capacity; margin; Ops).

---

### 4.3 MINING

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Throughput, downtime %, utilization % | fix_now | investigate |
| 2 | Cost per ton, margin per ton | fix_now | investigate |
| 3 | Grade variance, recovery rate (quality) | investigate | monitor |
| 4 | Planned vs unplanned outages (capacity) | investigate | monitor |
| 5 | COGS, labor, materials | monitor | opportunities |

**Anomaly context**

- Seasonality: Weather and maintenance windows; quarterly production swings possible.
- Typical variance: Throughput and cost per ton can move ±15% with outages or grade mix.
- High severity: Sustained downtime spike, cost per ton jump, or recovery rate drop.
- Narrative: Use “throughput,” “downtime,” “cost per ton,” “recovery rate.”

**Recommendation themes**

- Reduce unplanned downtime and improve utilization (capacity, supply; margin; Ops).
- Lower cost per ton through throughput and efficiency (unitEconomics; margin; Ops).
- Improve recovery rate and grade consistency (quality; margin; Ops).
- Optimize maintenance and outage planning (capacity; risk; Ops).
- Align labor and materials to production plans (project_costs, cogs; cash; Finance).

---

### 4.4 UTILITIES

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Uptime %, outage frequency, response time | fix_now | investigate |
| 2 | Cost per kWh, loss % | fix_now | investigate |
| 3 | Load factor, peak vs off-peak (capacity) | investigate | monitor |
| 4 | Revenue, regulatory/rate context | monitor | opportunities |
| 5 | O&M, capital-related costs | monitor | opportunities |

**Anomaly context**

- Seasonality: Peak demand (summer/winter); planned outages often in shoulder seasons.
- Typical variance: Load and cost per unit can vary ±10–15% by season.
- High severity: Major outage spike, safety/reliability event, or regulatory exposure.
- Narrative: Use “uptime,” “outage,” “loss %,” “load factor.”

**Recommendation themes**

- Improve uptime and reduce outage frequency (service; risk; Ops).
- Reduce technical and commercial loss % (unitEconomics; margin; Ops).
- Optimize load factor and peak/off-peak mix (capacity; margin; Ops).
- Manage O&M and capital to support reliability (overhead, project_costs; risk; Finance).
- Align rates and revenue to cost and load (revenue; margin; Finance).

---

### 4.5 CONSTRUCTION

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Schedule variance, change orders % | fix_now | investigate |
| 2 | Job margin, labor productivity | fix_now | investigate |
| 3 | Backlog, bid win rate | investigate | monitor |
| 4 | WIP aging, retention receivable | investigate | monitor |
| 5 | Labor, materials, subcontractors (COA) | monitor | opportunities |

**Anomaly context**

- Seasonality: Weather and project phasing; backlog and completions lumpy by quarter.
- Typical variance: Job margin and schedule often ±10–15% by job; change orders can spike.
- High severity: Large schedule slip, margin erosion on a job, or retention/AR stretch.
- Narrative: Use “schedule variance,” “change orders,” “job margin,” “WIP,” “retention.”

**Recommendation themes**

- Reduce schedule variance and improve project execution (fulfillment; margin; Ops).
- Control change orders and scope creep (fulfillment; margin; Ops).
- Improve job margin and labor productivity (unitEconomics; margin; Ops).
- Tighten WIP and retention collection (working_capital; cash; Finance).
- Strengthen bid win rate and backlog quality (demand; growth; Sales).

---

### 4.6 WHOLESALE_TRADE

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Fill rate, order volume | fix_now | investigate |
| 2 | Gross margin %, freight cost % | fix_now | investigate |
| 3 | Inventory turns, AR days | investigate | monitor |
| 4 | Cycle time, returns % | investigate | monitor |
| 5 | COGS, fulfillment costs | monitor | opportunities |

**Anomaly context**

- Seasonality: Demand peaks by product/season; inventory and fill rate swing.
- Typical variance: Fill rate and margin often ±5–10%; inventory turns by category.
- High severity: Fill rate drop, margin compression, or inventory/AR blowout.
- Narrative: Use “fill rate,” “inventory turns,” “freight,” “returns.”

**Recommendation themes**

- Improve fill rate and order fulfillment (fulfillment, demand; growth; Ops).
- Optimize inventory turns and working capital (working_capital; cash; Ops/Finance).
- Reduce freight cost % and improve margin (unitEconomics; margin; Ops).
- Lower returns % and cycle time (fulfillment; margin; Ops).
- Tighten AR and payment terms (ar_ap; cash; Finance).

---

### 4.7 RETAIL_TRADE

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Conversion %, traffic, basket size | fix_now | investigate |
| 2 | Stockout %, return rate | fix_now | investigate |
| 3 | Gross margin %, promo lift | investigate | monitor |
| 4 | Inventory turns, sell-through % | investigate | monitor |
| 5 | Revenue by category, markdowns | monitor | opportunities |

**Anomaly context**

- Seasonality: Holiday and back-to-school peaks; category-specific seasonality.
- Typical variance: Conversion and traffic can move ±10–15%; margin with promo mix.
- High severity: Conversion collapse, stockout spike, or margin erosion.
- Narrative: Use “conversion,” “stockout,” “sell-through,” “promo,” “markdown.”

**Recommendation themes**

- Reduce stockouts and improve conversion (fulfillment, demand; growth; Ops).
- Optimize markdown and promo effectiveness (unitEconomics; margin; Marketing).
- Improve inventory turns and sell-through (working_capital; cash; Ops).
- Increase basket size and traffic (demand; growth; Marketing/Sales).
- Reduce return rate and improve margin (fulfillment, unitEconomics; margin; Ops).

---

### 4.8 TRANSPORTATION

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | On-time %, cycle time | fix_now | investigate |
| 2 | Utilization %, load factor | fix_now | investigate |
| 3 | Cost per mile, margin per load | investigate | monitor |
| 4 | Damage rate, claims % | investigate | monitor |
| 5 | Fuel, labor, maintenance (COA) | monitor | opportunities |

**Anomaly context**

- Seasonality: Peak shipping periods; weather and demand cause utilization swings.
- Typical variance: On-time and utilization often ±5–10%; cost per mile with fuel.
- High severity: On-time drop, claims spike, or margin collapse per load.
- Narrative: Use “on-time,” “utilization,” “cost per mile,” “claims,” “damage.”

**Recommendation themes**

- Improve on-time delivery and cycle time (fulfillment; growth; Ops).
- Increase utilization and load factor (capacity; margin; Ops).
- Reduce cost per mile and improve margin per load (unitEconomics; margin; Ops).
- Lower damage and claims (quality; risk; Ops).
- Optimize fuel, labor, and maintenance (cogs, overhead; margin; Ops/Finance).

---

### 4.9 INFORMATION (e.g. SaaS, software, media)

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Churn, retention, NPS | fix_now | investigate |
| 2 | Trial starts, activation % | fix_now | investigate |
| 3 | ARPU, gross margin % | investigate | monitor |
| 4 | Uptime %, latency | investigate | monitor |
| 5 | Revenue, S&M efficiency (COA) | monitor | opportunities |

**Anomaly context**

- Seasonality: Quarter-end and renewal waves; trial and activation can spike with campaigns.
- Typical variance: Churn and ARPU often reported monthly; ±5–10% common.
- High severity: Churn spike, activation drop, or significant outage.
- Narrative: Use “churn,” “activation,” “ARPU,” “uptime,” “latency.”

**Recommendation themes**

- Reduce churn and improve retention (customer; growth; Ops/Sales).
- Improve activation and trial-to-paid (demand; growth; Marketing).
- Increase ARPU and expansion revenue (unitEconomics; growth; Sales).
- Maintain uptime and reduce latency (service; risk; Ops).
- Improve gross margin and unit economics (unitEconomics; margin; Finance).

---

### 4.10 FINANCE_INSURANCE

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Loss ratio, default rate | fix_now | investigate |
| 2 | Net interest margin, fee income % | fix_now | investigate |
| 3 | Policy growth, loan originations | investigate | monitor |
| 4 | Cash runway, capital adequacy | investigate | monitor |
| 5 | Reserves, claims, interest (COA) | monitor | opportunities |

**Anomaly context**

- Seasonality: Reporting and underwriting cycles; loss and default can lag.
- Typical variance: Loss ratio and NIM often ±3–5%; originations by quarter.
- High severity: Loss ratio or default rate spike, or capital/regulatory concern.
- Narrative: Use “loss ratio,” “default rate,” “NIM,” “capital adequacy.”

**Recommendation themes**

- Improve loss ratio and underwriting (quality; margin; Ops).
- Reduce default rate and credit risk (quality; risk; Finance).
- Protect or improve net interest margin and fee income (unitEconomics; margin; Finance).
- Maintain capital adequacy and cash runway (working_capital; risk; Finance).
- Grow policy/loan volume with discipline (demand; growth; Sales).

---

### 4.11 REAL_ESTATE

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Occupancy %, lease renewal % | fix_now | investigate |
| 2 | NOI margin, rent per unit | fix_now | investigate |
| 3 | Turnover time, maintenance cycle time | investigate | monitor |
| 4 | Rent collection days, arrears % | investigate | monitor |
| 5 | Revenue, operating expenses (COA) | monitor | opportunities |

**Anomaly context**

- Seasonality: Lease expirations and turnover by quarter; occupancy can step-change.
- Typical variance: Occupancy and NOI often stable; arrears and turnover can spike.
- High severity: Occupancy drop, NOI compression, or arrears spike.
- Narrative: Use “occupancy,” “NOI,” “turnover,” “arrears,” “rent collection.”

**Recommendation themes**

- Improve occupancy and lease renewal (demand; growth; Sales/Ops).
- Protect NOI margin and rent per unit (unitEconomics; margin; Ops).
- Reduce turnover time and maintenance cycle (fulfillment; margin; Ops).
- Tighten rent collection and reduce arrears (working_capital; cash; Finance).
- Optimize operating expenses vs revenue (overhead; margin; Ops/Finance).

---

### 4.12 PROFESSIONAL_SERVICES

**Focus priorities**

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Utilization %, realization % | fix_now | investigate |
| 2 | Project margin, billable rate | fix_now | investigate |
| 3 | Pipeline, win rate | investigate | monitor |
| 4 | Repeat rate, NPS | investigate | monitor |
| 5 | Labor, subcontractors, revenue (COA) | monitor | opportunities |

**Anomaly context**

- Seasonality: Quarter-end and project milestones; utilization and pipeline lumpy.
- Typical variance: Utilization and realization often ±5–10%; project margin by engagement.
- High severity: Utilization drop, realization erosion, or pipeline gap.
- Narrative: Use “utilization,” “realization,” “project margin,” “win rate.”

**Recommendation themes**

- Improve utilization and billable capacity (capacity; margin; Ops).
- Increase realization and project margin (unitEconomics; margin; Ops).
- Strengthen pipeline and win rate (demand; growth; Sales).
- Improve repeat rate and NPS (customer; growth; Ops/Sales).
- Align labor and subcontractor cost to revenue (labor, project_costs; margin; Finance).

---

## 5. Implementation notes

- **Storage**: Implement playbooks as a constant map (e.g. `SECTOR_PLAYBOOKS: Record<string, SectorPlaybook>`) in code or as JSON loaded at runtime. Keys must match normalized `industrySectorCategory` (see `getOpsMetricProfile`).
- **Run integration**: In `performance-analytics/run`, after resolving `industrySectorCategory` and `opsProfile`, load the sector playbook. Use `focusPriorities` when scoring and bucketing focus/driver/trend findings; use `anomalyContext` when generating anomaly findings (severity, narrative); use `recommendationThemes` when generating or enriching opportunity/recommendation findings.
- **COA coverage**: Ensure run (or a dedicated COA analyzer) produces series for material COA categories (revenue, cogs, labor, etc.) and runs anomaly/focus logic on them; playbook’s `focusPriorities` and `coaCategory` hints determine which categories to emphasize per sector.
- **Ops coverage**: Use existing `getOpsMetricProfile(sector)` for metric names; playbook adds triage and anomaly/recommendation context. As new ops metrics are added (e.g. from ERP), include them in the relevant ops profile; playbook themes stay at category/family level.
- **Future recommendation layer**: When turning findings into actionable recommendations, match findings to `recommendationThemes` by sector, attach evidence (COA/ops series), and output title, rationale, suggested owner, and objective (cash/margin/growth/risk) for Opportunity Workspace.

---

## 6. Summary

| Item | Description |
|------|--------------|
| **Schema** | `SectorPlaybook`: sector, label, opsProfileRef, focusPriorities, anomalyContext, recommendationThemes. |
| **Selection** | From `Company.industrySectorCategory` (normalized); fallback `DEFAULT`. |
| **Sectors** | 11 sector playbooks (AGRICULTURE … PROFESSIONAL_SERVICES) + DEFAULT. |
| **Use** | Run uses playbook for focus bucketing, anomaly narrative/severity, and (later) recommendation themes; Focus Board, Trend Explorer, and Anomaly Inbox consume run output; design supports thorough COA + ops review and scales with expanded ERP data. |
