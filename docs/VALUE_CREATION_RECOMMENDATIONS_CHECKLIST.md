# Value Creation Recommendations Implementation Checklist

This checklist maps directly to the existing Corelytics structure and can be executed in phases.

## Phase 0: Decisions and Alignment

- [ ] Confirm feature naming in UI:
  - `Value Creation Recommendations` (recommended)
  - `AI Value Playbook` (alternative)
- [ ] Confirm recommendation generation mode:
  - Rules-only fallback required
  - Rules + AI narrative mode as default
- [ ] Confirm whether recommendation history is persisted.
- [ ] Confirm initial business owner roles for assignment (`CEO`, `CFO`, `COO`, `Sales Lead`).

## Phase 1: Data Model and Types

## 1.1 Shared Types

- [ ] Add `lib/value-recommendations/types.ts` with:
  - [ ] recommendation object
  - [ ] evidence payload schema
  - [ ] impact model schema
  - [ ] simulator input/output types
  - [ ] status and confidence enums

## 1.2 Prisma Models

- [ ] Update `prisma/schema.prisma`:
  - [ ] `ValueRecommendation`
  - [ ] optional `ValueRecommendationSnapshot`
  - [ ] optional `RecommendationActionItem`
- [ ] Add indexes for:
  - [ ] `companyId`
  - [ ] `status`
  - [ ] `priorityScore`
  - [ ] `createdAt`
- [ ] Create migration under `prisma/migrations/...`.

## 1.3 Reference Existing Financial Sources

- [ ] Reuse canonical fields from `lib/financial-canonical.ts`.
- [ ] Reuse existing monthly/company query flow already used in `app/page.tsx`.

## Phase 2: Rules and Impact Engine

## 2.1 Rule Catalog

- [ ] Add `lib/value-recommendations/rules.ts`:
  - [ ] concentration risk rule
  - [ ] recurring revenue weakness rule
  - [ ] cash conversion weakness rule
  - [ ] WC deterioration / CCC spike rule
  - [ ] maintenance CapEx gap rule
  - [ ] large EBITDA adjustment volatility rule

## 2.2 Deterministic Impact Calculators

- [ ] Add `lib/value-recommendations/impact.ts`:
  - [ ] `estimateEbitdaLift`
  - [ ] `estimateWcRelease`
  - [ ] `estimateMultipleDelta`
  - [ ] `estimateEnterpriseValueDelta`

## 2.3 Priority and Confidence Scoring

- [ ] Add `lib/value-recommendations/prioritization.ts`:
  - [ ] confidence model
  - [ ] effort normalization
  - [ ] priority score formula
  - [ ] tier assignment (`P1/P2/P3`)

## 2.4 Recommendation Assembly Service

- [ ] Add `lib/value-recommendations/generate.ts`:
  - [ ] map triggered rules to recommendations
  - [ ] attach evidence and assumptions
  - [ ] include deterministic impact output
  - [ ] provide rules-only response if AI unavailable

## Phase 3: Agentic AI Layer

## 3.1 AI Prompting and Guardrails

- [ ] Add `lib/value-recommendations/ai.ts`:
  - [ ] structured prompt template
  - [ ] required output JSON schema
  - [ ] no-metric-mutation guardrails
  - [ ] confidence explanation requirement

## 3.2 Agent Roles (logical)

- [ ] Define internal role prompts for:
  - [ ] margin/earnings agent
  - [ ] revenue quality agent
  - [ ] working capital agent
  - [ ] cash flow/capex agent
  - [ ] synthesis/prioritization agent

## 3.3 Validation Layer

- [ ] Validate AI outputs against deterministic evidence before save/return.
- [ ] Reject or downgrade recommendations with weak evidence linkage.

## Phase 4: API Endpoints

- [ ] Add `app/api/value-recommendations/route.ts`
  - [ ] `GET` list recommendations by `companyId`
  - [ ] `POST` create or regenerate recommendations
- [ ] Add `app/api/value-recommendations/[id]/route.ts`
  - [ ] `PATCH` update status/owner/due date/notes
- [ ] Add `app/api/value-recommendations/simulate/route.ts`
  - [ ] `POST` what-if scenarios for EV impact
- [ ] Apply auth/access patterns:
  - [ ] `requireAuth`
  - [ ] `validateCompanyAccess` / `requireCompanyAccess`
  - [ ] audit logging via `lib/audit-logger.ts`

## Phase 5: Frontend UX

## 5.1 Hooks and State

- [ ] Add `app/hooks/useValueRecommendations.ts`:
  - [ ] fetch list
  - [ ] trigger regenerate
  - [ ] update status
  - [ ] handle loading/error/optimistic state

## 5.2 Components

- [ ] Add `app/components/assessment/ValueRecommendationsView.tsx`
- [ ] Add `app/components/assessment/ValueRecommendationCard.tsx`
- [ ] Add `app/components/assessment/ValueRecommendationDetail.tsx`
- [ ] Add `app/components/assessment/ValueImpactSimulator.tsx`

## 5.3 Navigation Integration

- [ ] Update `app/page.tsx`:
  - [ ] extend `currentView` union with `'value-recommendations'`
  - [ ] add sidebar/nav item
  - [ ] add gated render path for new view
  - [ ] pass selected company and user context

## Phase 6: Tracking and Workflow

- [ ] Add status transitions:
  - [ ] `new`
  - [ ] `accepted`
  - [ ] `in_progress`
  - [ ] `blocked`
  - [ ] `completed`
  - [ ] `dismissed`
- [ ] Add owner assignment and due date editing.
- [ ] Add recommendation notes and progress updates.
- [ ] Add simple completion KPI check ("did metric improve?").

## Phase 7: Testing and QA

## 7.1 Unit Tests

- [ ] Add `lib/value-recommendations/*.test.ts`:
  - [ ] rule triggering
  - [ ] impact math
  - [ ] confidence and priority scoring
  - [ ] fallback behavior

## 7.2 API Tests

- [ ] Verify auth and access denial paths.
- [ ] Verify response schema consistency.
- [ ] Verify simulator outputs for representative scenarios.

## 7.3 UI Tests

- [ ] recommendation list rendering
- [ ] detail drawer evidence visibility
- [ ] simulator interactions
- [ ] status update flow

## 7.4 Lint and Typecheck

- [ ] Run lint and type checks on touched files.
- [ ] Resolve any strict typing issues.

## Phase 8: Rollout

- [ ] Add feature flag:
  - [ ] `VALUE_RECOMMENDATIONS_ENABLED`
- [ ] Pilot with consultant cohort.
- [ ] Measure adoption:
  - [ ] recommendation acceptance rate
  - [ ] action completion rate
  - [ ] estimated vs realized impact

## Definition of Done

- [ ] New recommendations view available for selected companies.
- [ ] Recommendations show evidence, actions, impact range, confidence, and owner.
- [ ] AI output remains traceable to deterministic signals.
- [ ] Simulator returns consistent and explainable impact estimates.
- [ ] Access controls and audit logging follow existing standards.

## Suggested Fast-Track Build Order

- [ ] Create types + rules + impact calculators.
- [ ] Create `POST /api/value-recommendations` with rules-only output.
- [ ] Build view with cards + detail panel.
- [ ] Add AI narrative enhancement pass.
- [ ] Add simulator endpoint and UI.
- [ ] Add tracking workflow and tests.
