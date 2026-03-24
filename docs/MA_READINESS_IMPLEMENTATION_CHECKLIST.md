# M&A Readiness Implementation Checklist

This checklist maps directly to the current Corelytics repository layout and is organized for incremental delivery.

## Phase 0: Alignment and Guardrails

- [ ] Confirm feature entry point:
  - Option A: add as a new main view in `app/page.tsx` (recommended).
  - Option B: embed as additional widgets in `app/components/DashboardView.tsx`.
- [ ] Confirm whether QoE score will be persisted (DB) or computed on demand.
- [ ] Confirm initial industry-agnostic thresholds for pilot launch.
- [ ] Confirm naming in UI: `M&A Readiness` vs `QoE Dashboard`.

## Phase 1: Data Contract and Metric Engine (Backend)

## 1.1 Create shared metric types

- [ ] Add file `lib/ma-readiness/types.ts`:
  - [ ] snapshot interfaces (`AdjustedEbitda`, `WcAdjustment`, `QoeScore`)
  - [ ] module interfaces (`EbitdaModule`, `RevenueQualityModule`, `WorkingCapitalModule`, `CashFlowModule`)
  - [ ] risk level enum (`low | medium | high`)
  - [ ] confidence and lineage schemas

## 1.2 Build deterministic calculator functions

- [ ] Add file `lib/ma-readiness/calculate.ts`:
  - [ ] `calculateEbitdaModule(monthlyRows)`
  - [ ] `calculateRevenueQualityModule(monthlyRows, optionalInputs)`
  - [ ] `calculateWorkingCapitalModule(monthlyRows)`
  - [ ] `calculateCashFlowModule(monthlyRows)`
  - [ ] `calculateQoeScore(modules, confidence)`
- [ ] Reuse canonical fields from `lib/financial-canonical.ts`.
- [ ] Add explicit divide-by-zero and sparse-history guards.

## 1.3 Add threshold and scoring config

- [ ] Add file `lib/ma-readiness/config.ts`:
  - [ ] default threshold bands
  - [ ] metric weights
  - [ ] confidence scoring weights
  - [ ] trailing window constants (`12`, `24`, `36`)

## 1.4 Add API route

- [ ] Add route `app/api/ma-readiness/route.ts`:
  - [ ] `GET` by `companyId` + optional period params
  - [ ] enforce auth with `requireAuth`
  - [ ] enforce tenant access with `validateCompanyAccess` / `requireCompanyAccess`
  - [ ] load monthly rows from `MonthlyFinancial` model
  - [ ] call calculator and return normalized payload
- [ ] Add audit logging hooks via `lib/audit-logger.ts` for read attempts and forbidden access.

## 1.5 Optional persistence (if chosen)

- [ ] Add Prisma model `MaReadinessSnapshot` in `prisma/schema.prisma`:
  - [ ] companyId
  - [ ] periodEnd
  - [ ] snapshotJson
  - [ ] qoeScore
  - [ ] confidenceScore
  - [ ] createdAt
- [ ] Create migration under `prisma/migrations/...`.
- [ ] Add save/read helpers in `lib/ma-readiness/repository.ts`.

## Phase 2: UI Delivery (Frontend)

## 2.1 Build view component

- [ ] Add `app/components/assessment/MAReadinessDashboardView.tsx` (fits current M&A assessment grouping).
- [ ] Render:
  - [ ] executive snapshot row
  - [ ] module cards for 4 modules
  - [ ] risk badges and trend visuals
  - [ ] confidence indicator

## 2.2 Drill-down component

- [ ] Add `app/components/assessment/MAReadinessModuleDetail.tsx`:
  - [ ] formula block
  - [ ] thresholds and status
  - [ ] evidence table
  - [ ] lineage/source fields

## 2.3 Integrate navigation and view state

- [ ] Update `app/page.tsx`:
  - [ ] extend `currentView` union with `'ma-readiness'`
  - [ ] add sidebar/navigation item
  - [ ] add guarded render block for `MAReadinessDashboardView`
  - [ ] pass `selectedCompanyId` and company context

## 2.4 API consumption and state handling

- [ ] Add hook `app/hooks/useMAReadiness.ts`:
  - [ ] fetch `/api/ma-readiness?companyId=...`
  - [ ] loading/error/retry behavior
  - [ ] cache by company + period
- [ ] Add empty-state and insufficient-data states aligned with existing style.

## Phase 3: Scoring Transparency and Explainability

- [ ] Add score breakdown panel in `MAReadinessDashboardView`:
  - [ ] category weights
  - [ ] metric-level contributions
  - [ ] excluded metrics due to missing data
- [ ] Add "why flagged" details for each risk item.
- [ ] Add explicit assumptions section in UI for CapEx proxy and recognition rules.

## Phase 4: Export and Reporting

- [ ] Add route `app/api/ma-readiness/export/route.ts`:
  - [ ] CSV export of metric history and current flags
  - [ ] include formula identifiers and source keys
- [ ] Add export trigger button in dashboard header.

## Phase 5: QA and Test Coverage

## 5.1 Unit tests for calculator correctness

- [ ] Add tests `lib/ma-readiness/calculate.test.ts`:
  - [ ] EBITDA adjustment math
  - [ ] WC normalization and adjustment
  - [ ] CCC component calculations
  - [ ] cash conversion and CapEx gap
  - [ ] score weighting behavior
  - [ ] missing/zero data behavior

## 5.2 API route tests

- [ ] Add tests for `app/api/ma-readiness/route.ts`:
  - [ ] auth required
  - [ ] company access denied path
  - [ ] successful response shape and value sanity

## 5.3 UI verification

- [ ] Verify rendering for:
  - [ ] no data
  - [ ] partial data
  - [ ] full data with mixed risk tiers
- [ ] Verify responsive layout and print behavior if needed.

## 5.4 Lint and type safety

- [ ] Run lint/typecheck for touched files.
- [ ] Resolve any strict-null and numeric edge-case warnings.

## Phase 6: Rollout

- [ ] Gate with feature flag (recommended):
  - [ ] `MA_READINESS_ENABLED` environment toggle
- [ ] Pilot with a small set of consultant-managed companies.
- [ ] Track adoption and metric inspection usage.
- [ ] Calibrate thresholds after first production feedback cycle.

## Definition of Done

- [ ] Users can open `M&A Readiness` view for a selected company.
- [ ] All four modules compute deterministically from current company data.
- [ ] QoE score and confidence score are visible and explainable.
- [ ] Each flag has evidence and threshold context.
- [ ] Export is available for consultant/client sharing.
- [ ] Access controls and audit logging follow existing tenant-security standards.

## Suggested Build Order (Fastest Path)

- [ ] Implement `lib/ma-readiness/types.ts`, `config.ts`, `calculate.ts`.
- [ ] Implement `app/api/ma-readiness/route.ts`.
- [ ] Implement `app/hooks/useMAReadiness.ts`.
- [ ] Implement `MAReadinessDashboardView.tsx` with executive + module cards.
- [ ] Wire `ma-readiness` into `app/page.tsx`.
- [ ] Add score transparency panel and export route.
- [ ] Add tests and pilot-flag rollout.
