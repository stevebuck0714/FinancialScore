## Infor CSI operational sync process (nightly + backfill)

This document explains **how FinancialScore ingests, transforms, and publishes operational data for Infor SyteLine / CSI**. It covers:

- **Nightly incremental sync with overlap** (example: 2-day overlap)
- **Large historical backfills** (async queue + business-day fanout)
- **How transformation + snapshot creation happens after ingestion**
- **Explicit completion signals** for each stage (run-level + per-business-day)

The CSI implementation shares the Infor connector lane (`platform = INFOR_M3`) with Infor M3; the **system type** is derived from `Company.accountingSystem` (normalized to `INFOR_CSI` vs `INFOR_M3`).

---

### Quick glossary

- **Platform vs system**
  - **Platform**: `AccountingConnection.platform` (Infor uses `INFOR_M3` for both M3 + CSI).
  - **System**: `Company.accountingSystem` (normalized by `lib/infor-m3/system.ts` into `INFOR_CSI` or `INFOR_M3`).
- **Sync window**
  - A bounded `startDate..endDate` used for “overlap” pulls (late postings, reversals, edits).
- **Business date**
  - For daily operational snapshots, we stamp raw + outputs to a **UTC calendar day** (not local time).
- **Run / task**
  - **Run**: `InforSyncRun` (queued/running/done/failed/cancelled).
  - **Task**: `InforSyncTask` (pending/leased/done/failed/cancelled), each task is one chunk.
  - **Attempt**: `InforSyncTaskAttempt`, each execution attempt for a task.

---

### Data products produced by CSI operational sync

The transform/snapshot stage hydrates the canonical operational tables used by Operations Hub:

- `CashSnapshot`
- `ARAgingSnapshot`
- `AROpenInvoiceSnapshot`
- `APAgingSnapshot`
- `APOpenBillSnapshot`
- `CustomerSalesSnapshot`
- `ProductSalesSnapshot`
- `InventorySnapshot`
- `DailyFinancialSnapshot` (derived from operational tables when enabled)

Raw ingest (when enabled) persists the source payloads for replay/debugging:

- `InforRawBatch`
- `InforRawRecord`
- `InforRawCompleteness` (per-day completeness + transform status)

---

### Two execution profiles (direct vs raw-ingest-first)

The Infor CSI connector supports two runtime profiles:

#### A) Direct sync (ingest + publish in one pass)

- `syncInforM3OperationalData(...)` writes directly into the operational snapshot tables as each module/program is fetched.
- Daily financial hydration can run inline at the end of a completed window.
- This is the simplest path and is typically used for small windows.

#### B) Raw ingest first (ingest now, transform/snapshot later)

This is the “pipeline” mode you described: **ingest at night with overlap**, then **transform + snapshot creation runs automatically after ingestion completes**.

Raw ingest first is active when either:

- `INFOR_RAW_INGEST_ENABLED=true` and `INFOR_RAW_INGEST_ONLY=true`, or
- the caller forces ingest-only (async queue does this by design).

In this mode:

- Ingestion writes `InforRawBatch` + `InforRawRecord` and updates `InforRawCompleteness`.
- Ingestion does **not** write final operational snapshots.
- A separate transform step replays raw records into canonical snapshot tables and marks `InforRawCompleteness.isComplete=true`.

---

### Nightly incremental sync with overlap (example: 2 days)

Nightly orchestration entrypoint:

- `app/api/cron/sync-operational-data/route.ts`
  - Runs for connections where `AccountingConnection.autoSync=true` and `status=ACTIVE`.
  - Uses each connection’s scheduled local time (`operationalPullTime`) and frequency.

Site context (CSI):

- CSI is **site-aware**. For user-initiated async runs, the API requires `site` explicitly.
- For nightly automation, site scoping is typically handled by the **configured CSI program rows** (endpoint paths, properties, and/or downstream rollups). If a tenant requires strict per-site scoping, prefer the async queue path which always carries an explicit `site`.

Overlap window selection:

- The nightly Infor window is **bounded and deterministic** and is built in `lib/operational-sync/runner.ts`:
  - End bound is the **prior fully complete UTC day**.
  - Start bound is derived from `operationalAutoSyncWindowDays` (stored in `AccountingConnection.connectionMetadata`).
  - **To use a 2-day overlap**, set `operationalAutoSyncWindowDays = 2`.

What overlap does:

- Overlap means we **re-pull the last N days** each night, which catches:
  - late-posted invoices/bills/payments
  - reversals and edits
  - delayed integrations or batch postings
- The ingestion layer is designed to be **idempotent** (dedupe/upsert/delete+replace semantics depending on domain), so re-running the overlap window should not inflate results.

---

### Large historical backfills (async queue)

For large CSI backfills (especially daily history), the app uses the async queue path.

Entry endpoint:

- `POST /api/infor-m3/operational-sync-async`
  - Creates an `InforSyncRun` + initial `InforSyncTask` rows (or queues behind an active run).
  - For CSI, **`site` is required** for async start.

Worker tick:

- `GET /api/cron/process-infor-sync-runs`
  - Calls the queue worker (`lib/infor-m3/sync-queue.ts`) which:
    - promotes queued runs when company/platform scope is idle
    - leases pending tasks (`InforSyncTask.status=pending -> leased`)
    - executes tasks (bounded concurrency + time budget)
    - writes `InforSyncTaskAttempt` telemetry
    - requeues continuation tasks when `hasMore=true`

Chunk execution endpoint:

- `POST /api/infor-m3/operational-sync`
  - Executes one chunk of an Infor run using a cursor-style continuation:
    - `programOffset`, `programBatchSize`, and optional `bookmark` / `requestOffset`
  - Has “stagnant cursor” safety: if pagination cursor doesn’t advance, it skips forward to prevent infinite loops.

Business-day backfill (CSI daily history):

- For CSI daily backfills with larger windows, async start forces `mode=business_day_backfill`.
- Business-day backfill enumerates **US business days** (excludes weekends + US federal holidays) and processes day slices.
- In queue mode, the run can **fan out** each day into multiple program shards so each task stays within wall-time limits.

---

### Stage 1: Ingestion (what gets written, and when)

The ingestion engine lives in `lib/infor-m3/operational-sync.ts` (`syncInforM3OperationalData`).

For each configured CSI “program row” (IDO load) and request:

1. Fetch raw data from CSI (IDO request service).
2. If raw ingest is enabled:
   - Write one `InforRawBatch` row (request metadata + cursor/bookmark).
   - Write many `InforRawRecord` rows (each record payload, deduped by hash).
3. Update `InforRawCompleteness` for the run/day/sourceKey:
   - `isComplete=false`
   - `statusMessage` like `ingested_chunk:success` or `ingested_chunk:error`
   - `lastSeenAt` updated for “freshness”

**Important**: In raw-ingest-first mode, ingestion does not publish final operational snapshots; that’s done by the transform stage.

---

### Stage 2: Transform + snapshot creation (raw replay)

Transform entrypoints:

- `processPendingInforRawTransforms(...)` (called by cron worker tick when enabled)
- `POST /api/infor-m3/operational-transform-pending` (manual/admin replay runner)
- `transformInforM3RawRun(...)` (the per-day raw replay)

What transform does (per business day):

- Reads `InforRawRecord` for `(companyId, syncRunId, businessDate)`.
- Replays and persists canonical snapshots for that day (AR/AP/Sales/Inventory/Cash + derived daily financial).
- Marks completeness:
  - sets `InforRawCompleteness.isComplete=true`
  - sets `statusMessage='transformed'`

Special handling: “raw missing” signals

- Example: if the transform sees **no sales raw inputs** for a day, it sets:
  - `sourceKey='sales'`
  - `isComplete=false`
  - `statusMessage='raw_missing:sales_inputs'`
- Pending transform runners intentionally **skip** `raw_missing:%` rows so we don’t endlessly retry days that truly have no source payload.

---

### Completion signals (explicit, in-app + in DB)

There are two “levels” of completion:

#### 1) Ingestion completion (run/task lifecycle)

Use the queue lifecycle tables:

- **Run done**: `InforSyncRun.status='done'` (no pending/leased tasks remain)
- **Run health**:
  - `InforSyncRun.lastChunkAt` should keep advancing during active runs
  - timeout guards auto-fail runs if progress stalls (stale/minutes or max-age/hours)

#### 2) Transform/snapshot completion (per business day)

Use `InforRawCompleteness`:

- **Transformed**: `isComplete=true` and `statusMessage='transformed'`
- **Raw missing**: `isComplete=false` and `statusMessage LIKE 'raw_missing:%'` (a “known gap” signal)
- **Transform failed**: `statusMessage LIKE 'transform_failed:%'` (eligible for retry/replay)

In other words:

- A run can be ingestion-complete (`InforSyncRun.status='done'`) while some days are still awaiting transform (`InforRawCompleteness.isComplete=false`).
- The transform stage is the “publish” gate for daily operational snapshots in raw-ingest-first mode.

---

### Monitoring and troubleshooting

#### Status endpoints (UI backing)

- Queue + diagnostics status:
  - `GET /api/infor-m3/operational-sync-status?companyId=<id>[&syncRunId=<runId>]`
- Async run control:
  - `POST /api/infor-m3/operational-sync-async` with `action=start|cancel|reset`
- Pending-transform replay status:
  - `GET /api/infor-m3/operational-transform-pending?companyId=<id>`

#### Useful SQL snippets (Postgres)

Latest runs:

```sql
SELECT id, status, frequency, mode, site, chunkCount, recordsCreated, warningCount, retryCount, lastChunkAt, createdAt
FROM "InforSyncRun"
WHERE "companyId" = '<COMPANY_ID>' AND platform = 'INFOR_M3'
ORDER BY "createdAt" DESC
LIMIT 10;
```

Task counts for one run:

```sql
SELECT status, COUNT(*) AS task_count
FROM "InforSyncTask"
WHERE "runId" = '<RUN_ID>'
GROUP BY status
ORDER BY status;
```

Per-day completeness and transform state:

```sql
SELECT "businessDate", "sourceKey", "isComplete", "statusMessage", "updatedAt"
FROM "InforRawCompleteness"
WHERE "companyId" = '<COMPANY_ID>' AND platform = 'INFOR_M3'
ORDER BY "businessDate" DESC, "sourceKey" ASC
LIMIT 200;
```

Days pending transform (excluding known raw-missing days):

```sql
SELECT rc."syncRunId", rc."businessDate", MIN(rc."updatedAt") AS oldest_updated_at
FROM "InforRawCompleteness" rc
WHERE rc.platform = 'INFOR_M3'
  AND rc."companyId" = '<COMPANY_ID>'
  AND rc."isComplete" = false
  AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
GROUP BY rc."syncRunId", rc."businessDate"
ORDER BY rc."businessDate" ASC;
```

---

### Where this is implemented (code map)

- Nightly orchestrator:
  - `app/api/cron/sync-operational-data/route.ts`
  - `lib/operational-sync/runner.ts`
- Async queue path:
  - `app/api/infor-m3/operational-sync-async/route.ts`
  - `app/api/cron/process-infor-sync-runs/route.ts`
  - `lib/infor-m3/sync-queue.ts`
  - `app/api/infor-m3/operational-sync/route.ts`
  - `app/api/infor-m3/operational-sync-status/route.ts`
- Ingestion + raw ingest + transform:
  - `lib/infor-m3/operational-sync.ts`
  - `app/api/infor-m3/operational-transform-pending/route.ts`
  - `scripts/backfill-operational-snapshots.ts` (offline helper)
- Persistence models:
  - `prisma/schema.prisma` (`InforSyncRun`, `InforSyncTask`, `InforSyncTaskAttempt`, `InforRawBatch`, `InforRawRecord`, `InforRawCompleteness`)

