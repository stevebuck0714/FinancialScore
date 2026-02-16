import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredDevices } from '@/lib/trusted-device';

// This route reads request headers for auth verification, so it must be dynamic.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Cron endpoint for cleaning up expired trusted devices
 * This endpoint should be called by a cron job (e.g., Vercel Cron)
 * 
 * Schedule: Daily at 2 AM
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security (optional but recommended in production)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('❌ Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🧹 Starting scheduled cleanup of expired trusted devices...');
    const count = await cleanupExpiredDevices();
    
    console.log(`✅ Cleanup complete. Removed ${count} expired device(s).`);
    
    return NextResponse.json({ 
      success: true, 
      cleaned: count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Cron cleanup failed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Cleanup failed',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}

