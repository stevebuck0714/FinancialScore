# Operational Sync Architecture (Current)

## Purpose

This document reflects the **current live sync architecture** used by FinancialScore for operational data ingestion, with emphasis on Infor async queue processing and run safety controls.

## High-level lanes

- `ERP_LEDGER` lane: heavy ERP connectors (Infor M3/CSI, QBD, Dynamics-family connectors).
- `LIGHTWEIGHT_PAYLOAD` lane: payload-style connectors (QuickBooks Online, Xero, Sage Intacct).
- `CSV_TRIAL_BALANCE` lane: file-based ingestion.

Lane resolution is centralized in `lib/financial/pipeline-strategy.ts`.

## Core runtime components

### Sync orchestration

- `app/api/cron/sync-operational-data/route.ts`
  - Periodic orchestrator for operational sync entry.
- `lib/operational-sync/runner.ts`
  - Connector-aware execution for a company/platform/frequency run.

### Infor async queue path

- `app/api/infor-m3/operational-sync-async/route.ts`
  - Start/cancel/reset endpoint for async Infor runs.
- `app/api/cron/process-infor-sync-runs/route.ts`
  - Worker tick endpoint (cron-driven) for queued/running async runs.
- `lib/infor-m3/sync-queue.ts`
  - Queue leasing, retries, task progression, run lifecycle, timeout guards.
- `app/api/infor-m3/operational-sync-status/route.ts`
  - Status + diagnostics endpoint; includes stale-run protection for metadata-mode compatibility.

### Infor execution engine

- `app/api/infor-m3/operational-sync/route.ts`
  - Per-chunk execution endpoint used by worker ticks.
- `lib/infor-m3/operational-sync.ts`
  - Program/request execution, cursor continuation, and stale-cursor safety checks.

## Security and auth model

- Cron/worker endpoints are protected with `CRON_SECRET`.
- Worker-to-route call path uses `x-infor-sync-worker-secret`.
- Site-admin checks and company authorization are enforced in route guards:
  - `lib/infor-m3/route-guards.ts`
  - `lib/tenant-security.ts`

## Queue behavior (Infor)

Queue entities:
- `InforSyncRun` = run-level lifecycle (`queued`, `running`, `done`, `failed`, `cancelled`)
- `InforSyncTask` = chunk/task-level lifecycle (`pending`, `leased`, terminal states)
- `InforSyncTaskAttempt` = attempt telemetry/audit for each task execution

Worker tick flow:
1. Promote eligible queued runs when company/platform scope is idle.
2. Lease pending tasks with scope-aware inflight limits.
3. Execute tasks in bounded concurrency.
4. Persist attempt details and update run counters/state.
5. Requeue continuation tasks when cursor indicates `hasMore`.

## Anti-stall protections (current)

### Cursor-level protection

- Continuation logic avoids infinite bookmark loops (stagnant cursor protection in Infor execution path).
- Repeated chunk failures in backfill mode can skip an irrecoverable slice and continue.

### Run-level timeout guard

Implemented in queue + status paths to prevent indefinite `running` state:

- `INFOR_SYNC_RUN_STALE_MINUTES` (default `30`)
  - Fail run when no progress (`lastChunkAt`/`updatedAt`) exceeds threshold.
- `INFOR_SYNC_RUN_MAX_AGE_HOURS` (default `8`)
  - Fail run when total runtime exceeds maximum age cap.

On timeout:
- Run is marked `failed`.
- Pending/leased tasks are cancelled to prevent silent resumption.
- Failure details are written to run state for UI + diagnostics visibility.

## Cron configuration

Vercel cron includes:
- `/api/cron/process-infor-sync-runs` every minute for Infor async progression.
- `/api/cron/sync-operational-data` for scheduled operational sync orchestration.

## Operational runbook (UI-first)

For a stuck run:
1. Use API Connections UI reset/cancel action.
2. Restart async sync from UI.
3. Monitor status panel:
   - `chunkCount` should increase.
   - `lastChunkAt` should refresh.

For large history loads (e.g., 36 months):
- Prefer segmented runs (for example, three 12-month windows) to reduce blast radius.

## Current adapter contract surface

- Public adapter entrypoint export is intentionally narrow:
  - `lib/accounting-adapters/index.ts` exports `AdapterFactory`.
- Platform adapter classes/types remain internal to the adapter module tree and are consumed by factory/runtime paths.

## Notes

- This file intentionally reflects current behavior and active modules.
- Deprecated/legacy references should not be treated as operational guidance.
