# ERP Sync Adapter Template

Use this checklist when adding a new ERP connector to the queue-backed sync system.

## Goal

Plug new ERP integrations into shared queue orchestration (runs/tasks/retries/alerts/status)
without creating a one-off scheduler.

## 1) Platform registration

- Add/confirm platform enum support in `prisma/schema.prisma` (`AccountingPlatform`).
- Ensure `accountingConnection.platform` uses that platform value.
- Decide if the platform should map to an existing connection type (example: QBD -> `QUICKBOOKS`) or a new one.

## 2) Adapter contract

Each adapter should normalize output to:

```ts
type QueueAdapterResult = {
  ok: boolean;
  hasMore: boolean;
  cursor: Record<string, unknown> | null;
  recordsCreated: number;
  errors: string[];
  details?: string;
};
```

Required behavior:

- idempotent writes for retries
- bounded slice/chunk processing
- safe cursor continuation
- deterministic error messages

## 3) Queue dispatcher wiring

- Update queue worker dispatch (currently in `lib/infor-m3/sync-queue.ts`) to call adapter by `run.platform`.
- Keep shared behavior for:
  - leasing
  - retry/backoff
  - max-attempt failure handling
  - admin alerting (`notifyAdminsOfSyncFailure`)

## 4) Start/cancel/status API wiring

- Ensure start endpoint can resolve connection for the new platform.
- Ensure queue run creation stores correct `platform`.
- Ensure status route can read queued run by `syncRunId` and return normalized fields.
- Ensure cancel route cancels by `companyId + platform + runId`.

## 5) Secrets and environment

- Add platform-specific secrets/credentials to env docs.
- If worker performs internal fetches in protected deployments, ensure `VERCEL_AUTOMATION_BYPASS_SECRET` path works.

## 6) Alerting

- Ensure failures call `notifyAdminsOfSyncFailure` with:
  - `platform` = new platform
  - `syncType` = stable adapter identifier (example: `new_erp_async_queue`)
- Verify `RESEND_API_KEY` path in staging/prod.

## 7) Validation checklist

- Start run: returns `ok: true`, `alreadyRunning` or `queued` as expected.
- Status run: `chunkCount` advances, `lastChunkAt` updates.
- Retry path: transient failure retries with backoff.
- Max failure path: run marks failed and admin alert email is sent.
- Queue FIFO path: second run for same company/platform queues and auto-promotes after first completion.

## 8) Rollout

- Gate with feature flag for canary company/platform.
- Validate in staging with real credentials + production-like protection.
- Promote to production after one successful overnight run.
