import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runOperationalSyncForConnection } from '@/lib/operational-sync/runner';

function shouldRunForFrequency(frequency: string): boolean {
  const normalized = String(frequency || 'daily').toLowerCase();
  const now = new Date();
  if (normalized === 'daily') return true;
  if (normalized === 'weekly') return now.getUTCDay() === 0; // Sunday UTC
  if (normalized === 'monthly') return now.getUTCDate() === 1; // first day UTC
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
      shouldRunForFrequency(connection.syncFrequency || 'daily')
    );
    
    console.log(`📊 Found ${connections.length} auto-sync connections (${runnableConnections.length} runnable now)`);
    
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

        totalRecords += syncResult.recordsCreated;
        if (syncResult.success) {
          console.log(`✅ ${connection.company?.name}: ${syncResult.recordsCreated} records synced`);
          successCount++;
        } else {
          console.error(`⚠️ ${connection.company?.name}: Partial sync with errors:`, syncResult.errors);
          errorCount++;
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
        });
        
      } catch (error: any) {
        console.error(`❌ Error syncing company ${connection.companyId}:`, error);
        errorCount++;
        
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

