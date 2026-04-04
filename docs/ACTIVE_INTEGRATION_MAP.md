# Active Integration Map

## Purpose

This map lists the currently active integration lanes, runtime entrypoints, and principal modules used in production behavior.

## Integration lanes

- `ERP_LEDGER`
  - Systems: Infor M3/CSI, QuickBooks Desktop, Dynamics-family, Acumatica, Odoo, Epicor/IFS-style connectors.
  - Primary routing: `lib/financial/pipeline-strategy.ts`
- `LIGHTWEIGHT_PAYLOAD`
  - Systems: QuickBooks Online, Xero, Sage Intacct.
  - Primary routing: `lib/financial/pipeline-strategy.ts`
- `CSV_TRIAL_BALANCE`
  - System: CSV/manual upload ingestion path.
  - Primary routing: `lib/financial/pipeline-strategy.ts`

## Operational sync entrypoints

- Scheduled orchestrator:
  - `app/api/cron/sync-operational-data/route.ts`
- Infor async queue worker tick:
  - `app/api/cron/process-infor-sync-runs/route.ts`
- Infor async control:
  - `app/api/infor-m3/operational-sync-async/route.ts`
- Infor status and diagnostics:
  - `app/api/infor-m3/operational-sync-status/route.ts`
- Infor per-chunk execution:
  - `app/api/infor-m3/operational-sync/route.ts`

## Core runtime modules

- Queue lifecycle and retries:
  - `lib/infor-m3/sync-queue.ts`
- Infor execution engine:
  - `lib/infor-m3/operational-sync.ts`
- Cross-platform operational runner:
  - `lib/operational-sync/runner.ts`
- Adapter factory:
  - `lib/accounting-adapters/adapter-factory.ts`

## Live safety controls

- Queue enabled toggle:
  - `INFOR_SYNC_QUEUE_ENABLED`
- Stale progress timeout:
  - `INFOR_SYNC_RUN_STALE_MINUTES` (default `30`)
- Max run age timeout:
  - `INFOR_SYNC_RUN_MAX_AGE_HOURS` (default `8`)

## Notes

- This file documents active architecture only.
- Retired/removed modules are intentionally excluded.
