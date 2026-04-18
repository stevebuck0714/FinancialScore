/**
 * Standalone Infor sync drainer for the Render Background Worker.
 *
 * Runs as a long-lived Node process (no Vercel maxDuration cap). Continuously
 * polls the InforSyncTask queue and dispatches work to the Vercel
 * operational-sync route via HTTP — same code path as the Vercel cron at
 * `/api/cron/process-infor-sync-runs`, just on a tight loop instead of one
 * tick every 60 seconds.
 *
 * Safe to run alongside the existing Vercel cron during cutover: the queue's
 * leaseOwner / leaseExpiresAt semantics prevent double-processing.
 */
import prisma from '@/lib/prisma';
import {
  isInforSyncQueueEnabled,
  processQueueTick,
} from '@/lib/infor-m3/sync-queue';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 1000);
const IDLE_BACKOFF_MS = Number(process.env.WORKER_IDLE_BACKOFF_MS || 5000);
const HEARTBEAT_INTERVAL_MS = Number(
  process.env.WORKER_HEARTBEAT_INTERVAL_MS || 60_000
);

const WORKER_BASE_URL = String(process.env.WORKER_BASE_URL || '').trim();
const WORKER_SECRET = String(process.env.CRON_SECRET || '').trim();

let shuttingDown = false;
let lastHeartbeatLogAt = 0;
let totalTicks = 0;
let totalLeased = 0;

function ts(): string {
  return new Date().toISOString();
}

function log(...args: unknown[]): void {
  console.log(`[sync-drain ${ts()}]`, ...args);
}

function logError(...args: unknown[]): void {
  console.error(`[sync-drain ${ts()}]`, ...args);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function registerSignals(): void {
  const handle = (sig: string) => {
    log(`${sig} received — finishing current tick then exiting`);
    shuttingDown = true;
  };
  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logError('unhandledRejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    logError('uncaughtException:', err);
  });
}

async function tick(): Promise<{
  leased: number;
  reclaimed: number;
  promoted: number;
  timedOut: number;
}> {
  const result = (await processQueueTick(
    WORKER_BASE_URL,
    WORKER_SECRET
  )) as Record<string, unknown>;
  return {
    leased: Number(result?.leasedTasks ?? 0),
    reclaimed: Number(result?.reclaimedExpiredLeases ?? 0),
    promoted: Number(result?.promotedRuns ?? 0),
    timedOut: Number(result?.timedOutRuns ?? 0),
  };
}

async function main(): Promise<void> {
  if (!WORKER_BASE_URL) {
    logError('WORKER_BASE_URL is required (e.g. https://dashboard.corelytics.com)');
    process.exit(1);
  }
  if (!WORKER_SECRET) {
    logError('CRON_SECRET is required (must match the Vercel value)');
    process.exit(1);
  }
  if (!isInforSyncQueueEnabled()) {
    logError('INFOR_SYNC_QUEUE_ENABLED must be true; refusing to run');
    process.exit(1);
  }

  registerSignals();
  log(
    `starting; target=${WORKER_BASE_URL} pollIntervalMs=${POLL_INTERVAL_MS} idleBackoffMs=${IDLE_BACKOFF_MS}`
  );

  let consecutiveErrors = 0;

  while (!shuttingDown) {
    const startedAt = Date.now();
    try {
      const r = await tick();
      consecutiveErrors = 0;
      totalTicks += 1;
      totalLeased += r.leased;

      const hadActivity =
        r.leased > 0 || r.reclaimed > 0 || r.promoted > 0 || r.timedOut > 0;

      if (hadActivity) {
        log(
          `tick: leased=${r.leased} reclaimed=${r.reclaimed} promoted=${r.promoted} timedOut=${r.timedOut} elapsedMs=${Date.now() - startedAt}`
        );
      }

      // Periodic heartbeat so we can confirm the worker is alive even when idle.
      const now = Date.now();
      if (now - lastHeartbeatLogAt >= HEARTBEAT_INTERVAL_MS) {
        log(
          `heartbeat: totalTicks=${totalTicks} totalLeased=${totalLeased} idle=${!hadActivity}`
        );
        lastHeartbeatLogAt = now;
      }

      await sleep(r.leased > 0 ? POLL_INTERVAL_MS : IDLE_BACKOFF_MS);
    } catch (err) {
      consecutiveErrors += 1;
      logError(
        `tick failed (consecutiveErrors=${consecutiveErrors}):`,
        err instanceof Error ? err.stack || err.message : err
      );
      // Exponential-ish backoff so we don't hammer DB/Vercel during a sustained outage.
      const backoff = Math.min(60_000, IDLE_BACKOFF_MS * Math.min(8, consecutiveErrors));
      await sleep(backoff);
    }
  }

  log('graceful shutdown: disconnecting Prisma…');
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  log('exited cleanly');
  process.exit(0);
}

main().catch((err) => {
  logError('fatal:', err);
  process.exit(1);
});
