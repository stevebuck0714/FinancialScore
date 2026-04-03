# Phase 1 Codebase Optimization Checklist

## Scope Lock (Non-Functional Only)

- [ ] No UI layout/style changes
- [ ] No UX flow changes
- [ ] No copy/text changes
- [ ] No API contract changes (unless strictly backward-compatible)
- [ ] No database schema changes in Phase 1

## Phase 1 Goals

- [ ] Reduce complexity in oversized files by extracting internal modules
- [ ] Remove dead/duplicate code paths
- [ ] Consolidate shared utilities and common type definitions
- [ ] Improve runtime safety (null/undefined guards) in non-UI layers
- [ ] Keep behavior identical for existing user flows

## Workstream A: File/Module Decomposition

- [ ] Identify top 5 largest/high-churn files
- [ ] Extract pure helper logic into dedicated modules
- [ ] Keep existing public function signatures unchanged
- [ ] Add lightweight unit coverage for extracted helpers
- [ ] Verify import graph remains acyclic

## Workstream B: Dead Code and Duplication Cleanup

- [ ] Remove unreachable branches and unused functions/constants
- [ ] Remove stale temp/backups from active source paths
- [ ] De-duplicate repeated utility logic across modules
- [ ] Keep one canonical implementation per shared behavior

## Workstream C: Type and Error-Handling Hardening

- [ ] Tighten ambiguous `any` usage in critical service paths
- [ ] Add safe guards around optional data boundaries
- [ ] Standardize error object shape in internal service layers
- [ ] Ensure errors are logged with enough context for debugging

## Regression and Safety Gates (Required per PR)

- [ ] Lint passes for touched files
- [ ] Typecheck passes
- [ ] Existing smoke tests pass
- [ ] No visual diffs on key pages (login, dashboard shell, operations, ratios)
- [ ] Before/after behavior notes included in PR

## PR Rules

- [ ] Small PRs (one subsystem at a time)
- [ ] "No user-visible changes" statement included in PR description
- [ ] Include rollback note in PR description
- [ ] Do not combine refactor with new feature work

## Exit Criteria for Phase 1

- [ ] All scoped workstreams completed
- [ ] No regressions in critical flows
- [ ] Reduced complexity in targeted files (documented)
- [ ] Team sign-off that behavior is unchanged

