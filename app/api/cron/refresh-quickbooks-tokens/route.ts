import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getValidQuickBooksToken, isQuickBooksReconnectRequired } from '@/lib/quickbooks-online/token-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Cron endpoint to proactively rotate QuickBooks OAuth tokens.
 * Goal: avoid refresh-token inactivity expiry by refreshing regularly.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';

    if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connections = await prisma.accountingConnection.findMany({
      where: {
        platform: 'QUICKBOOKS',
        refreshToken: { not: null },
        accessToken: { not: null },
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No QuickBooks connections found for token refresh.',
        total: 0,
        refreshed: 0,
        failed: 0,
      });
    }

    let refreshed = 0;
    let failed = 0;
    const failures: Array<{ companyId: string; reason: string }> = [];

    for (const connection of connections) {
      try {
        await getValidQuickBooksToken(connection.id, {
          forceRefresh: true,
          reason: 'scheduled proactive token rotation',
        });
        refreshed += 1;
      } catch (error: any) {
        failed += 1;
        const reason = String(error?.message || 'Unknown token refresh error').slice(0, 500);
        failures.push({ companyId: connection.companyId, reason });

        await prisma.accountingConnection.update({
          where: { id: connection.id },
          data: {
            status: isQuickBooksReconnectRequired(reason) ? 'EXPIRED' : 'ACTIVE',
            errorMessage: `Scheduled token refresh failed: ${reason}`.slice(0, 900),
          },
        });
      }
    }

    return NextResponse.json({
      success: failed === 0,
      total: connections.length,
      refreshed,
      failed,
      failures,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to refresh QuickBooks tokens',
      },
      { status: 500 }
    );
  }
}

