import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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
import { orchestrateQuickBooksOnlineOperationalSync } from '@/lib/quickbooks-online/operational-orchestrator';
import { decryptOAuthToken } from '@/lib/encryption';
import { getValidQuickBooksToken } from '@/lib/quickbooks-online/token-manager';
import { publishMonthsFromMonthlyFinancialDirect } from '@/lib/financial/publish-month-service';

type FinancialImportMode = 'through' | 'only';

function normalizeFinancialImportMode(value: unknown): FinancialImportMode {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'only' ? 'only' : 'through';
}

function parseTargetMonth(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
}

function normalizeAccountNameForMatch(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hasDistinctQboAccountCode(account: Record<string, unknown>): boolean {
  const acctNum = String(account.AcctNum || '').trim();
  const id = String(account.Id || '').trim();
  return !!acctNum && acctNum !== id;
}

export async function POST(request: NextRequest) {
  const syncStartTime = Date.now();
  let recordsImported = 0;
  let errorCount = 0;
  const errors: any[] = [];
  let intuitTid: string | null = null; // Capture Intuit Transaction ID for debugging
  let syncTraceId: string | null = null;

  try {
    const body = await request.json();
    const { companyId, userId } = body;
    const mode = normalizeFinancialImportMode(body?.mode);
    const targetMonthDate = parseTargetMonth(body?.targetMonth);
    if (body?.targetMonth && !targetMonthDate) {
      return NextResponse.json({ error: 'Invalid targetMonth. Use YYYY-MM format.' }, { status: 400 });
    }
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
      accessToken = decryptOAuthToken(connection.accessToken);
      refreshToken = decryptOAuthToken(connection.refreshToken);
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

    const refreshAccessToken = async (reason: string): Promise<void> => {
      console.log(`🔄 Refreshing QuickBooks token (${reason})...`);
      try {
        const token = await getValidQuickBooksToken(connection.id, {
          forceRefresh: reason.includes('401') || reason.includes('403'),
          reason,
        });
        accessToken = token.accessToken;
        refreshToken = token.refreshToken;
        console.log('✅ Token refreshed successfully');
      } catch (refreshError: any) {
        console.error('❌ Token refresh failed:', refreshError);
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

    // Calculate date range.
    const today = new Date();
    const defaultEndDate = new Date(today.getFullYear(), today.getMonth(), 0); // last day of previous month
    const endDate = targetMonthDate
      ? new Date(targetMonthDate.getFullYear(), targetMonthDate.getMonth() + 1, 0)
      : defaultEndDate;
    const startDate = new Date(endDate);
    if (targetMonthDate && mode === 'only') {
      startDate.setDate(1);
    } else {
      startDate.setMonth(startDate.getMonth() - 36);
    }

    const dateStart = startDate.toISOString().split('T')[0];
    const dateEnd = endDate.toISOString().split('T')[0];
    
    console.log(
      `📅 QB Sync Date Range: ${dateStart} to ${dateEnd}${targetMonthDate ? ` (targetMonth=${body?.targetMonth}, mode=${mode})` : ' (Last full month end)'}`
    );

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
        id: true,
        accountName: true,
        accountId: true,
        accountCode: true,
        targetField: true,
        lobAllocations: true,
        allocationMethod: true,
      },
    });
    console.log(`✅ Found ${accountMappings.length} account mappings (${accountMappings.filter(m => m.lobAllocations).length} with LOB allocations)`);

    if (accountsData?.QueryResponse?.Account && Array.isArray(accountsData.QueryResponse.Account) && accountMappings.length > 0) {
      const accountsByName = new Map<string, { id: string; code: string }>();
      const accountsById = new Map<string, { id: string; code: string }>();
      for (const row of accountsData.QueryResponse.Account) {
        if (!row || typeof row !== 'object') continue;
        const accountName = normalizeAccountNameForMatch((row as any).FullyQualifiedName || (row as any).Name);
        const accountId = String((row as any).Id || '').trim();
        if (!accountName || !accountId) continue;
        const accountCode = hasDistinctQboAccountCode(row as Record<string, unknown>)
          ? String((row as any).AcctNum || '').trim()
          : '';
        const snapshot = { id: accountId, code: accountCode };
        if (!accountsByName.has(accountName)) accountsByName.set(accountName, snapshot);
        accountsById.set(accountId, snapshot);
      }

      let updatedIdentityCount = 0;
      for (const mapping of accountMappings) {
        const existingId = String(mapping.accountId || '').trim();
        const existingCode = String(mapping.accountCode || '').trim();
        if (existingId && existingCode && existingCode !== existingId) continue;
        const match =
          (existingId ? accountsById.get(existingId) : undefined) ||
          accountsByName.get(normalizeAccountNameForMatch(mapping.accountName));
        if (!match) continue;
        const nextAccountCode = existingCode && existingCode !== existingId ? existingCode : match.code;
        await prisma.accountMapping.update({
          where: { id: mapping.id },
          data: {
            accountId: existingId || match.id,
            accountCode: nextAccountCode || null,
          },
        });
        mapping.accountId = existingId || match.id;
        (mapping as any).accountCode = nextAccountCode || null;
        updatedIdentityCount += 1;
      }

      if (updatedIdentityCount > 0) {
        console.log(`✅ Backfilled QuickBooks account IDs/codes on ${updatedIdentityCount} saved mappings`);
      }
    }

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
    const parsedRecords = createMonthlyRecords(plData, bsData, accountMappings as any, companyLOBs);
    let canonicalRecords = parsedRecords.map((row) =>
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

    let latestMonthWarnings: typeof validationFailures = [];
    let nonBlockingHistoricalWarnings: typeof validationFailures = [];
    let repairedRevenueWarnings: Array<{
      month: string;
      revenueBefore: number;
      repairedRevenue: number;
      invoiceCount: number;
      salesReceiptCount: number;
      source: string;
    }> = [];

    if (validationFailures.length > 0) {
      const uniqueMonths = Array.from(new Set(validationFailures.map((f) => f.month)));
      const monthDates = uniqueMonths.map((month) => new Date(`${month}-01T00:00:00`));
      const salesEvidence = await Promise.all(monthDates.map((monthDate) => fetchSalesEvidenceForMonth(monthDate)));
      const evidenceByMonth = new Map(salesEvidence.map((entry) => [entry.month, entry]));

      const evidenceBackedFailures = validationFailures.filter((f) => {
        const evidence = evidenceByMonth.get(f.month);
        return Number(evidence?.combinedTotal || 0) > 0;
      });

      repairedRevenueWarnings = evidenceBackedFailures.map((failure) => {
        const evidence = evidenceByMonth.get(failure.month);
        const repairedRevenue = Number(evidence?.combinedTotal || 0);
        const record = canonicalRecords.find((row) => {
          const month = `${row.monthDate.getUTCFullYear()}-${String(row.monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
          return month === failure.month;
        });
        if (record && record.revenue === 0 && repairedRevenue > 0) {
          record.revenue = repairedRevenue;
          record.revenueBreakdown = {
            ...(record.revenueBreakdown || {}),
            qboTransactionEvidenceRevenue: repairedRevenue,
          };
        }
        return {
          month: failure.month,
          revenueBefore: failure.revenue,
          repairedRevenue,
          invoiceCount: Number(evidence?.invoiceCount || 0),
          salesReceiptCount: Number(evidence?.salesReceiptCount || 0),
          source: 'QBO Invoice/SalesReceipt evidence',
        };
      });

      latestMonthWarnings = validationFailures.filter((f) => f.month === latestMonthKey && !evidenceBackedFailures.some((r) => r.month === f.month));
      const historicalCandidates = validationFailures.filter((f) => f.month !== latestMonthKey);
      nonBlockingHistoricalWarnings = historicalCandidates.filter((f) => {
        const evidence = evidenceByMonth.get(f.month);
        return Number(evidence?.combinedTotal || 0) <= 0;
      });

      if (repairedRevenueWarnings.length > 0) {
        console.warn('⚠️ QBO sync repaired zero revenue from transaction evidence:', {
          traceId: syncTraceId,
          repairedRevenueWarnings,
          salesEvidence: salesEvidence.filter((s) => evidenceBackedFailures.some((w) => w.month === s.month)),
        });
      }
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
            repairedRevenueWarnings,
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
            repairedRevenueWarnings,
          },
        } as any,
      },
    });
    
    if (canonicalRecords.length > 0) {
      // QBO monthly sync is authoritative for this company: replace the existing
      // monthly set with the freshly rebuilt range each run.
      await prisma.monthlyFinancial.deleteMany({
        where: { companyId },
      });

      const monthlyRecords = canonicalRecords.map((record) =>
        toMonthlyFinancialCreateInput(companyId, financialRecord.id, record),
      );

      await prisma.monthlyFinancial.createMany({
        data: monthlyRecords,
      });
      recordsImported = monthlyRecords.length;

      const publishResult = await publishMonthsFromMonthlyFinancialDirect({
        companyId,
        months: monthlyRecords.map((record) => {
          const monthDate = new Date(record.monthDate);
          return `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`;
        }),
      });
      if (!publishResult.success) {
        console.warn('QBO sync rebuilt monthly financials but did not publish any months:', publishResult);
      }

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
            repairedRevenueWarnings,
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

    // QBO operational data: rolling 90-day refresh, or kick off / continue 3-year backfill (async chunks).
    let operationalSyncResult: {
      success: boolean;
      recordsCreated: number;
      errors: string[];
      operationalMode?: string;
    } | null = null;
    let operationalErrorMessage: string | null = null;
    try {
      const op = await orchestrateQuickBooksOnlineOperationalSync(companyId);
      if (op.kind === 'rolling_complete') {
        operationalSyncResult = {
          success: op.errors.length === 0,
          recordsCreated: op.recordsCreated,
          errors: op.errors,
          operationalMode: 'rolling_90',
        };
        if (!operationalSyncResult.success) {
          const opError = `Operational sync failed: ${operationalSyncResult.errors.join(' | ')}`.slice(0, 900);
          operationalErrorMessage = opError;
          await prisma.accountingConnection.update({
            where: {
              companyId_platform: {
                companyId,
                platform: 'QUICKBOOKS',
              },
            },
            data: {
              errorMessage: opError,
            },
          });
        }
      } else if (op.kind === 'backfill_started') {
        operationalSyncResult = {
          success: true,
          recordsCreated: 0,
          errors: [],
          operationalMode: 'backfill_started',
        };
      } else if (op.kind === 'backfill_in_progress') {
        operationalSyncResult = {
          success: true,
          recordsCreated: 0,
          errors: [],
          operationalMode: 'backfill_in_progress',
        };
      } else {
        operationalSyncResult = {
          success: true,
          recordsCreated: 0,
          errors: [],
          operationalMode: 'idle',
        };
      }
    } catch (error: any) {
      const opErrorMessage = `Operational sync failed: ${error?.message || 'Unknown error'}`.slice(0, 900);
      operationalErrorMessage = opErrorMessage;
      await prisma.accountingConnection.update({
        where: {
          companyId_platform: {
            companyId,
            platform: 'QUICKBOOKS',
          },
        },
        data: {
          errorMessage: opErrorMessage,
        },
      });
      operationalSyncResult = {
        success: false,
        recordsCreated: 0,
        errors: [error?.message || 'Operational sync failed'],
      };
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
        errorMessage: operationalErrorMessage,
      },
    });

    // Log the sync
    const operationalErrors = operationalSyncResult?.success === false ? operationalSyncResult.errors || [] : [];
    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: 'QUICKBOOKS',
        syncType: 'manual',
        status: 'success',
        recordsImported,
        errorCount: errorCount + operationalErrors.length,
        errorDetails:
          errors.length > 0 || operationalErrors.length > 0
            ? { errors, operationalErrors, operationalSync: operationalSyncResult, traceId: syncTraceId }
            : ({ traceId: syncTraceId } as any),
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
      operationalSync: operationalSyncResult,
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

