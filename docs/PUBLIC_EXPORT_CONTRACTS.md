# Public Export Contracts

## Purpose

Defines intentionally public module surfaces used across the app so refactors do not accidentally widen or break contracts.

## Accounting adapters

- Public entrypoint:
  - `lib/accounting-adapters/index.ts`
- Current public export:
  - `AdapterFactory`

Rationale:
- Callers should request adapters through the factory, not import platform adapter classes directly.

## Financial pipeline routing

- Public functions in `lib/financial/pipeline-strategy.ts`:
  - `resolveFinancialPipelineLane`
  - `supportsPublishFromDailySnapshots`

Rationale:
- These define lane selection and publish eligibility behavior used by runtime paths.

## Field display name mapping

- Public in `lib/constants/field-display-names.ts`:
  - `FIELD_DISPLAY_NAMES`
  - `getFieldDisplayName`

Rationale:
- Shared reporting/display formatting should flow through a single mapping source.

## Infor async metadata state

- Public in `lib/infor-m3/async-run-state.ts`:
  - `InforOperationalAsyncRunStatus`
  - `InforOperationalAsyncRun`
  - `getRunStateFromMetadata`
  - `withRunStateMetadata`

Rationale:
- Route handlers and status endpoints share a stable metadata shape and helpers.

## Change control guidance

- Prefer narrowing exports over widening them.
- Avoid re-exporting internal classes/functions through broad barrel files unless needed by external callers.
- When public contracts change, update:
  - this file
  - `SYNC_ARCHITECTURE.md`
  - any affected operational docs/runbooks
