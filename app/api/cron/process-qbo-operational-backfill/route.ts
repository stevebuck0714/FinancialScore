import { NextRequest, NextResponse, after } from 'next/server';
import {
  claimQuickBooksBackfillLease,
  processQuickBooksOperationalBackfillStep,
  releaseQuickBooksBackfillLease,
} from '@/lib/quickbooks-online/operational-orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MONTH_LOOP_BUDGET_MS = 240_000;

/**
 * Continues QuickBooks Online 3-year operational backfills, as many calendar
 * months as fit in one invocation. Triggered once after a client sync starts a
 * backfill, and on a short cron as a safety net. Months are processed in a loop
 * rather than by the worker calling itself, which Vercel stops as a recursion loop.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';

  if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  after(async () => {
    const startedAt = Date.now();
    let monthsProcessed = 0;
    const leasedConnectionId = await claimQuickBooksBackfillLease(maxDuration * 1000);
    if (!leasedConnectionId) return;
    try {
      while (Date.now() - startedAt < MONTH_LOOP_BUDGET_MS) {
        const result = await processQuickBooksOperationalBackfillStep();
        if (!result.processed) break;
        monthsProcessed += 1;
        if (result.error) {
          console.error('[QBO backfill] Month failed:', { companyId: result.companyId, error: result.error });
          break;
        }
      }
    } catch (error) {
      console.error('[QBO backfill] Worker failed:', error);
    } finally {
      await releaseQuickBooksBackfillLease(leasedConnectionId).catch(() => undefined);
    }
    console.log('[QBO backfill] Worker finished', { monthsProcessed, elapsedMs: Date.now() - startedAt });
  });

  return NextResponse.json({ success: true, accepted: true, timestamp: new Date().toISOString() });
}
