import { NextRequest, NextResponse } from 'next/server';
import { processQuickBooksOperationalBackfillStep } from '@/lib/quickbooks-online/operational-orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Continues QuickBooks Online 3-year operational backfills one calendar month per invocation.
 * Triggered after client sync starts a backfill, and on a short cron as a safety net.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';

    if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await processQuickBooksOperationalBackfillStep();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
