import { NextRequest, NextResponse } from 'next/server';
import { AdapterFactory } from '@/lib/accounting-adapters';
import prisma from '@/lib/prisma';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';

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
    
    // Get all companies with auto-sync enabled
    const companyIds = await AdapterFactory.getCompaniesForAutoSync();
    
    console.log(`📊 Found ${companyIds.length} companies with auto-sync enabled`);
    
    if (companyIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No companies configured for auto-sync',
        companiesSynced: 0,
        totalRecords: 0,
        duration: Date.now() - startTime
      });
    }
    
    const results = [];
    let totalRecords = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // Sync each company
    for (const companyId of companyIds) {
      try {
        console.log(`\n💼 Syncing company: ${companyId}`);
        
        // Get company name for logging
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { name: true }
        });
        const activeConnection = await prisma.accountingConnection.findFirst({
          where: { companyId, status: 'ACTIVE' },
          select: { platform: true },
        });
        const platform = activeConnection?.platform || 'QUICKBOOKS';
        
        // Create adapter for this company
        const adapter = await AdapterFactory.createForCompany(companyId);
        
        // Test connection first
        const isConnected = await adapter.testConnection();
        if (!isConnected) {
          console.error(`❌ Connection test failed for ${company?.name}`);
          results.push({
            companyId,
            companyName: company?.name,
            success: false,
            error: 'Connection test failed'
          });
          errorCount++;
          continue;
        }
        
        // Sync all operational data
        const syncResult = await adapter.syncAll('daily');
        
        totalRecords += syncResult.recordsCreated;
        
        if (syncResult.success) {
          console.log(`✅ ${company?.name}: ${syncResult.recordsCreated} records synced`);
          successCount++;
        } else {
          console.error(`⚠️  ${company?.name}: Partial sync with errors:`, syncResult.errors);
          errorCount++;
          await notifyAdminsOfSyncFailure({
            companyId,
            platform,
            syncType: 'auto_operational_sync',
            errorSummary: `Operational sync failed for ${platform}`,
            errorDetails: (syncResult.errors || []).join(' | ').slice(0, 500),
          });
        }
        
        // Update last sync timestamp
        await prisma.accountingConnection.updateMany({
          where: {
            companyId,
            status: 'ACTIVE'
          },
          data: {
            lastSyncAt: new Date()
          }
        });
        
        results.push({
          companyId,
          companyName: company?.name,
          success: syncResult.success,
          recordsCreated: syncResult.recordsCreated,
          errors: syncResult.errors
        });
        
      } catch (error: any) {
        console.error(`❌ Error syncing company ${companyId}:`, error);
        errorCount++;
        const activeConnection = await prisma.accountingConnection.findFirst({
          where: { companyId, status: 'ACTIVE' },
          select: { platform: true },
        });
        const platform = activeConnection?.platform || 'QUICKBOOKS';
        await notifyAdminsOfSyncFailure({
          companyId,
          platform,
          syncType: 'auto_operational_sync',
          errorSummary: `Operational sync exception for ${platform}`,
          errorDetails: String(error?.message || error || 'Unknown error').slice(0, 500),
        });
        
        results.push({
          companyId,
          success: false,
          error: error.message
        });
        
        // Update connection with error
        await prisma.accountingConnection.updateMany({
          where: {
            companyId,
            status: 'ACTIVE'
          },
          data: {
            errorMessage: error.message
          }
        });
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`\n✨ Sync complete in ${duration}ms`);
    console.log(`   Success: ${successCount}, Errors: ${errorCount}`);
    console.log(`   Total records created: ${totalRecords}`);
    
    return NextResponse.json({
      success: errorCount === 0,
      message: `Synced ${successCount} of ${companyIds.length} companies`,
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

