# Branch Realignment Phase 1

This branch is a safe, minimal reconciliation path from `master` toward `dev`.

## Included commits (from `origin/dev`)

- `8707ebb` Enforce strict QBO parsing with account-id mapping
- `b968b81` Expand QBO revenue parsing to include Sales sections

## Why only these two

These two commits applied cleanly and touched only parser logic:

- `lib/lob-allocator.ts`
- `lib/quickbooks-parser.ts`

All other recent candidate commits in this batch conflicted with current `master` in core routes and deleted/renamed paths, especially:

- `app/api/quickbooks/sync/route.ts`
- `app/api/xero/sync/route.ts`
- `app/page.tsx`
- removed vs modified API document routes

## Deferred commits for next phase

- `8e73891` Retry QBO API calls after token refresh on auth failures
- `4890500` Add QBO sync diagnostics and month-level integrity validation
- `446c060` Refine QBO validation to avoid false historical blocks
- `e10ad8e` Unify API financial ingestion behind a canonical monthly model
- `61f49dd` Add admin sync-failure alerts and sanitize document text writes
- `2a6b1e8` Fix admin company context and harden QBO monthly sync reliability

## Recommended next step

Phase 2 should reconcile by functional area (QBO sync route first), not by date order, using targeted manual merges with test passes after each area.
