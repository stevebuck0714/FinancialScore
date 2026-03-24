# SDE Executive Summary + Recommendations Implementation Map

## Goal
Implement an M&A-ready `Executive Financial Health Summary` and `Recommendations` module in SDE that is evidence-linked, deterministic-first, and safe for later agentic AI enhancement.

## Scope (Phase 1 - now)
- Deterministic executive summary score/rating from existing SDE signals.
- Deterministic recommendations generated from Revenue Quality, Working Capital, and Cash Flow Quality flags.
- Recommendations rendered in `SDE Module: Recommendations` tab with:
  - priority
  - module
  - rationale
  - expected EBITDA impact range
  - effort, confidence, and execution horizon
- No mock datasets and no fallback data sources.

## Data Contracts (UI-facing)
- `ExecutiveSummary`
  - `readinessScore: number` (0-100)
  - `rating: 'Strong' | 'Moderate' | 'Needs Attention'`
  - `highCount: number`
  - `mediumCount: number`
  - `lowCount: number`
- `Recommendation`
  - `id: string`
  - `module: 'Revenue Quality' | 'Working Capital' | 'Cash Flow Quality'`
  - `priority: 'High' | 'Medium' | 'Low'`
  - `title: string`
  - `rationale: string`
  - `impactRange.low: number`
  - `impactRange.high: number`
  - `effort: 'Low' | 'Medium' | 'High'`
  - `confidence: number` (0-1)
  - `horizon: '30 days' | '60 days' | '90 days'`

## Implemented Location
- `app/page.tsx`
  - Added deterministic `sdeExecutiveSummary`.
  - Added deterministic `sdeRecommendations`.
  - Replaced Recommendations placeholder UI with live recommendation cards.
  - Added stale async-request guard for company switching to prevent cross-company leakage.

## Deterministic Rule Inputs
- Revenue Quality:
  - DSO trend
  - AR vs Revenue growth spread
- Working Capital:
  - CCC level
  - WC intensity
- Cash Flow Quality:
  - Cash conversion %
  - Maintenance CapEx gap

## Priority Rules
- Triggered high-severity flags drive `High` priority recs.
- Triggered medium-severity flags drive `Medium` recs.
- If no material flags, provide one low-priority monitoring recommendation.

## Phase 2 (next)
- Move recommendation engine into `lib/` and expose via API endpoint.
- Persist recommendation snapshots per company + as-of date.
- Add recommendation lifecycle states:
  - Proposed
  - Approved
  - In Progress
  - Completed
  - Rejected
- Add owner and due-date assignment.

## Phase 3 (agentic enhancement)
- Introduce agentic ranking/explanation layer on top of deterministic candidates.
- Keep deterministic calculations as source of truth and evidence.
- Require human approval before any workflow-changing actions.
