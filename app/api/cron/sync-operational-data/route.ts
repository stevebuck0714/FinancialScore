import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runOperationalSyncForConnection } from '@/lib/operational-sync/runner';
import { extractDailyFinancialMappedLinesFromMetadata, extractDailyFinancialRecordsFromMetadata, ingestDailyFinancialSnapshots } from '@/lib/financial/daily-financial-ingest';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';

const OPERATIONAL_SYNC_TIME_ZONE = 'America/New_York';

function normalizePullTime(value: unknown): string {
  if (typeof value !== 'string') return '08:00';
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : '08:00';
}

function getTimeZoneNowParts(timeZone: string): {
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=Sun, 1=Mon ... 6=Sat
  dayOfMonth: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = String(map.weekday || '').slice(0, 3);
  const weekdayToNumber: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    hour: Number.parseInt(String(map.hour || '0'), 10) || 0,
    minute: Number.parseInt(String(map.minute || '0'), 10) || 0,
    dayOfWeek: weekdayToNumber[weekday] ?? 0,
    dayOfMonth: Number.parseInt(String(map.day || '1'), 10) || 1,
  };
}

function readOperationalPullTime(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '08:00';
  const source = metadata as Record<string, unknown>;
  const direct = normalizePullTime(source.operationalPullTime);
  if (direct !== '08:00' || source.operationalPullTime === '08:00') return direct;

  const settingsKeys = [
    'quickbooksOnlineSettings',
    'quickbooksDesktopSettings',
    'dynamicsSettings',
    'acumaticaSettings',
    'odooSettings',
    'sageIntacctSettings',
  ] as const;

  for (const key of settingsKeys) {
    const settings = source[key];
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      const time = normalizePullTime((settings as Record<string, unknown>).syncTime);
      if (time !== '08:00' || (settings as Record<string, unknown>).syncTime === '08:00') {
        return time;
      }
    }
  }

  return '08:00';
}

function shouldRunForFrequency(frequency: string, pullTime: string): boolean {
  const normalized = String(frequency || 'daily').toLowerCase();
  const [scheduledHour, scheduledMinute] = normalizePullTime(pullTime).split(':').map((value) => Number(value));
  const now = getTimeZoneNowParts(OPERATIONAL_SYNC_TIME_ZONE);
  if (now.hour !== scheduledHour || now.minute !== scheduledMinute) {
    return false;
  }
  if (normalized === 'daily') return true;
  if (normalized === 'weekly') return now.dayOfWeek === 0; // Sunday in OPERATIONAL_SYNC_TIME_ZONE
  if (normalized === 'monthly') return now.dayOfMonth === 1; // first day in OPERATIONAL_SYNC_TIME_ZONE
  return false;
}

/**
 * Cron Job: Sync Operational Data
 * 
 * This endpoint is called daily by Vercel Cron to sync operational data
 * from accounting platforms (QuickBooks, Xero, Sage, etc.)
 * 
 * Security: Protected by Vercel Cron secret
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is called by Vercel Cron
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.error('🚫 Unauthorized cron job attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('🕐 Starting daily operational data sync...');
    const startTime = Date.now();
    
    // Get all active connections with auto-sync enabled.
    const connections = await prisma.accountingConnection.findMany({
      where: {
        status: 'ACTIVE',
        autoSync: true,
      },
      select: {
        id: true,
        companyId: true,
        platform: true,
        accessToken: true,
        connectionMetadata: true,
        syncFrequency: true,
        company: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        companyId: 'asc',
      },
    });

    const runnableConnections = connections.filter((connection) =>
      shouldRunForFrequency(
        connection.syncFrequency || 'daily',
        readOperationalPullTime(connection.connectionMetadata)
      )
    );
    
    console.log(
      `📊 Found ${connections.length} auto-sync connections (${runnableConnections.length} runnable now) in ${OPERATIONAL_SYNC_TIME_ZONE}`
    );
    
    if (runnableConnections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No connections due for auto-sync at this time',
        companiesSynced: 0,
        totalRecords: 0,
        duration: Date.now() - startTime
      });
    }
    
    const results = [];
    let totalRecords = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // Sync each connection
    for (const connection of runnableConnections) {
      try {
        console.log(`\n💼 Syncing company: ${connection.companyId} (${connection.platform})`);

        const syncResult = await runOperationalSyncForConnection(connection, connection.syncFrequency || 'daily');
        const dailyRecords = extractDailyFinancialRecordsFromMetadata(connection.connectionMetadata);
        const dailyMappedLines = extractDailyFinancialMappedLinesFromMetadata(connection.connectionMetadata);
        let dailyFinancialIngested = 0;
        let dailyFinancialSkipped = 0;
        let dailyFinancialError: string | null = null;

        if (dailyRecords.length > 0) {
          const ingestResult = await ingestDailyFinancialSnapshots({
            companyId: connection.companyId,
            platform: String(connection.platform),
            runId: `${connection.id}:${Date.now()}`,
            frequency: 'daily',
            records: dailyRecords,
            mappedLines: dailyMappedLines,
          });
          dailyFinancialIngested = ingestResult.ingested;
          dailyFinancialSkipped = ingestResult.skipped;
          dailyFinancialError = ingestResult.error || null;
          if (ingestResult.error) {
            console.error(`⚠️ ${connection.company?.name}: Daily financial ingest issue: ${ingestResult.error}`);
          } else if (ingestResult.ingested > 0) {
            console.log(`📘 ${connection.company?.name}: Daily financial snapshots ingested: ${ingestResult.ingested}`);
          }
        }

        totalRecords += syncResult.recordsCreated;
        if (syncResult.success) {
          console.log(`✅ ${connection.company?.name}: ${syncResult.recordsCreated} records synced`);
          successCount++;
        } else {
          console.error(`⚠️ ${connection.company?.name}: Partial sync with errors:`, syncResult.errors);
          errorCount++;
          await notifyAdminsOfSyncFailure({
            companyId: connection.companyId,
            platform: connection.platform,
            syncType: 'auto_operational_sync',
            errorSummary: `Operational sync failed for ${connection.platform}`,
            errorDetails: (syncResult.errors || []).join(' | ').slice(0, 500),
          });
        }
        
        // Update last sync timestamp
        await prisma.accountingConnection.updateMany({
          where: {
            id: connection.id,
            status: 'ACTIVE',
          },
          data: {
            lastSyncAt: new Date(),
            errorMessage: syncResult.success ? null : (syncResult.errors || []).join(' | ').slice(0, 900),
          },
        });
        
        results.push({
          companyId: connection.companyId,
          companyName: connection.company?.name,
          platform: connection.platform,
          success: syncResult.success,
          recordsCreated: syncResult.recordsCreated,
          errors: syncResult.errors,
          dailyFinancialRecordsIngested: dailyFinancialIngested,
          dailyFinancialRecordsSkipped: dailyFinancialSkipped,
          dailyFinancialError,
        });
        
      } catch (error: any) {
        console.error(`❌ Error syncing company ${connection.companyId}:`, error);
        errorCount++;
        await notifyAdminsOfSyncFailure({
          companyId: connection.companyId,
          platform: connection.platform,
          syncType: 'auto_operational_sync',
          errorSummary: `Operational sync exception for ${connection.platform}`,
          errorDetails: String(error?.message || error || 'Unknown error').slice(0, 500),
        });
        
        results.push({
          companyId: connection.companyId,
          companyName: connection.company?.name,
          platform: connection.platform,
          success: false,
          error: error.message,
        });
        
        // Update connection with error
        await prisma.accountingConnection.update({
          where: {
            id: connection.id,
          },
          data: {
            errorMessage: error.message,
          },
        });
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`\n✨ Sync complete in ${duration}ms`);
    console.log(`   Success: ${successCount}, Errors: ${errorCount}`);
    console.log(`   Total records created: ${totalRecords}`);
    
    return NextResponse.json({
      success: errorCount === 0,
      message: `Synced ${successCount} of ${runnableConnections.length} connections`,
      companiesSynced: successCount,
      companiesWithErrors: errorCount,
      totalRecords,
      duration,
      results
    });
    
  } catch (error: any) {
    console.error('❌ Fatal error in sync job:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Manual trigger endpoint (for testing)
 * Only available in development or with admin authentication
 */
export async function POST(request: NextRequest) {
  // TODO: Add admin authentication check
  
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Manual sync only available in development' },
      { status: 403 }
    );
  }
  
  // Call the GET handler (which does the actual sync)
  return GET(request);
}

