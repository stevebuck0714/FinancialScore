# 13-Week Cash Flow (Working Capital Forecast): AR/AP Inputs

This document explains the **AR Inputs** and **AP Inputs** sections in the 13-week cash flow report (the working capital forecast).

## Overview (what these inputs control)

- **AR inputs** control **when A/R turns into cash receipts** across the next 13 weeks.
- **AP inputs** control **when A/P gets paid (cash outflows)** across the next 13 weeks.
- Both sections use the same structure:
  - **Aging bucket %** = *how much of a bucket is expected to run off over the next 4 weeks*.
  - **Weekly weights (W1–W4)** = *how that 4-week runoff is distributed across the 4 weeks*.

## AR Inputs

### AR Aging Buckets (% collected next 4 weeks)

These fields are **percent assumptions** that apply to the **starting AR balance**, segmented by aging bucket.

- **Current**: percent of “Current” AR expected to be collected over the next 4 weeks.
- **30–60**: percent of “30–60” bucket AR expected to be collected over the next 4 weeks.
- **60–90**: percent of “60–90” bucket AR expected to be collected over the next 4 weeks.
- **90+**: percent of “90+” bucket AR expected to be collected over the next 4 weeks.

**Interpretation:** if `Current = 80%`, then across the next 4 weeks the model will collect **80% of whatever AR is in the Current bucket** (subject to the weekly weights for timing).

### AR Weekly Distribution Weights (W1–W4)

These fields shape **timing** across the next 4 weeks.

- **W1**: share of the 4-week AR collections that occur in week 1
- **W2**: share in week 2
- **W3**: share in week 3
- **W4**: share in week 4

**Important behavior:**

- The report **normalizes** W1–W4 into fractions that sum to 100%.
  - Example: `35, 30, 20, 15` becomes `35%, 30%, 20%, 15%`.
  - Example: `1, 1, 1, 1` becomes `25%, 25%, 25%, 25%`.
- If all four weights are 0, the report uses an **even split (25% each)**.

### How the AR bucket % and weekly weights combine

For each aging cohort, each week the report schedules collections as:

- **weekly collection** = `remaining_balance_in_bucket × bucket_collect_% × week_weight`

Because the weights are normalized to sum to 1 across W1–W4, the total collected over that 4-week cycle equals the bucket percent:

- **4-week total collection** = `remaining_balance_in_bucket × bucket_collect_%`

### Aging forward (what happens after 4 weeks)

Uncollected AR **ages forward** into the next bucket after 4 weeks:

- Current → 30–60 → 60–90 → 90+

When it ages forward, the model starts using the **next bucket’s %** assumption for the next 4-week cycle.

## AP Inputs

### AP Aging Buckets (% paid next 4 weeks)

These fields are **percent assumptions** that apply to the **starting AP balance**, segmented by aging bucket.

- **Current**: percent of “Current” AP expected to be paid over the next 4 weeks.
- **30–60**: percent of “30–60” bucket AP expected to be paid over the next 4 weeks.
- **60–90**: percent of “60–90” bucket AP expected to be paid over the next 4 weeks.
- **90+**: percent of “90+” bucket AP expected to be paid over the next 4 weeks.

### AP Weekly Distribution Weights (W1–W4)

Same behavior as AR weights:

- **Normalized** to sum to 100%
- Defaults to **25% / 25% / 25% / 25%** if all are 0

### How the AP bucket % and weekly weights combine

For each aging cohort, each week the report schedules payments as:

- **weekly payment** = `remaining_balance_in_bucket × bucket_pay_% × week_weight`

## Notes / gotchas

- **Percent fields are clamped to 0–100%** (values below 0% behave like 0%; values above 100% behave like 100%).
- **Weights don’t need to total 100%**; they’re treated as relative weights and then normalized.
- **Starting aging bucket amounts** come from the latest imported AR/AP aging snapshot when available. Internally, the app maps standard “Current / 1–30 / 31–60 / 61–90 / 90+” into the four displayed buckets (Current, 30–60, 60–90, 90+), with **90+ including 61–90 plus 90+**.

## Example

Assume starting AR “Current” balance is $100,000, with:

- **Current collect %** = 80%
- **Weekly weights** = W1 50, W2 25, W3 15, W4 10 (normalized to 50% / 25% / 15% / 10%)

Then the model targets collecting **$80,000 total over the next 4 weeks**, allocated roughly as:

- Week 1: $100,000 × 0.80 × 0.50 = $40,000
- Week 2: $100,000 × 0.80 × 0.25 = $20,000
- Week 3: $100,000 × 0.80 × 0.15 = $12,000
- Week 4: $100,000 × 0.80 × 0.10 = $8,000

