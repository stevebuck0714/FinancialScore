import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';
import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';
import { toCanonicalMonthlyFinancial, toMonthlyFinancialCreateInput } from '@/lib/financial-canonical';
import { notifyAdminsOfSyncFailure } from '@/lib/sync-alerts';
import { emitSyncStatus } from '@/lib/websocket-emit';

export const dynamic = 'force-dynamic';

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

function applyMappedValue(data: Record<string, any>, targetField: string | null | undefined, amount: number): boolean {
  if (!targetField || targetField === 'unmapped' || targetField === 'ignored') return false;
  if (targetField.startsWith('rev_')) {
    if (!data.revenueBreakdown || typeof data.revenueBreakdown !== 'object') data.revenueBreakdown = {};
    data.revenueBreakdown[targetField] = (Number(data.revenueBreakdown[targetField]) || 0) + amount;
    data.revenue = (data.revenue || 0) + amount;
    return true;
  }
  if (targetField.startsWith('cogs_')) {
    if (!data.cogsBreakdown || typeof data.cogsBreakdown !== 'object') data.cogsBreakdown = {};
    data.cogsBreakdown[targetField] = (Number(data.cogsBreakdown[targetField]) || 0) + amount;
    return true;
  }
  if (data[targetField] === undefined) {
    return false;
  }
  data[targetField] += amount;
  return true;
}

function sumSectorCogs(data: Record<string, any>): number {
  return Object.keys(data)
    .filter((key) => key.startsWith('cogs_'))
    .reduce((sum, key) => sum + (Number(data[key]) || 0), 0);
}

/**
 * Production-ready Xero sync: Fetches invoices and bank transactions
 * Works for both demo and production Xero accounts
 */
export async function POST(request: NextRequest) {
  const syncStartTime = Date.now();
  let recordsImported = 0;
  let companyId: string | undefined;

  try {
    const body = await request.json();
    companyId = body.companyId;
    const userId = body.userId;
    const mode = normalizeFinancialImportMode(body?.mode);
    const targetMonthDate = parseTargetMonth(body?.targetMonth);

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'Company ID and User ID required' }, { status: 400 });
    }
    if (body?.targetMonth && !targetMonthDate) {
      return NextResponse.json({ error: 'Invalid targetMonth. Use YYYY-MM format.' }, { status: 400 });
    }

    console.log('🔄 Xero sync started (transaction-based method)');

    // Emit sync started
    emitSyncStatus(companyId, {
      status: 'started',
      message: 'Xero sync started',
      progress: 0,
    });

    // Get Xero connection
    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'XERO',
        },
      },
    });

    if (!connection || !connection.accessToken || !connection.refreshToken) {
      emitSyncStatus(companyId, {
        status: 'error',
        message: 'Xero not connected',
        progress: 0,
      });
      return NextResponse.json({ error: 'Xero not connected' }, { status: 400 });
    }

    // Decrypt and initialize client
    const accessToken = decryptOAuthToken(connection.accessToken);
    const refreshToken = decryptOAuthToken(connection.refreshToken);

    const xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID || '',
      clientSecret: process.env.XERO_CLIENT_SECRET || '',
      redirectUris: [process.env.XERO_REDIRECT_URI || 'http://localhost:3000/api/xero/callback'],
      scopes: process.env.XERO_SCOPES?.split(' ') || [],
    });

    xeroClient.setTokenSet({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 1800,
      token_type: 'Bearer',
    });

    // Check if token needs refresh
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    
    const shouldRefresh = connection.tokenExpiresAt && 
                         (connection.tokenExpiresAt.getTime() - now.getTime() < bufferTime);
    
    if (shouldRefresh || !connection.tokenExpiresAt) {
      console.log('🔄 Refreshing Xero token...');
      emitSyncStatus(companyId, {
        status: 'in_progress',
        message: 'Refreshing Xero token...',
        progress: 5,
      });

      try {
        const newTokenSet = await xeroClient.refreshToken();
        
        await prisma.accountingConnection.update({
          where: {
            companyId_platform: {
              companyId,
              platform: 'XERO',
            },
          },
          data: {
            accessToken: encryptOAuthToken(newTokenSet.access_token),
            refreshToken: encryptOAuthToken(newTokenSet.refresh_token),
            tokenExpiresAt: new Date(Date.now() + (newTokenSet.expires_in || 1800) * 1000),
            status: 'ACTIVE',
            errorMessage: null,
          },
        });

        xeroClient.setTokenSet({
          access_token: newTokenSet.access_token,
          refresh_token: newTokenSet.refresh_token,
          expires_in: newTokenSet.expires_in || 1800,
          token_type: 'Bearer',
        });

        console.log('✅ Token refreshed successfully');
      } catch (refreshError: any) {
        console.error('❌ Token refresh failed:', refreshError);
        emitSyncStatus(companyId, {
          status: 'error',
          message: 'Token refresh failed - please reconnect',
          progress: 0,
        });
        return NextResponse.json({ 
          error: 'Token expired - please reconnect Xero',
          needsReconnect: true 
        }, { status: 401 });
      }
    }

    const tenantId = connection.tenantId;
    if (!tenantId) {
      emitSyncStatus(companyId, {
        status: 'error',
        message: 'Tenant ID not found',
        progress: 0,
      });
      return NextResponse.json({ error: 'Tenant ID not found' }, { status: 400 });
    }

    const shouldIncludeMonth = (date: Date): boolean => {
      if (!targetMonthDate) return true;
      const year = date.getFullYear();
      const month = date.getMonth();
      const targetYear = targetMonthDate.getFullYear();
      const targetMonth = targetMonthDate.getMonth();
      if (mode === 'only') return year === targetYear && month === targetMonth;
      return year < targetYear || (year === targetYear && month <= targetMonth);
    };

    // Fetch Chart of Accounts to get account types
    emitSyncStatus(companyId, {
      status: 'in_progress',
      message: 'Loading Chart of Accounts...',
      progress: 10,
    });

    console.log('📋 Fetching Chart of Accounts...');
    const accountsResponse = await xeroClient.accountingApi.getAccounts(tenantId);
    const accounts = accountsResponse.body.accounts || [];
    console.log(`  ✅ Found ${accounts.length} accounts`);
    
    // Build account type lookup by code and name
    const accountTypeByCode = new Map();
    const accountTypeByName = new Map();
    accounts.forEach((acc: any) => {
      if (acc.code) accountTypeByCode.set(acc.code.toLowerCase(), acc.type);
      if (acc.name) accountTypeByName.set(acc.name.toLowerCase(), acc.type);
    });
    
    console.log('📋 Loading manual account mappings...');
    const mappings = await prisma.accountMapping.findMany({
      where: { companyId },
    });
    console.log(`  ✅ Found ${mappings.length} manual mappings`);
    
    const mappingLookup = new Map();
    mappings.forEach(m => {
      mappingLookup.set(m.accountName.toLowerCase(), m.targetField);
      if (m.accountCode) {
        mappingLookup.set(m.accountCode.toLowerCase(), m.targetField);
      }
    });
    
    // Helper function to get target field from account type
    function getTargetFieldFromAccountType(xeroAccountType: string): string | null {
      switch (xeroAccountType) {
        case 'REVENUE':
        case 'SALES':
        case 'OTHERINCOME':
          return 'revenue';
        case 'DIRECTCOSTS':
          return 'cogsOther'; // Direct costs = COGS
        case 'EXPENSE':
        case 'OVERHEADS':
          return 'otherExpense'; // General expenses
        default:
          return null; // Not an income statement account
      }
    }

    // Fetch invoices
    emitSyncStatus(companyId, {
      status: 'in_progress',
      message: 'Fetching invoices from Xero...',
      progress: 20,
    });

    console.log('📄 Fetching invoices...');
    const invoicesResponse = await xeroClient.accountingApi.getInvoices(
      tenantId,
      undefined,
      undefined,
      'Date ASC',
      undefined,
      undefined,
      undefined,
      ['PAID', 'AUTHORISED']
    );
    const invoices = invoicesResponse.body.invoices || [];
    console.log(`  ✅ Found ${invoices.length} invoices`);
    
    // Debug: Check if invoices have line items
    const invoicesWithLines = invoices.filter((inv: any) => inv.lineItems && inv.lineItems.length > 0);
    console.log(`  📋 ${invoicesWithLines.length} invoices have line items`);
    if (invoicesWithLines.length > 0) {
      const sample = invoicesWithLines[0];
      console.log(`  🔍 Sample invoice: Type=${sample.type}, Total=$${sample.total}, Lines=${sample.lineItems.length}`);
      if (sample.lineItems[0]) {
        const line = sample.lineItems[0];
        console.log(`    First line: accountName="${line.accountName}", accountCode="${line.accountCode}", amount=$${line.lineAmount}`);
      }
    }

    // Fetch bank transactions
    emitSyncStatus(companyId, {
      status: 'in_progress',
      message: 'Fetching bank transactions...',
      progress: 40,
    });

    console.log('🏦 Fetching bank transactions...');
    const bankTxResponse = await xeroClient.accountingApi.getBankTransactions(
      tenantId,
      undefined,
      undefined,
      'Date ASC'
    );
    const bankTransactions = bankTxResponse.body.bankTransactions || [];
    console.log(`  ✅ Found ${bankTransactions.length} bank transactions`);

    // Calculate Balance Sheet
    emitSyncStatus(companyId, {
      status: 'in_progress',
      message: 'Calculating Balance Sheet...',
      progress: 60,
    });

    console.log('💰 Calculating Balance Sheet...');
    
    // Calculate AR from unpaid invoices
    const unpaidInvoices = invoices.filter((inv: any) => 
      inv.type === 'ACCREC' && inv.status !== 'PAID' && inv.status !== 'VOIDED'
    );
    const totalAR = unpaidInvoices.reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0);
    
    // Calculate AP from unpaid bills
    const unpaidBills = invoices.filter((inv: any) => 
      inv.type === 'ACCPAY' && inv.status !== 'PAID' && inv.status !== 'VOIDED'
    );
    const totalAP = unpaidBills.reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0);
    
    // Calculate Cash from bank transactions
    const cashIn = bankTransactions
      .filter((tx: any) => tx.type === 'RECEIVE')
      .reduce((sum: number, tx: any) => sum + Math.abs(tx.total || 0), 0);
    const cashOut = bankTransactions
      .filter((tx: any) => tx.type === 'SPEND')
      .reduce((sum: number, tx: any) => sum + Math.abs(tx.total || 0), 0);
    const totalCash = cashIn - cashOut;
    
    // Calculate totals
    const totalAssets = totalCash + totalAR;
    const totalLiabilities = totalAP;
    const totalEquity = totalAssets - totalLiabilities;

    console.log(`  Cash: $${totalCash.toFixed(2)}, AR: $${totalAR.toFixed(2)}, AP: $${totalAP.toFixed(2)}`);

    // Process transactions by month
    emitSyncStatus(companyId, {
      status: 'in_progress',
      message: 'Processing monthly data...',
      progress: 70,
    });

    console.log('📊 Building monthly data...');
    const monthlyData: Map<string, any> = new Map();

    function initMonthData() {
      return {
        monthDate: new Date(),
        revenue: 0, cogsPayroll: 0, cogsOwnerPay: 0, cogsContractors: 0, cogsMaterials: 0,
        cogsCommissions: 0, cogsOther: 0, cogsTotal: 0, payroll: 0, ownerBasePay: 0,
        benefits: 0, insurance: 0, professionalFees: 0, subcontractors: 0, rent: 0,
        taxLicense: 0, phoneComm: 0, infrastructure: 0, autoTravel: 0, salesExpense: 0,
        marketing: 0, trainingCert: 0, mealsEntertainment: 0, interestExpense: 0,
        depreciationAmortization: 0, otherExpense: 0, expense: 0, revenueBreakdown: {}, cogsBreakdown: {},
        loc: 0,
      };
    }

    // Process invoices
    invoices.forEach((inv: any) => {
      const date = new Date(inv.date);
      if (!shouldIncludeMonth(date)) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        const data = initMonthData();
        data.monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
        monthlyData.set(monthKey, data);
      }

      const data = monthlyData.get(monthKey);
      
      if (inv.lineItems && inv.lineItems.length > 0) {
        inv.lineItems.forEach((line: any) => {
          const amount = Math.abs(line.lineAmount || 0);
          const accountName = (line.accountName || '').toLowerCase();
          const accountCode = (line.accountCode || '').toLowerCase();
          const description = (line.description || '').toLowerCase();
          
          // Priority 1: Manual mapping
          let targetField = mappingLookup.get(accountName) || 
                           mappingLookup.get(accountCode) || 
                           mappingLookup.get(description);
          
          // Priority 2: Automatic mapping from Xero account type
          if (!targetField || targetField === 'unmapped' || targetField === 'ignored') {
            const xeroAccountType = accountTypeByCode.get(accountCode) || accountTypeByName.get(accountName);
            if (xeroAccountType) {
              targetField = getTargetFieldFromAccountType(xeroAccountType);
            }
          }
          
          // Apply the mapping
          if (applyMappedValue(data, targetField, amount)) {
          } else {
            // Priority 3: Fallback based on invoice type
            if (inv.type === 'ACCREC') data.revenue += amount;
            else if (inv.type === 'ACCPAY') data.expense += amount;
          }
        });
      } else {
        if (inv.type === 'ACCREC') data.revenue += inv.total || 0;
        else if (inv.type === 'ACCPAY') data.expense += inv.total || 0;
      }
    });

    // Process bank transactions
    bankTransactions.forEach((tx: any) => {
      const date = new Date(tx.date);
      if (!shouldIncludeMonth(date)) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        const data = initMonthData();
        data.monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
        monthlyData.set(monthKey, data);
      }

      const data = monthlyData.get(monthKey);
      
      if (tx.lineItems && tx.lineItems.length > 0) {
        tx.lineItems.forEach((line: any) => {
          const amount = Math.abs(line.lineAmount || 0);
          const accountName = (line.accountName || '').toLowerCase();
          const accountCode = (line.accountCode || '').toLowerCase();
          const description = (line.description || '').toLowerCase();
          
          // Priority 1: Manual mapping
          let targetField = mappingLookup.get(accountName) || 
                           mappingLookup.get(accountCode) || 
                           mappingLookup.get(description);
          
          // Priority 2: Automatic mapping from Xero account type
          if (!targetField || targetField === 'unmapped' || targetField === 'ignored') {
            const xeroAccountType = accountTypeByCode.get(accountCode) || accountTypeByName.get(accountName);
            if (xeroAccountType) {
              targetField = getTargetFieldFromAccountType(xeroAccountType);
            }
          }
          
          // Apply the mapping
          if (applyMappedValue(data, targetField, amount)) {
          } else {
            // Priority 3: Fallback based on transaction type
            if (tx.type === 'RECEIVE') data.revenue += amount;
            else if (tx.type === 'SPEND') data.expense += amount;
          }
        });
      } else {
        if (tx.type === 'RECEIVE') data.revenue += tx.total || 0;
        else if (tx.type === 'SPEND') data.expense += tx.total || 0;
      }
    });

    console.log(`\n  📊 Processing ${invoices.length} invoices and ${bankTransactions.length} bank transactions...`);
    
    // Debug: Count mapping methods
    let totalLineItems = 0;
    let manualMapped = 0;
    let autoMapped = 0;
    let fallback = 0;
    
    invoices.forEach((inv: any) => {
      if (inv.lineItems) {
        inv.lineItems.forEach((line: any) => {
          totalLineItems++;
          const accountName = (line.accountName || '').toLowerCase();
          const accountCode = (line.accountCode || '').toLowerCase();
          const description = (line.description || '').toLowerCase();
          
          // Check mapping method
          if (mappingLookup.get(accountName) || mappingLookup.get(accountCode) || mappingLookup.get(description)) {
            manualMapped++;
          } else {
            const xeroAccountType = accountTypeByCode.get(accountCode) || accountTypeByName.get(accountName);
            if (xeroAccountType && getTargetFieldFromAccountType(xeroAccountType)) {
              autoMapped++;
            } else {
              fallback++;
            }
          }
        });
      }
    });
    
    console.log(`  ℹ️  Line item mapping breakdown:`);
    console.log(`    Total: ${totalLineItems}`);
    console.log(`    Manual mappings: ${manualMapped}`);
    console.log(`    Auto (by account type): ${autoMapped}`);
    console.log(`    Fallback (by invoice type): ${fallback}`);
    
    // Calculate totals and add Balance Sheet
    monthlyData.forEach((data) => {
      data.cogsTotal = data.cogsPayroll + data.cogsOwnerPay + data.cogsContractors +
                       data.cogsMaterials + data.cogsCommissions + data.cogsOther +
                       sumSectorCogs(data);
      
      data.expense = data.payroll + data.ownerBasePay + data.benefits + data.insurance +
                     data.professionalFees + data.subcontractors + data.rent + data.taxLicense +
                     data.phoneComm + data.infrastructure + data.autoTravel + data.salesExpense +
                     data.marketing + data.trainingCert + data.mealsEntertainment + 
                     data.interestExpense + data.depreciationAmortization + data.otherExpense;
      
      // Add Balance Sheet (will be updated with historical data below)
      data.cash = totalCash;
      data.ar = totalAR;
      data.ap = totalAP;
      data.loc = 0;
      data.tca = totalCash + totalAR;
      data.totalAssets = totalAssets;
      data.tcl = totalAP + (data.loc || 0);
      data.totalLiab = totalLiabilities;
      data.totalEquity = totalEquity;
      data.totalLAndE = totalLiabilities + totalEquity;
    });

    const monthlyRecords = Array.from(monthlyData.values());
    const canonicalRecords = monthlyRecords.map((row: any) =>
      toCanonicalMonthlyFinancial({
        ...row,
        monthDate: row.monthDate,
      }),
    );
    if (canonicalRecords.length === 0) {
      return NextResponse.json(
        {
          error: targetMonthDate
            ? `No Xero transactions found for targetMonth ${body?.targetMonth} (${mode}).`
            : 'No Xero transactions found for sync window.',
        },
        { status: 400 }
      );
    }
    console.log(`  ✅ Built ${monthlyRecords.length} months`);

    // Debug: Log first month to see what data we have
    if (monthlyRecords.length > 0) {
      const sample = monthlyRecords[0];
      console.log('\n  📊 Sample month data:');
      console.log(`    Month: ${sample.monthDate.toISOString().split('T')[0]}`);
      console.log(`    Revenue: $${(sample.revenue || 0).toFixed(2)}`);
      console.log(`    COGS Total: $${(sample.cogsTotal || 0).toFixed(2)}`);
      console.log(`    Expense Total: $${(sample.expense || 0).toFixed(2)}`);
      console.log(`    Payroll: $${(sample.payroll || 0).toFixed(2)}`);
      console.log(`    Rent: $${(sample.rent || 0).toFixed(2)}`);
    }

    // Fetch historical Balance Sheet for each month
    emitSyncStatus(companyId, {
      status: 'in_progress',
      message: 'Fetching monthly Balance Sheets...',
      progress: 80,
    });

    console.log('\n💰 Fetching historical Balance Sheets...');
    for (let i = 0; i < monthlyRecords.length; i++) {
      const monthData = monthlyRecords[i];
      const monthEnd = new Date(monthData.monthDate.getFullYear(), monthData.monthDate.getMonth() + 1, 0);
      const monthEndStr = monthEnd.toISOString().split('T')[0];
      
      try {
        const bsResponse = await xeroClient.accountingApi.getReportBalanceSheet(tenantId, monthEndStr);
        
        if (bsResponse.body.rows) {
          // Parse Balance Sheet for this specific month
          let monthCash = 0, monthAR = 0, monthAP = 0, monthLOC = 0, monthInventory = 0;
          let monthFixedAssets = 0, monthTotalAssets = 0, monthTotalLiab = 0, monthEquity = 0;
          
          function parseBSRows(rows: any[]): void {
            for (const row of rows) {
              if (!row) continue;
              const title = (row.title || '').toLowerCase();
              
              if (row.rowType === 'SummaryRow' && row.cells && row.cells.length > 0) {
                const value = Math.abs(parseFloat(row.cells[row.cells.length - 1]?.value || '0'));
                
                if (value > 0) {
                  if (title.includes('cash') || title.includes('bank')) monthCash = Math.max(monthCash, value);
                  else if (title.includes('receivable')) monthAR = Math.max(monthAR, value);
                  else if (title.includes('inventory')) monthInventory = Math.max(monthInventory, value);
                  else if (title.includes('fixed asset')) monthFixedAssets = Math.max(monthFixedAssets, value);
                  else if (title.includes('total asset')) monthTotalAssets = Math.max(monthTotalAssets, value);
                  else if (title.includes('line of credit') || title.includes('credit line')) monthLOC = Math.max(monthLOC, value);
                  else if (title.includes('payable')) monthAP = Math.max(monthAP, value);
                  else if (title.includes('total liabilit')) monthTotalLiab = Math.max(monthTotalLiab, value);
                  else if (title.includes('equity')) monthEquity = Math.max(monthEquity, value);
                }
              }
              
              if (row.rows) parseBSRows(row.rows);
            }
          }
          
          parseBSRows(bsResponse.body.rows);
          
          // Update this month's Balance Sheet data
          if (monthTotalAssets > 0 || monthCash > 0 || monthAR > 0) {
            monthData.cash = monthCash;
            monthData.ar = monthAR;
            monthData.inventory = monthInventory;
            monthData.ap = monthAP;
            monthData.loc = monthLOC;
            monthData.fixedAssets = monthFixedAssets;
            monthData.totalAssets = monthTotalAssets || (monthCash + monthAR + monthInventory + monthFixedAssets);
            monthData.totalLiab = monthTotalLiab || (monthAP + monthLOC);
            monthData.totalEquity = monthEquity || (monthData.totalAssets - monthData.totalLiab);
            monthData.tca = monthCash + monthAR + monthInventory;
            monthData.tcl = monthAP + monthLOC;
            monthData.totalLAndE = monthData.totalLiab + monthData.totalEquity;
            
            console.log(`  ${monthEndStr}: Assets=$${monthData.totalAssets.toFixed(2)}, Liab=$${monthData.totalLiab.toFixed(2)}, Equity=$${monthData.totalEquity.toFixed(2)}`);
          }
        }
      } catch (bsError: any) {
        console.warn(`  ⚠️  Could not fetch Balance Sheet for ${monthEndStr}: ${bsError.message}`);
        // Keep the calculated values from transactions
      }
    }

    // Save to database
    emitSyncStatus(companyId, {
      status: 'in_progress',
      message: 'Saving to database...',
      progress: 90,
    });

    // Delete previous Xero syncs
    await prisma.financialRecord.deleteMany({
      where: { 
        companyId,
        fileName: { contains: 'Xero' }
      }
    });
    
    const financialRecord = await prisma.financialRecord.create({
      data: {
        companyId,
        uploadedByUserId: userId,
        fileName: `Xero Sync - ${new Date().toISOString()}`,
        rawData: {
          invoices: invoices.length,
          bankTransactions: bankTransactions.length,
          syncMethod: 'transactions',
          syncDate: new Date().toISOString(),
        },
        columnMapping: {
          source: 'xero',
          method: 'transaction_sync',
        },
      },
    });

    if (canonicalRecords.length > 0) {
      await prisma.monthlyFinancial.createMany({
        data: canonicalRecords.map((m) => toMonthlyFinancialCreateInput(companyId, financialRecord.id, m)),
      });
    }

    recordsImported = canonicalRecords.length;
    console.log(`✅ Saved ${recordsImported} months to database`);

    const syncDuration = Date.now() - syncStartTime;
    
    emitSyncStatus(companyId, {
      status: 'completed',
      message: `Xero sync completed: ${recordsImported} months imported`,
      progress: 100,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${recordsImported} months from Xero`,
      recordsImported,
      syncDurationMs: syncDuration,
    });

  } catch (error: any) {
    console.error('❌ Xero sync error:', error);
    
    if (companyId) {
      await prisma.apiSyncLog.create({
        data: {
          companyId,
          platform: 'XERO',
          syncType: 'manual',
          status: 'error',
          recordsImported,
          errorCount: 1,
          errorDetails: { message: error?.message || 'Xero sync failed' } as any,
          duration: Date.now() - syncStartTime,
        },
      }).catch(() => undefined);
      await notifyAdminsOfSyncFailure({
        companyId,
        platform: 'XERO',
        syncType: 'manual',
        errorSummary: error?.message || 'Xero sync failed',
      });
      emitSyncStatus(companyId, {
        status: 'error',
        message: `Sync failed: ${error.message}`,
        progress: 0,
      });
    }

    return NextResponse.json({
      error: error.message || 'Failed to sync Xero data',
      recordsImported,
    }, { status: 500 });
  }
}
