import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Cron endpoint to keep the database warm and prevent autosuspend.
 * Schedule: every 5 minutes
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';

    if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
      console.error('❌ Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Keepalive cron failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Keepalive failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
