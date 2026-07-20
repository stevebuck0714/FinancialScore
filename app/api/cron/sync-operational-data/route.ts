import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runOperationalSyncForConnection } from '@/lib/operational-sync/runner';
import { extractDailyFinancialMappedLinesFromMetadata, extractDailyFinancialRecordsFromMetadata, ingestDailyFinancialSnapshots } from '@/lib/financial/daily-financial-ingest';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';
import { warmDailyExecutiveBriefingCache } from '@/lib/pulse/exec-briefing-warmup';
import { warmDailyIndustryBriefCache } from '@/lib/industry-brief/warmup';
import { autoQueueDueQuickBooksDesktopFinancialJobs } from '@/lib/quickbooks-desktop/auto-queue';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const maxDuration = 300;

const OPERATIONAL_SYNC_TIME_ZONE = 'America/New_York';
const DUE_LOOKBACK_HOURS = 36;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasQuickBooksDesktopRequiredSetup(metadataValue: unknown): boolean {
  const metadata = asRecord(metadataValue);
  const settings = asRecord(metadata.quickbooksDesktopSettings);
  const credentials = asRecord(metadata.quickbooksDesktopCredentials);
  const requiredKeys = [
    'integrationType',
    'applicationName',
    'ownerId',
    'fileId',
    'webConnectorUsername',
    'desktopEditionYear',
    'countryVersion',
    'companyFilePath',
    'hostMachineName',
  ];
  if (requiredKeys.some((key) => !asString(settings[key]))) return false;
  if (asString(settings.integrationType) === 'WEB_CONNECTOR' && !asString(settings.soapEndpointUrl)) return false;
  return Boolean(asString(credentials.webConnectorPasswordEncrypted));
}

function normalizePullTime(value: unknown): string {
  if (typeof value !== 'string') return '08:00';
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : '08:00';
}

function getTimeZoneNowParts(timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=Sun, 1=Mon ... 6=Sat
  dayOfMonth: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
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
    year: Number.parseInt(String(map.year || '0'), 10) || 0,
    month: Number.parseInt(String(map.month || '0'), 10) || 0,
    day: Number.parseInt(String(map.day || '0'), 10) || 0,
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

function addLocalDays(parts: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedLocalTimeToUtc(local: { year: number; month: number; day: number; hour: number; minute: number }): Date {
  const desiredWallClockMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  const guess = new Date(desiredWallClockMs);
  const actualAtGuess = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_SYNC_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const actualMap = Object.fromEntries(actualAtGuess.map((part) => [part.type, part.value]));
  const actualWallClockMs = Date.UTC(
    Number(actualMap.year),
    Number(actualMap.month) - 1,
    Number(actualMap.day),
    Number(actualMap.hour),
    Number(actualMap.minute),
    0
  );
  return new Date(guess.getTime() - (actualWallClockMs - desiredWallClockMs));
}

function latestExpectedRunAt(frequency: string, pullTime: string, now = new Date()): Date | null {
  const normalized = String(frequency || 'daily').toLowerCase();
  const [scheduledHour, scheduledMinute] = normalizePullTime(pullTime).split(':').map((value) => Number(value));
  const nowParts = getTimeZoneNowParts(OPERATIONAL_SYNC_TIME_ZONE);
  let localDate = { year: nowParts.year, month: nowParts.month, day: nowParts.day };

  if (normalized === 'weekly') {
    localDate = addLocalDays(localDate, -nowParts.dayOfWeek);
  } else if (normalized === 'monthly') {
    localDate = { ...localDate, day: 1 };
  } else if (normalized !== 'daily') {
    return null;
  }

  let expected = zonedLocalTimeToUtc({
    ...localDate,
    hour: scheduledHour,
    minute: scheduledMinute,
  });

  if (expected.getTime() > now.getTime()) {
    if (normalized === 'daily') {
      localDate = addLocalDays(localDate, -1);
    } else if (normalized === 'weekly') {
      localDate = addLocalDays(localDate, -7);
    } else {
      const previousMonth = new Date(Date.UTC(localDate.year, localDate.month - 2, 1));
      localDate = {
        year: previousMonth.getUTCFullYear(),
        month: previousMonth.getUTCMonth() + 1,
        day: 1,
      };
    }
    expected = zonedLocalTimeToUtc({
      ...localDate,
      hour: scheduledHour,
      minute: scheduledMinute,
    });
  }

  return expected;
}

function isConnectionDue(connection: { syncFrequency: string | null; connectionMetadata: unknown; lastSyncAt: Date | null }): boolean {
  const expected = latestExpectedRunAt(
    connection.syncFrequency || 'daily',
    readOperationalPullTime(connection.connectionMetadata)
  );
  if (!expected) return false;
  if (Date.now() - expected.getTime() > DUE_LOOKBACK_HOURS * 60 * 60 * 1000) return false;
  return !connection.lastSyncAt || connection.lastSyncAt.getTime() < expected.getTime();
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
    const qbdAutoQueue = await autoQueueDueQuickBooksDesktopFinancialJobs();
    if (qbdAutoQueue.queued > 0) {
      console.log(
        `📚 Queued QuickBooks Desktop Web Connector jobs for ${qbdAutoQueue.queued} companies (target ${qbdAutoQueue.targetDate})`
      );
    }
    
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
        lastSyncAt: true,
        company: {
          select: {
            name: true,
            accountingSystem: true,
          },
        },
      },
      orderBy: {
        companyId: 'asc',
      },
    });

    const activeInforRuns = await prisma.inforSyncRun.findMany({
      where: {
        status: { in: ['queued', 'running'] },
        companyId: { in: connections.map((connection) => connection.companyId) },
      },
      select: { companyId: true, platform: true },
    });
    const activeInforRunKeys = new Set(
      activeInforRuns.map((run) => `${run.companyId}:${run.platform || 'INFOR_M3'}`)
    );
    const runnableConnections = connections.filter((connection) => {
      if (!isConnectionDue(connection)) return false;
      if (
        isQuickBooksDesktopFamily(connection.company?.accountingSystem) &&
        !hasQuickBooksDesktopRequiredSetup(connection.connectionMetadata)
      ) {
        return false;
      }
      if (
        connection.platform === 'INFOR_M3' &&
        activeInforRunKeys.has(`${connection.companyId}:INFOR_M3`)
      ) {
        return false;
      }
      return true;
    });
    
    console.log(
      `📊 Found ${connections.length} auto-sync connections (${runnableConnections.length} runnable now) in ${OPERATIONAL_SYNC_TIME_ZONE}`
    );
    
    if (runnableConnections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No connections due for auto-sync at this time',
        companiesSynced: 0,
        totalRecords: 0,
        qbdAutoQueue,
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
        let executiveBriefingWarmed = false;
        let executiveBriefingError: string | null = null;
        let industryBriefWarmed = false;
        let industryBriefError: string | null = null;

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
            status: syncResult.success ? 'ACTIVE' : 'ERROR',
            lastSyncAt: new Date(),
            errorMessage: syncResult.success ? null : (syncResult.errors || []).join(' | ').slice(0, 900),
          },
        });

        if (syncResult.success) {
          const briefingWarmup = await warmDailyExecutiveBriefingCache({
            companyId: connection.companyId,
            baseUrl: request.nextUrl.origin,
            source: `nightly-${String(connection.platform).toLowerCase()}-sync`,
          });
          executiveBriefingWarmed = briefingWarmup.ok;
          executiveBriefingError = briefingWarmup.error || null;
          if (!briefingWarmup.ok) {
            console.warn(`⚠️ ${connection.company?.name}: Daily Executive Briefing warm-up failed: ${briefingWarmup.error || 'unknown error'}`);
          }
          const industryBriefWarmup = await warmDailyIndustryBriefCache({
            companyId: connection.companyId,
            baseUrl: request.nextUrl.origin,
            source: `nightly-${String(connection.platform).toLowerCase()}-sync`,
          });
          industryBriefWarmed = industryBriefWarmup.ok;
          industryBriefError = industryBriefWarmup.error || null;
          if (!industryBriefWarmup.ok) {
            console.warn(`⚠️ ${connection.company?.name}: Daily Industry Brief warm-up failed: ${industryBriefWarmup.error || 'unknown error'}`);
          }
        }
        
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
          executiveBriefingWarmed,
          executiveBriefingError,
          industryBriefWarmed,
          industryBriefError,
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
            status: 'ERROR',
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
      qbdAutoQueue,
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

