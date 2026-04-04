# Phase 1 Codebase Optimization Checklist

## Scope Lock (Non-Functional Only)

- [x] No UI layout/style changes
- [x] No UX flow changes
- [x] No copy/text changes
- [x] No API contract changes (unless strictly backward-compatible)
- [x] No database schema changes in Phase 1

## Phase 1 Goals

- [x] Reduce complexity in oversized files by extracting internal helpers
- [x] Remove duplicate code paths where safe
- [x] Consolidate shared utility patterns in touched modules
- [x] Improve runtime safety (null/undefined guards) in non-UI logic
- [x] Keep behavior identical for existing user flows

## Workstream Progress

- [x] `app/components/operations/DailyAlertsView.tsx` guard normalization pass
- [x] `app/components/operations/OperationsTab.tsx` shared list helper pass
- [x] `app/components/operations/WorkingCapitalForecastTab.tsx` shared list helper pass
- [x] `app/components/operations/OpsDashboard.tsx` list guard pass
- [x] `app/components/performance-analytics/OpportunityWorkspace.tsx` fetch/error/filter hardening
- [x] `lib/user-company-access.ts` delegate typing + select consolidation
- [x] `lib/infor-m3/operational-sync.ts` mapped-line and object guard tightening
- [x] `app/components/operations/DailyAlertsView.tsx` follow-up typed error + preview trend hardening pass
- [x] `lib/infor-m3/operational-sync.ts` additional typed row-loop pass for origin-map and contract-support paths
- [x] `lib/infor-m3/operational-sync.ts` AR/AP typing hardening + origin-map loop safety pass
- [x] `server.js` helper extraction for env project parsing/matching
- [x] `scripts/clean-dev-servers.js` helper extraction for Windows PID parsing
- [x] `lib/user-company-access.ts` membership-shape normalization + company fetch dedupe pass
- [x] `app/components/operations/OpsDashboard.tsx` module-by-type completeness hardening for `daily-financials`
- [x] `lib/quickbooks-desktop/operational-sync.ts` AR/AP total accumulator typing + explicit upsert payload pass
- [x] `app/components/operations/OperationsTab.tsx` focused type-normalization pass for customer/cash trend render paths
- [x] `server.js` DB label/match helper consolidation pass
- [x] `app/components/operations/WorkingCapitalForecastTab.tsx` error-path and local-storage shape guard pass
- [x] `app/components/operations/OpsDashboard.tsx` frequency selector/type normalization pass

## Regression and Safety Gates

- [x] Lint passes for touched files
- [x] Typecheck full workspace (executed; pre-existing repo errors remain, no new errors in touched Phase 1 files)
- [x] Smoke test key flows (login, dashboard shell, operations, ratios)
- [x] Before/after behavior notes drafted for PR description

### Typecheck Gate Note

- Current `npx tsc --noEmit` fails on broad pre-existing strict typing issues across the repo.
- Phase 1 slices continue to enforce "no new lint errors in touched files" while typecheck debt is tracked separately.

### Smoke Test Notes

- Local smoke run executed against `http://localhost:3011` using current workspace code.
- Route checks: `/`, `/register-business`, `/getting-started` returned `200`.
- Protected API checks (dashboard shell/operations/ratios dependencies): `/api/companies`, `/api/financials`, `/api/operational-data`, `/api/ratios` returned `401` unauthenticated as expected (route/middleware healthy).

### Before/After Behavior Notes (PR Draft)

- **Before**: Internal modules had repeated guard/parsing patterns, mixed shape assumptions, and scattered runtime coercion in operations/performance sync paths.
- **After**: Shared guard helpers and typed-normalization paths are consolidated across touched files; runtime behavior and UI/UX flows remain unchanged.
- **Before**: Typecheck was noisy and blocked broad strict-mode confidence due existing repository debt.
- **After**: Phase 1 touched files were hardened to avoid introducing new lint/type failures while preserving existing contracts and output behavior.

## Notes

- This track is intentionally internal-only and behavior-preserving.
- If future Phase 1 slices are added, keep each change set narrow and reversible.

