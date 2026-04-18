# Render Background Worker for Infor CSI Sync

**Status**: Design — not yet implemented
**Author**: AI assistant, scoped during AP/AR roll-forward session
**Owner**: Steve
**Date**: 2026-04-18

---

## Problem statement

The current Infor CSI operational sync runs as a Vercel cron + serverless worker:

- `vercel.json` schedules `/api/cron/process-infor-sync-runs` every minute.
- Each tick (`processQueueTick` in `lib/infor-m3/sync-queue.ts`) leases pending tasks from the
  `InforSyncTask` table and HTTP-POSTs each one to `/api/infor-m3/operational-sync` (also a
  Vercel function).
- Both endpoints are capped at `maxDuration = 300` (Vercel hard limit on the current plan).

That cap forces **three architectural compromises** that drive the slowness:

1. **Tiny chunks.** `resolveAdaptiveFanoutDayProgramShardSize` (sync-queue.ts:233) collapses
   to **1 program per business day** when the window ≥ 500 days, because anything bigger
   risks blowing the 300s cap. A 28-month backfill with 4 programs becomes ~2,300 chunks.
2. **Two function invocations per chunk.** Cron tick + worker = double cold-start tax.
3. **Conservative inflight caps.** `MAX_INFLIGHT_PER_SCOPE=10` exists partly to avoid
   retry storms when chunks hit the 300s wall.

Result: a 28-month historical backfill of 4 programs takes ~12 hours.

## Goal

Move the queue drainer (and optionally the worker route itself) onto a **dedicated
long-running process** with no time cap, so we can:

- Pack chunks fat (a whole month per program per chunk).
- Eliminate cold-start overhead.
- Scale concurrency independently of Vercel function limits.

**Target**: 28-month, 4-program backfill drops from ~12 hours to **~30-60 minutes**.

---

## Architecture

### Today

```
[Vercel cron *1m]            [Vercel function]
process-infor-sync-runs ──HTTP──> operational-sync
   │                                    │
   ├─ leases ≤ 48 tasks                 ├─ pulls IDO data
   ├─ ≤ 5 inflight/scope                ├─ writes to Postgres
   ├─ 240s fetch timeout                └─ 300s hard cap
   └─ 55s tick budget
```

### Phase 1 (drop-in, dual drainer)

```
[Render Background Worker, always-on]      [Vercel function, unchanged]
sync-drain.ts                  ──HTTP──>   operational-sync
   │                                          │
   ├─ continuous loop: processQueueTick()     └─ still 300s cap (for now)
   ├─ no max inflight cap                     
   └─ no tick budget                          [Vercel cron *1m, still on as fallback]

         ↑ both drainers safely contend on the same Postgres queue table
           (idempotent via leaseOwner + leaseExpiresAt, so dual-running is OK)
```

### Phase 2 (in-process, full extraction)

```
[Render Background Worker]
sync-drain.ts
   │
   ├─ continuous loop
   ├─ processTask() calls syncInforM3OperationalData() DIRECTLY (no HTTP)
   └─ chunk size raised to 1 month per program
                                             [Vercel cron disabled in vercel.json]
                                             [operational-sync route still exists for
                                              the UI's "Run Sync" button + queue start]
```

### Phase 3 (optional, scale-out)

If a single 1GB worker isn't enough at higher tenant counts, scale horizontally on Render
by raising the worker count. The Postgres lease semantics already prevent double-processing,
so this is a configuration change, not a code change.

---

## File extraction plan

### New files

| File | Purpose |
|------|---------|
| `lib/workers/sync-drain.ts` | Standalone Node entrypoint. Loops calling `processQueueTick`, exits cleanly on `SIGTERM`/`SIGINT`. ~80 lines. |
| `render.yaml` | Render service config (background worker definition). |
| `docs/RENDER_SYNC_WORKER.md` | This document. |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add `"worker:sync": "tsx lib/workers/sync-drain.ts"` script and a `"worker:sync:prod": "node dist/lib/workers/sync-drain.js"` (or run via `tsx` in prod — Render allows that). |
| `lib/infor-m3/sync-queue.ts` | Phase 2 only: gate the HTTP call in `processTask` behind `INFOR_SYNC_INPROCESS_WORKER` env. When set, call `syncInforM3OperationalData` directly instead of `fetch()`. |
| `vercel.json` | Phase 2 only: remove the `process-infor-sync-runs` cron entry. Keep the route for manual debug. |

### Files **not** changed

`lib/infor-m3/operational-sync.ts` — the actual sync logic (IDO fetch, Postgres writes,
fact-table emission) does not change. The Render worker imports it as-is. Same for
`lib/infor-m3/sync-queue.ts` (other than the optional Phase 2 in-process gate). This is
the key safety property: no logic rewrite, just a transport change.

---

## `lib/workers/sync-drain.ts` design

```typescript
// Pseudo-code only — actual implementation kept out of this doc for review clarity.
import { processQueueTick, isInforSyncQueueEnabled } from '@/lib/infor-m3/sync-queue';
import prisma from '@/lib/prisma';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 1000);
const WORKER_BASE_URL = process.env.WORKER_BASE_URL; // e.g. https://app.financialscore.io
const WORKER_SECRET = process.env.CRON_SECRET || '';
const WORKER_ID = `render-${process.env.RENDER_INSTANCE_ID || 'local'}`;

let shuttingDown = false;
process.on('SIGTERM', () => { shuttingDown = true; });
process.on('SIGINT',  () => { shuttingDown = true; });

async function main() {
  console.log(`[sync-drain] starting, workerId=${WORKER_ID}, target=${WORKER_BASE_URL}`);
  if (!isInforSyncQueueEnabled()) {
    console.error('[sync-drain] INFOR_SYNC_QUEUE_ENABLED is not true; refusing to run.');
    process.exit(1);
  }
  if (!WORKER_BASE_URL) {
    console.error('[sync-drain] WORKER_BASE_URL not set; refusing to run.');
    process.exit(1);
  }
  while (!shuttingDown) {
    try {
      const result = await processQueueTick(WORKER_BASE_URL, WORKER_SECRET);
      if ((result?.leasedTasks ?? 0) === 0) {
        // Nothing to do — back off to keep DB load down.
        await sleep(POLL_INTERVAL_MS * 5);
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error('[sync-drain] tick failed:', err);
      await sleep(POLL_INTERVAL_MS * 5);
    }
  }
  console.log('[sync-drain] shutdown signal received, draining and exiting…');
  await prisma.$disconnect();
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('[sync-drain] fatal:', err);
  process.exit(1);
});
```

### Why a polling loop and not an event-driven trigger

The queue table is Postgres. There's no NOTIFY/LISTEN integration today, and adding one
would be more code than is justified. A 1-second poll on `pending` tasks is cheap and
keeps the drainer simple. (For comparison, the Vercel cron ticks every 60 seconds.)

---

## Render service config (`render.yaml`)

```yaml
services:
  - type: worker
    name: financial-score-sync-worker
    runtime: node
    plan: starter            # 0.5 CPU / 512 MB / $7/mo
    region: oregon           # match your Vercel region (or as close as possible)
    branch: dev              # auto-deploy on dev pushes (mirrors current Vercel setup)
    buildCommand: npm install --include=dev && npx prisma generate
    startCommand: npx tsx lib/workers/sync-drain.ts
    autoDeploy: true
    envVars:
      - key: DATABASE_URL
        sync: false          # set in Render dashboard, never commit
      - key: CRON_SECRET
        sync: false          # match the value in Vercel env
      - key: WORKER_BASE_URL
        value: https://YOUR_VERCEL_DOMAIN_HERE
      - key: VERCEL_AUTOMATION_BYPASS_SECRET
        sync: false          # only if Vercel deployment protection is on
      - key: INFOR_SYNC_QUEUE_ENABLED
        value: 'true'
      - key: INFOR_SYNC_MAX_INFLIGHT_PER_SCOPE
        value: '10'          # current setting; can raise after Phase 2
      - key: WORKER_POLL_INTERVAL_MS
        value: '1000'
```

### Plan sizing

- **Starter ($7/mo, 512 MB)**: enough for 1-5 tenants. Single Postgres connection pool of
  10 fits comfortably. Recommended starting point.
- **Standard ($25/mo, 2 GB)**: for 5-50 tenants, or if you bump `tickConcurrency` higher.
- **Pro ($85/mo, 4 GB)**: enterprise scale; we don't need it now.

### Region

Pick whichever Render region has lowest latency to your Neon Postgres instance. Both
Vercel and Neon are in `us-east-1`-style regions — Render's `oregon` (us-west) would add
~70ms per Postgres round-trip, so prefer Render's `ohio` if Neon is east-coast.

---

## Phase 2 in-process refactor (deferred)

The simplest version keeps the existing HTTP hop: Render worker calls
`processQueueTick(WORKER_BASE_URL, ...)` which inside still does
`fetch('/api/infor-m3/operational-sync')` to Vercel. The 300s cap on the worker route is
still there in Phase 1 — but the cron's 60s schedule is no longer the bottleneck, and we
get continuous draining instead of once-per-minute bursts.

For the **full** speed win, Phase 2 adds an `INFOR_SYNC_INPROCESS_WORKER=true` env that
makes `processTask` skip the HTTP call and instead invoke
`syncInforM3OperationalData(task.payload)` directly. Then we can:

- Raise `resolveAdaptiveFanoutDayProgramShardSize` to e.g. 30 (one whole month per chunk
  instead of one day).
- Drop the 240s fetch timeout entirely.
- Disable the Vercel cron in `vercel.json`.

Phase 2 is **~150 lines of changes** in `sync-queue.ts` plus regression-testing the
direct call path. Recommended to do it 1-2 weeks after Phase 1 is stable.

---

## Rollout plan

### Week 1 — Phase 1 deploy (zero downtime)

1. **Day 1-2**: Build `lib/workers/sync-drain.ts` and `render.yaml`. Add `worker:sync`
   npm script. Run locally against the dev DB, watch chunks drain in real time.
2. **Day 3**: Deploy Render worker pointing at the **dev** Vercel deployment. Set
   `WORKER_BASE_URL=https://dev.financialscore.io` (or wherever dev lives). Verify it
   coexists with the Vercel cron (both drainers contending on the same queue, no
   double-processing thanks to leases).
3. **Day 4-5**: Trigger a test backfill. Compare wall-clock time and chunk-per-minute
   throughput vs. the Vercel-only baseline.

**Acceptance criteria**:
- Render worker drains tasks visibly faster than the cron-only baseline.
- Zero double-processed tasks (verify by checking `InforSyncTask.attemptCount` distribution).
- No worker crashes over 24 hours.
- Logs are readable in Render's dashboard.

### Week 2 — Cut over to Render-only

1. **Day 1**: Deploy Render worker pointing at the **prod** Vercel deployment. Verify
   throughput in prod matches dev.
2. **Day 3**: Edit `vercel.json` to remove the `process-infor-sync-runs` cron entry.
   Push to dev, then promote to prod. Vercel cron stops; Render worker is sole drainer.
3. **Day 5**: Monitor for 48 hours. Watch `InforSyncRun.status='failed'` rate and
   `lastChunkAt` lag.

**Rollback**: re-add the cron entry in `vercel.json` and push. Vercel cron resumes within
1 minute. Render worker can be left running (idempotent) or paused via Render dashboard.

### Week 3 — Phase 2 in-process refactor

1. Add `INFOR_SYNC_INPROCESS_WORKER` flag to `processTask`.
2. When enabled: `syncInforM3OperationalData(task.payload)` direct call instead of HTTP.
3. Test on dev backfill. Verify chunk timing drops dramatically (no HTTP overhead).
4. Raise `INFOR_SYNC_FANOUT_DAY_PROGRAM_SHARD_SIZE` to 30 (one month per chunk).
5. Re-trigger a test backfill, expect ~95% chunk count reduction.
6. Promote to prod.

### Week 4 — Documentation + tuning

1. Document operational runbook: how to scale, how to read worker logs, how to roll back.
2. Tune `WORKER_POLL_INTERVAL_MS` and `tickConcurrency` based on observed throughput.
3. Decide whether to scale up worker plan (Starter → Standard) based on memory and CPU.

**Total engineering time**: ~3-5 working days spread over 4 weeks (most of the time is
observation, not coding).

---

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Two drainers double-process a task | Low | Wasted compute, no data loss | Postgres lease semantics already enforce single-leaseholder. Verified safe by code inspection (leaseOwner + leaseExpiresAt with row-level locking). |
| Worker crashes mid-task | Medium | Task lease expires after `LEASE_SECONDS=120`, retried by another drainer | Already handled: `requeueExpiredLeasedTasks()` recovers any orphaned leases. |
| Postgres connection pool exhaustion | Low | New tasks queue up | Prisma default pool is 10. With 1 worker instance making ~5 concurrent inflight calls, we use < 6. Monitor via Neon dashboard. |
| Worker can't reach Vercel during outage | Low | Tasks pile up in `pending` | Phase 2 eliminates this dependency entirely. In Phase 1, falls back to Vercel cron. |
| Render auto-deploys a broken commit | Medium | Worker stops draining | `autoDeploy: true` from `dev` mirrors current Vercel setup. To be safer, switch to a dedicated `worker-prod` branch that you manually fast-forward when ready to release worker changes. |
| Schema drift between worker and DB | Low | Prisma client errors | Worker imports same `lib/prisma.ts` and runs `prisma generate` on every Render build. Migrations still run via existing pipeline. |
| Cost overrun if scaled up too eagerly | Low | $25/mo wasted | Start on Starter plan ($7/mo). Render alerts on resource usage. |
| Render service goes down | Low | Tasks pile up; queue resumes when service returns | `InforSyncTask` is durable. Re-add Vercel cron temporarily as fallback if Render outage exceeds 30 min. |
| Logs are scattered across Vercel and Render | High | Harder debugging | Mitigated in Phase 2 (when worker route is no longer called). For Phase 1, document where to look. Optional later: forward both to a single log aggregator. |

---

## Open questions for Steve before implementation

1. **Render account**: do you already have one, or do I assume it needs to be created?
   (If new: signup is free, billing kicks in only when you deploy a paid service.)
2. **Branch strategy**: should the worker auto-deploy from `dev` (matches current Vercel
   flow), from `production`, or from a dedicated `worker-prod` branch?
3. **Vercel domain for worker callbacks**: what URL should `WORKER_BASE_URL` point to?
   (Probably your custom domain, not the per-deployment `*.vercel.app` URL — those
   change with each deploy.)
4. **Vercel deployment protection**: is it on? If yes, we need
   `VERCEL_AUTOMATION_BYPASS_SECRET` set on the Render side too (already set on the
   Vercel cron path; we just copy it).
5. **Phase 2 timing**: are you OK with deferring the in-process refactor (2-week gap),
   or do you want it bundled into the initial rollout?

---

## What this design intentionally does NOT do

- **Does not change the queue model.** Postgres-backed `InforSyncRun` and `InforSyncTask`
  tables stay exactly as they are. Lease semantics, retry counting, fan-out math —
  unchanged. This is purely a transport change.
- **Does not introduce a new vendor service** beyond Render compute. No Inngest, no
  Trigger.dev, no Temporal, no Kafka, no Redis. The Postgres queue is sufficient up to
  ~500 tenants based on simple lease throughput math.
- **Does not refactor `operational-sync.ts`.** The 2,200-line sync function works; we
  just call it from a different entrypoint.
- **Does not add new monitoring tooling.** Render's built-in logs + your existing
  `notifyAdminsOfSyncFailure` alerts cover the operational visibility need. We can
  layer Datadog/Sentry/etc later if you want, separately.

---

## Bottom line

You already have everything you need except a 100-line entrypoint and a Render config
file. The expensive parts (Postgres-backed queue, idempotent task processing, lease
semantics, retry logic, fan-out math) are already built. We're swapping a serverless
cron for an always-on Node process and that single change unblocks ~10× speedup,
unlimited chunk size, and removes the most fragile architectural assumption in the
sync pipeline.

This is the right call.
