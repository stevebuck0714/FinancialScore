import { NextRequest, NextResponse } from 'next/server';
import OAuthClient from 'intuit-oauth';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { createMonthlyRecords } from '@/lib/quickbooks-parser';
import { CompanyLOB } from '@/lib/lob-allocator';
import {
  buildMasterDataRows,
  findZeroRevenueAnomalies,
  toCanonicalMonthlyFinancial,
  toMonthlyFinancialCreateInput,
} from '@/lib/financial-canonical';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';
import { emitSyncStatus } from '@/lib/websocket-emit';

// Decrypt OAuth tokens using modern cipher
function decryptToken(encryptedToken: string): string {
  const key = process.env.OAUTH_ENCRYPTION_KEY || 'default-key-change-me-in-prod';
  const keyBuffer = Buffer.from(key.substring(0, 64), 'hex');
  // Split IV and encrypted data
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Encrypt OAuth tokens using modern cipher
function encryptToken(token: string): string {
  const key = process.env.OAUTH_ENCRYPTION_KEY || 'default-key-change-me-in-prod';
  const keyBuffer = Buffer.from(key.substring(0, 64), 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export async function POST(request: NextRequest) {
  const syncStartTime = Date.now();
  let recordsImported = 0;
  let errorCount = 0;
  const errors: any[] = [];
  let intuitTid: string | null = null; // Capture Intuit Transaction ID for debugging
  let syncTraceId: string | null = null;

  try {
    const { companyId, userId } = await request.json();
    syncTraceId = `qbo-sync-${companyId}-${Date.now()}`;
    console.log('🧭 QBO sync trace ID:', syncTraceId);

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'Company ID and User ID are required' }, { status: 400 });
    }

    // Emit sync started status
    emitSyncStatus(companyId, {
      status: 'started',
      message: 'QuickBooks sync started',
      progress: 0,
    });

    // Get connection from database
    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
    });

    if (!connection || !connection.accessToken || !connection.refreshToken) {
      return NextResponse.json({ error: 'QuickBooks not connected' }, { status: 400 });
    }

    // Decrypt tokens
    console.log('🔐 Decrypting tokens...');
    let accessToken: string;
    let refreshToken: string;
    
    try {
      accessToken = decryptToken(connection.accessToken);
      refreshToken = decryptToken(connection.refreshToken);
      console.log('✅ Tokens decrypted successfully');
      console.log('Access token length:', accessToken?.length);
      console.log('Refresh token length:', refreshToken?.length);
    } catch (decryptError) {
      console.error('❌ Token decryption failed:', decryptError);
      await prisma.accountingConnection.update({
        where: {
          companyId_platform: {
            companyId,
            platform: 'QUICKBOOKS',
          },
        },
        data: {
          status: 'ERROR',
          errorMessage: 'Token decryption failed - please reconnect',
        },
      });
      return NextResponse.json({ 
        error: 'Token decryption failed - please reconnect',
        needsReconnect: true 
      }, { status: 401 });
    }

    // Initialize OAuth client
    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback',
    });

    // Set the token directly on the client object
    (oauthClient as any).token = {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
    };

    const refreshAccessToken = async (reason: string): Promise<void> => {
      console.log(`🔄 Refreshing QuickBooks token (${reason})...`);
      try {
        const refreshResponse = await oauthClient.refresh();
        const newToken = refreshResponse.getJson();

        await prisma.accountingConnection.update({
          where: {
            companyId_platform: {
              companyId,
              platform: 'QUICKBOOKS',
            },
          },
          data: {
            accessToken: encryptToken(newToken.access_token),
            refreshToken: encryptToken(newToken.refresh_token || refreshToken),
            tokenExpiresAt: new Date(Date.now() + (newToken.expires_in || 3600) * 1000),
            status: 'ACTIVE',
            errorMessage: null,
          },
        });

        (oauthClient as any).token = newToken;
        accessToken = newToken.access_token || accessToken;
        refreshToken = newToken.refresh_token || refreshToken;
        console.log('✅ Token refreshed successfully');
      } catch (refreshError: any) {
        console.error('❌ Token refresh failed:', refreshError);
        await prisma.accountingConnection.update({
          where: {
            companyId_platform: {
              companyId,
              platform: 'QUICKBOOKS',
            },
          },
          data: {
            status: 'EXPIRED',
            errorMessage: 'Token refresh failed - please reconnect',
          },
        });
        throw refreshError;
      }
    };

    const fetchWithTokenRetry = async (url: string, label: string): Promise<Response> => {
      let response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        console.warn(`⚠️ ${label} returned ${response.status}. Attempting one token refresh + retry.`);
        await refreshAccessToken(`${label} ${response.status}`);
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });
      }

      return response;
    };

    // Check if token needs refresh (refresh 5 minutes before actual expiry as a buffer)
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    console.log('⏰ Token expiration check:');
    console.log('  Current time:', now.toISOString());
    console.log('  Token expires at:', connection.tokenExpiresAt?.toISOString() || 'Not set');
    if (connection.tokenExpiresAt) {
      const timeUntilExpiry = connection.tokenExpiresAt.getTime() - now.getTime();
      console.log('  Time until expiry:', Math.round(timeUntilExpiry / 1000 / 60) + ' minutes');
      console.log('  Token status:', timeUntilExpiry < 0 ? '❌ EXPIRED' : timeUntilExpiry < bufferTime ? '⚠️ EXPIRING SOON' : '✅ VALID');
    } else {
      console.log('  Time until expiry: Unknown');
    }
    
    const shouldRefresh = connection.tokenExpiresAt && 
                         (connection.tokenExpiresAt.getTime() - now.getTime() < bufferTime);
    
    if (shouldRefresh) {
      try {
        await refreshAccessToken('expiring soon');
      } catch (refreshError: any) {
        return NextResponse.json({ 
          error: 'Token expired - please reconnect',
          needsReconnect: true 
        }, { status: 401 });
      }
    }

    const realmId = connection.realmId;
    if (!realmId) {
      return NextResponse.json({ error: 'QuickBooks Realm ID not found' }, { status: 400 });
    }

    const baseUrl = (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox') === 'sandbox'
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';
    const companyUrl = `${baseUrl}/v3/company/${realmId}`;
    const formatDate = (date: Date): string => date.toISOString().split('T')[0];
    const monthBounds = (monthDate: Date): { start: Date; end: Date; key: string } => {
      const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      return { start, end, key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}` };
    };
    const fetchQueryRowsPaged = async (entity: string, whereClause: string): Promise<any[]> => {
      const pageSize = 1000;
      let startPosition = 1;
      const allRows: any[] = [];
      while (true) {
        const query = `SELECT * FROM ${entity} ${whereClause} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
        const url = `${companyUrl}/query?query=${encodeURIComponent(query)}&minorversion=65`;
        const response = await fetchWithTokenRetry(url, `${entity}Query`);
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`QuickBooks ${entity} query failed: ${response.status} ${body}`);
        }
        const payload = await response.json();
        const rows = payload?.QueryResponse?.[entity];
        const normalized = Array.isArray(rows) ? rows : rows ? [rows] : [];
        if (!normalized.length) break;
        allRows.push(...normalized);
        if (normalized.length < pageSize) break;
        startPosition += pageSize;
      }
      return allRows;
    };
    const fetchSalesEvidenceForMonth = async (monthDate: Date): Promise<{
      month: string;
      invoiceCount: number;
      invoiceTotal: number;
      salesReceiptCount: number;
      salesReceiptTotal: number;
      combinedTotal: number;
      error?: string;
    }> => {
      const { start, end, key } = monthBounds(monthDate);
      try {
        const whereClause = `WHERE TxnDate >= '${formatDate(start)}' AND TxnDate <= '${formatDate(end)}'`;
        const [invoices, salesReceipts] = await Promise.all([
          fetchQueryRowsPaged('Invoice', whereClause),
          fetchQueryRowsPaged('SalesReceipt', whereClause),
        ]);
        const invoiceTotal = invoices.reduce((sum, row) => sum + Number(row?.TotalAmt || 0), 0);
        const salesReceiptTotal = salesReceipts.reduce((sum, row) => sum + Number(row?.TotalAmt || 0), 0);
        return {
          month: key,
          invoiceCount: invoices.length,
          invoiceTotal,
          salesReceiptCount: salesReceipts.length,
          salesReceiptTotal,
          combinedTotal: invoiceTotal + salesReceiptTotal,
        };
      } catch (error: any) {
        return {
          month: key,
          invoiceCount: 0,
          invoiceTotal: 0,
          salesReceiptCount: 0,
          salesReceiptTotal: 0,
          combinedTotal: 0,
          error: error?.message || 'Failed to fetch sales evidence',
        };
      }
    };

    // Calculate date range - use last day of previous month as end date
    const today = new Date();
    
    // Get last day of previous month
    const endDate = new Date(today.getFullYear(), today.getMonth(), 0); // Day 0 = last day of previous month
    
    // Start date is 36 months before the end date
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 36);

    const dateStart = startDate.toISOString().split('T')[0];
    const dateEnd = endDate.toISOString().split('T')[0];
    
    console.log(`📅 QB Sync Date Range: ${dateStart} to ${dateEnd} (Last full month end)`);

    // Emit progress update
    emitSyncStatus(companyId, {
      status: 'progress',
      message: 'Fetching Profit & Loss data from QuickBooks...',
      progress: 20,
    });

    // Fetch Profit & Loss Report using direct HTTP request to avoid header size issues
    // Request monthly summarization to get end-of-month data for each month
    const plUrl = `${companyUrl}/reports/ProfitAndLoss?start_date=${dateStart}&end_date=${dateEnd}&accounting_method=Accrual&summarize_column_by=Month&minorversion=65`;
    
    let plResponse: Response;
    try {
      plResponse = await fetchWithTokenRetry(plUrl, 'ProfitAndLoss');
    } catch {
      return NextResponse.json({ 
        error: 'Token expired - please reconnect',
        needsReconnect: true 
      }, { status: 401 });
    }
    
    // Capture intuit_tid from response headers
    intuitTid = plResponse.headers.get('intuit_tid');
    if (intuitTid) {
      console.log('📋 Intuit Transaction ID (P&L):', intuitTid);
    }

    // Check if the API call failed
    if (!plResponse.ok) {
      const errorText = await plResponse.text();
      console.error('❌ QuickBooks API error - Status:', plResponse.status);
      console.error('❌ Response body:', errorText);
      console.error('❌ Request URL:', plUrl);
      console.error('❌ Access token (first 20 chars):', accessToken?.substring(0, 20) + '...');
      console.error('❌ Intuit Transaction ID:', intuitTid || 'Not available');
      
      // Handle 401/403 errors - token is invalid/expired
      if (plResponse.status === 401 || plResponse.status === 403) {
        console.error('❌ Token rejected by QuickBooks - marking connection as EXPIRED');
        await prisma.accountingConnection.update({
          where: {
            companyId_platform: {
              companyId,
              platform: 'QUICKBOOKS',
            },
          },
          data: {
            status: 'EXPIRED',
            errorMessage: 'Authorization failed - please reconnect to QuickBooks',
            lastSyncAt: new Date(),
          },
        });
        return NextResponse.json({ 
          error: 'QuickBooks authorization failed - please reconnect',
          needsReconnect: true,
          details: errorText,
          intuitTid: intuitTid 
        }, { status: 401 });
      }
      
      throw new Error(`QuickBooks API returned status ${plResponse.status}: ${errorText}`);
    }
    
    // Parse the JSON response
    const plData = await plResponse.json();
    
    // Log column structure for debugging
    const plColumns = plData?.Columns?.Column || [];
    console.log(`📊 P&L Report returned ${plColumns.length} columns`);
    console.log('Column headers:', plColumns.map((c: any) => c.ColTitle || c.ColType).join(', '));

    // Emit progress update
    emitSyncStatus(companyId, {
      status: 'progress',
      message: 'Fetching Balance Sheet data from QuickBooks...',
      progress: 50,
    });

    // Fetch Balance Sheet Report using direct HTTP request
    // Request monthly summarization to get end-of-month data for each month
    const bsUrl = `${companyUrl}/reports/BalanceSheet?start_date=${dateStart}&end_date=${dateEnd}&summarize_column_by=Month&minorversion=65`;
    
    let bsResponse: Response;
    try {
      bsResponse = await fetchWithTokenRetry(bsUrl, 'BalanceSheet');
    } catch {
      return NextResponse.json({ 
        error: 'Token expired - please reconnect',
        needsReconnect: true 
      }, { status: 401 });
    }
    
    // Capture intuit_tid from Balance Sheet response
    const bsIntuitTid = bsResponse.headers.get('intuit_tid');
    if (bsIntuitTid) {
      console.log('📋 Intuit Transaction ID (Balance Sheet):', bsIntuitTid);
      intuitTid = bsIntuitTid; // Update to latest TID
    }

    // Check if the API call failed
    if (!bsResponse.ok) {
      const errorText = await bsResponse.text();
      console.error('QuickBooks BS API error - Status:', bsResponse.status);
      console.error('Response body:', errorText);
      console.error('❌ Intuit Transaction ID:', bsIntuitTid || 'Not available');
      
      // Handle 401/403 errors - token is invalid/expired
      if (bsResponse.status === 401 || bsResponse.status === 403) {
        await prisma.accountingConnection.update({
          where: {
            companyId_platform: {
              companyId,
              platform: 'QUICKBOOKS',
            },
          },
          data: {
            status: 'EXPIRED',
            errorMessage: 'Authorization failed - please reconnect to QuickBooks',
          },
        });
        return NextResponse.json({ 
          error: 'QuickBooks authorization failed - please reconnect',
          needsReconnect: true,
          intuitTid: bsIntuitTid 
        }, { status: 401 });
      }
      
      throw new Error(`QuickBooks Balance Sheet API returned status ${bsResponse.status}: ${errorText}`);
    }
    
    // Parse the JSON response
    const bsData = await bsResponse.json();
    
    // Log column structure for debugging
    const bsColumns = bsData?.Columns?.Column || [];
    console.log(`📊 Balance Sheet returned ${bsColumns.length} columns`);
    console.log('Column headers:', bsColumns.map((c: any) => c.ColTitle || c.ColType).join(', '));

    // Emit progress update
    emitSyncStatus(companyId, {
      status: 'progress',
      message: 'Processing financial data...',
      progress: 70,
    });

    // Fetch Chart of Accounts to get account codes/numbers
    const accountsUrl = `${companyUrl}/query?query=SELECT * FROM Account&minorversion=65`;
    
    let accountsResponse: Response;
    try {
      accountsResponse = await fetchWithTokenRetry(accountsUrl, 'ChartOfAccounts');
    } catch {
      return NextResponse.json({ 
        error: 'Token expired - please reconnect',
        needsReconnect: true 
      }, { status: 401 });
    }
    
    let accountsData = null;
    if (accountsResponse.ok) {
      accountsData = await accountsResponse.json();
      console.log(`Fetched ${accountsData?.QueryResponse?.Account?.length || 0} accounts from Chart of Accounts`);
    } else {
      console.warn('Failed to fetch Chart of Accounts, continuing without account codes');
    }

    // Fetch account mappings for LOB allocation
    console.log('📋 Fetching account mappings for LOB allocation...');
    const accountMappings = await prisma.accountMapping.findMany({
      where: { companyId },
      select: {
        qbAccount: true,
        qbAccountId: true,
        targetField: true,
        lobAllocations: true,
        allocationMethod: true,
      },
    });
    console.log(`✅ Found ${accountMappings.length} account mappings (${accountMappings.filter(m => m.lobAllocations).length} with LOB allocations)`);

    // Fetch company LOBs with headcount percentages
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { linesOfBusiness: true },
    });

    let companyLOBs: CompanyLOB[] = [];
    if (company?.linesOfBusiness && Array.isArray(company.linesOfBusiness)) {
      companyLOBs = company.linesOfBusiness
        .filter((lob: any) => typeof lob === 'object' && lob.name && lob.name.trim() !== '')
        .map((lob: any) => ({
          name: lob.name,
          headcountPercentage: lob.headcountPercentage || 0
        }));
    }
    console.log(`✅ Found ${companyLOBs.length} company LOBs with headcount data`);

    // Parse monthly financial records with LOB allocations.
    const parsedRecords = createMonthlyRecords(plData, bsData, 'PENDING_FINANCIAL_RECORD', 36, accountMappings as any, companyLOBs);
    const canonicalRecords = parsedRecords.map((row) =>
      toCanonicalMonthlyFinancial({
        ...row,
        monthDate: row.monthDate,
      }),
    );
    const traceSnapshotBase = {
      syncTraceId,
      plColumns: (plColumns || []).map((c: any) => c?.ColTitle || c?.ColType || ''),
      bsColumns: (bsColumns || []).map((c: any) => c?.ColTitle || c?.ColType || ''),
      parsedTail: canonicalRecords.slice(-6).map((row) => ({
        monthDate: row.monthDate?.toISOString?.() || row.monthDate,
        revenue: row.revenue,
        cogsTotal: row.cogsTotal,
        expense: row.expense,
        totalAssets: row.totalAssets,
        totalLiab: row.totalLiab,
        totalEquity: row.totalEquity,
      })),
    };
    const validationFailures = findZeroRevenueAnomalies(canonicalRecords);

    const latestMonth = canonicalRecords.length
      ? canonicalRecords.reduce((max, row) => (row.monthDate > max ? row.monthDate : max), canonicalRecords[0].monthDate)
      : null;
    const latestMonthKey = latestMonth
      ? `${latestMonth.getFullYear()}-${String(latestMonth.getMonth() + 1).padStart(2, '0')}`
      : null;

    let blockingFailures: typeof validationFailures = [];
    let latestMonthWarnings: typeof validationFailures = [];
    let nonBlockingHistoricalWarnings: typeof validationFailures = [];

    if (validationFailures.length > 0) {
      const uniqueMonths = Array.from(new Set(validationFailures.map((f) => f.month)));
      const monthDates = uniqueMonths.map((month) => new Date(`${month}-01T00:00:00`));
      const salesEvidence = await Promise.all(monthDates.map((monthDate) => fetchSalesEvidenceForMonth(monthDate)));
      const evidenceByMonth = new Map(salesEvidence.map((entry) => [entry.month, entry]));

      latestMonthWarnings = validationFailures.filter((f) => f.month === latestMonthKey);
      const historicalCandidates = validationFailures.filter((f) => f.month !== latestMonthKey);
      blockingFailures = historicalCandidates.filter((f) => {
        const evidence = evidenceByMonth.get(f.month);
        return Number(evidence?.combinedTotal || 0) > 0;
      });
      nonBlockingHistoricalWarnings = historicalCandidates.filter((f) => {
        const evidence = evidenceByMonth.get(f.month);
        return Number(evidence?.combinedTotal || 0) <= 0;
      });

      if (latestMonthWarnings.length > 0) {
        console.warn('⚠️ QBO sync validation warning on latest month (allowed):', {
          traceId: syncTraceId,
          latestMonth: latestMonthKey,
          latestMonthWarnings,
          salesEvidence: salesEvidence.filter((s) => s.month === latestMonthKey),
        });
      }
      if (nonBlockingHistoricalWarnings.length > 0) {
        console.warn('⚠️ QBO sync non-blocking historical warnings (no sales evidence):', {
          traceId: syncTraceId,
          nonBlockingHistoricalWarnings,
          salesEvidence: salesEvidence.filter((s) =>
            nonBlockingHistoricalWarnings.some((w) => w.month === s.month)
          ),
        });
      }

      if (blockingFailures.length > 0) {
        const blockingMonths = Array.from(new Set(blockingFailures.map((f) => f.month)));
        const validationMessage = `Validation failed: income is zero with non-zero COGS/Expenses for month(s): ${blockingMonths.join(', ')}`;
        console.error('❌ QBO sync validation failed', {
          traceId: syncTraceId,
          blockingFailures,
          latestMonthWarnings,
          nonBlockingHistoricalWarnings,
          salesEvidence,
        });

        await prisma.accountingConnection.update({
          where: {
            companyId_platform: {
              companyId,
              platform: 'QUICKBOOKS',
            },
          },
          data: {
            status: 'ACTIVE',
            lastSyncAt: new Date(),
            errorMessage: validationMessage,
          },
        });

        await prisma.apiSyncLog.create({
          data: {
            companyId,
            platform: 'QUICKBOOKS',
            syncType: 'manual',
            status: 'error',
            recordsImported: 0,
            errorCount: 1,
            errorDetails: {
              type: 'VALIDATION_FAILED',
              traceId: syncTraceId,
              blockingFailures,
              latestMonthWarnings,
              nonBlockingHistoricalWarnings,
              salesEvidence,
              diagnostics: traceSnapshotBase,
            } as any,
            intuitTid: intuitTid,
            duration: Date.now() - syncStartTime,
          },
        });
        await notifyAdminsOfSyncFailure({
          companyId,
          platform: 'QUICKBOOKS',
          syncType: 'manual',
          errorSummary: validationMessage,
          errorDetails: `Trace: ${syncTraceId || 'n/a'}`,
        });

        emitSyncStatus(companyId, {
          status: 'error',
          message: validationMessage,
          error: validationMessage,
          intuitTid,
          traceId: syncTraceId,
        });

        return NextResponse.json({
          error: 'QuickBooks sync validation failed',
          details: validationMessage,
          validationFailed: true,
          failedMonths: blockingMonths,
          latestMonthWarnings,
          nonBlockingHistoricalWarnings,
          salesEvidence,
          intuitTid,
          traceId: syncTraceId,
        }, { status: 422 });
      }
    }

    // Create financial record only after validation passes.
    const financialRecord = await prisma.financialRecord.create({
      data: {
        companyId,
        uploadedByUserId: userId,
        fileName: `QuickBooks Sync - ${new Date().toISOString()}`,
        fileUrl: null,
        rawData: {
          profitAndLoss: plData,
          balanceSheet: bsData,
          chartOfAccounts: accountsData,
          syncDate: new Date().toISOString(),
          syncTraceId,
          syncDiagnostics: {
            ...traceSnapshotBase,
            financialRecordId: 'PENDING',
            validationWarnings: latestMonthWarnings,
            nonBlockingHistoricalWarnings,
          },
        },
        columnMapping: {
          source: 'QuickBooks Online',
          method: 'API Sync',
        },
      },
    });
    await prisma.financialRecord.update({
      where: { id: financialRecord.id },
      data: {
        rawData: {
          profitAndLoss: plData,
          balanceSheet: bsData,
          chartOfAccounts: accountsData,
          syncDate: new Date().toISOString(),
          syncTraceId,
          syncDiagnostics: {
            ...traceSnapshotBase,
            financialRecordId: financialRecord.id,
            validationWarnings: latestMonthWarnings,
            nonBlockingHistoricalWarnings,
          },
        } as any,
      },
    });
    
    if (canonicalRecords.length > 0) {
      const monthlyRecords = canonicalRecords.map((record) =>
        toMonthlyFinancialCreateInput(companyId, financialRecord.id, record),
      );

      await prisma.monthlyFinancial.createMany({
        data: monthlyRecords,
      });
      recordsImported = monthlyRecords.length;

      // NEW: Save to Master Data API for unified reporting
      console.log('💾 Saving processed data to Master Data API...');
      try {
        const masterDataPayload = {
          companyId,
          monthlyData: buildMasterDataRows(canonicalRecords),
          metadata: {
            source: 'quickbooks',
            externalId: realmId,
            syncDate: new Date().toISOString(),
            lastSync: new Date().toISOString(),
            version: '1.0',
            intuitTid: intuitTid,
            recordsProcessed: recordsImported,
            syncTraceId,
          }
        };

        const masterDataResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/master-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(masterDataPayload)
        });

        if (masterDataResponse.ok) {
          const masterDataResult = await masterDataResponse.json();
          console.log('✅ Master data saved successfully:', masterDataResult);
        } else {
          const errorText = await masterDataResponse.text();
          console.error('❌ Failed to save master data:', masterDataResponse.status, errorText);
          // Don't fail the entire sync if master data save fails
        }
      } catch (masterDataError) {
        console.error('❌ Error saving to master data:', masterDataError);
        // Don't fail the entire sync if master data save fails
      }
    }

    // Update connection status
    await prisma.accountingConnection.update({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      data: {
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        errorMessage: null,
      },
    });

    // Log the sync
    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: 'QUICKBOOKS',
        syncType: 'manual',
        status: 'success',
        recordsImported,
        errorCount,
        errorDetails: errors.length > 0 ? { errors, traceId: syncTraceId } : ({ traceId: syncTraceId } as any),
        intuitTid: intuitTid,
        duration: Date.now() - syncStartTime,
      },
    });

    console.log(`Successfully synced ${recordsImported} months of financial data`);

    // Emit completion status
    emitSyncStatus(companyId, {
      status: 'completed',
      message: `QuickBooks sync completed successfully! ${recordsImported} months imported.`,
      progress: 100,
      recordsImported,
      intuitTid,
    });

    return NextResponse.json({
      success: true,
      message: `QuickBooks data synced successfully! ${recordsImported} months imported.`,
      recordsImported,
      monthsImported: recordsImported,
      intuitTid,
      traceId: syncTraceId,
    });
  } catch (error: any) {
    console.error('QuickBooks sync error:', error);
    errorCount++;
    errors.push({ message: error.message, stack: error.stack });

    // Log the failed sync
    const body = await request.json().catch(() => ({}));
    const { companyId } = body;
    
    // Emit error status
    if (companyId) {
      emitSyncStatus(companyId, {
        status: 'error',
        message: 'QuickBooks sync failed',
        error: error.message,
        intuitTid,
        traceId: syncTraceId,
      });
    }
    if (companyId) {
      await prisma.apiSyncLog.create({
        data: {
          companyId,
          platform: 'QUICKBOOKS',
          syncType: 'manual',
          status: 'error',
          recordsImported,
          errorCount,
          errorDetails: { errors, traceId: syncTraceId },
          intuitTid: intuitTid,
          duration: Date.now() - syncStartTime,
        },
      });
      await notifyAdminsOfSyncFailure({
        companyId,
        platform: 'QUICKBOOKS',
        syncType: 'manual',
        errorSummary: error?.message || 'QuickBooks sync failed',
        errorDetails: `Trace: ${syncTraceId || 'n/a'}`,
      });
    }

    return NextResponse.json(
      { 
        error: 'Failed to sync QuickBooks data', 
        details: error.message,
        intuitTid: intuitTid,
        traceId: syncTraceId,
      },
      { status: 500 }
    );
  }
}

