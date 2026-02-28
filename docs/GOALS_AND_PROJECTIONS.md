# Goals and Projections

This document explains the **Goals** and **Projections** pages, their sub-tabs, and the methods used for projections.

## Goals Page

The Goals page lets you set targets for both financial (COA) and operational metrics. It has two sub-tabs:

### 1) Expense Goals

Uses monthly COA data to set target percentages for:

- **COGS categories**
- **Operating expense categories**

**How it works:**

- The system loads the last 6 months of category percentages.
- It calculates 6‑month averages for COGS and operating expense totals.
- You can enter or adjust target percentages per category.
- Goals are saved per company.

**Primary use:** cost structure management and budget targets.

### 2) Operational Goals

Lets you set targets for operational metrics such as:

- AR aging
- AP aging
- Cash
- Inventory

**How it works:**

- Pulls the last 6 months of operational data for context.
- You can set target values for each operational KPI.
- Goals are saved per company and used across operational dashboards.

**Primary use:** improve cash cycle, collections, and working‑capital discipline.

---

## Projections Page

The Projections page generates forward-looking scenarios using historical COA data. It requires **at least 24 months** of history.

### Projection Outputs

The page generates 12 months of forecasts for:

- Revenue
- Expense (total operating expenses, excluding income taxes)
- Net Income
- Total Assets
- Total Liabilities
- Total Equity

Each chart includes three scenarios:

- **Most Likely**
- **Best Case**
- **Worst Case**

### Projection Method

**Revenue, COGS, and Operating Expenses**

Uses **Holt‑Winters triple exponential smoothing** with:

- Seasonal period: **12 months**
- Alpha: **0.2** (level)
- Beta: **0.1** (trend)
- Gamma: **0.1** (seasonality)

**Balance Sheet Items**

Total assets and total liabilities use **average monthly growth** based on the last 12 months vs the prior 12 months.

**Other Income/Expense & Taxes**

Interest, non‑operating income, extraordinary items, and taxes are projected as **average ratios to revenue** based on the last 12 months.

### Scenario Adjustments

The system modifies the base forecast to build scenarios:

- **Most Likely**: standard Holt‑Winters output
- **Best Case**: higher revenue trend, lower COGS/opex trend, lower interest/taxes, higher non‑op income
- **Worst Case**: lower revenue trend, higher COGS/opex trend, higher interest/taxes, lower non‑op income

### Fallback Method

If there is insufficient data for Holt‑Winters, projections fall back to **simple growth** using the average growth rate across the available history.

