import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';
import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * Alternative sync method: Build P&L from transactions instead of using P&L report
 * This works better for demo/sandbox accounts where P&L reports are empty
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, userId } = body;

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'Company ID and User ID required' }, { status: 400 });
    }

    console.log('🔄 Syncing from Xero transactions (alternative method)');

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

    // Check if token needs refresh (Xero tokens expire in 30 minutes)
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    
    console.log('⏰ Token expiration check:');
    console.log('  Current time:', now.toISOString());
    console.log('  Token expires at:', connection.tokenExpiresAt?.toISOString() || 'Not set');
    
    const shouldRefresh = connection.tokenExpiresAt && 
                         (connection.tokenExpiresAt.getTime() - now.getTime() < bufferTime);
    
    if (shouldRefresh || !connection.tokenExpiresAt) {
      console.log('🔄 Token expiring soon or not set, refreshing...');
      try {
        const newTokenSet = await xeroClient.refreshToken();
        
        // Update tokens in database
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

        // Update the xero client with new token
        xeroClient.setTokenSet({
          access_token: newTokenSet.access_token,
          refresh_token: newTokenSet.refresh_token,
          expires_in: newTokenSet.expires_in || 1800,
          token_type: 'Bearer',
        });

        console.log('✅ Token refreshed successfully');
      } catch (refreshError: any) {
        console.error('❌ Token refresh failed:', refreshError);
        return NextResponse.json({ 
          error: 'Token expired and refresh failed - please reconnect Xero',
          needsReconnect: true 
        }, { status: 401 });
      }
    }

    const tenantId = connection.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID not found' }, { status: 400 });
    }

    // Get account mappings for detailed breakdown
    console.log('📋 Loading account mappings...');
    const mappings = await prisma.accountMapping.findMany({
      where: { companyId },
    });
    console.log(`  ✅ Found ${mappings.length} account mappings`);
    
    const mappingLookup = new Map();
    mappings.forEach(m => {
      mappingLookup.set(m.qbAccount.toLowerCase(), m.targetField);
      if (m.qbAccountCode) {
        mappingLookup.set(m.qbAccountCode.toLowerCase(), m.targetField);
      }
    });

    // Fetch ALL invoices and bank transactions
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

    console.log('🏦 Fetching bank transactions...');
    const bankTxResponse = await xeroClient.accountingApi.getBankTransactions(
      tenantId,
      undefined,
      undefined,
      'Date ASC'
    );
    const bankTransactions = bankTxResponse.body.bankTransactions || [];
    console.log(`  ✅ Found ${bankTransactions.length} bank transactions`);

    console.log('💰 Fetching Balance Sheet from Account Balances...');
    
    // Initialize all balance sheet values to 0
    let totalCash: number = 0;
    let totalAR: number = 0;
    let totalInventory: number = 0;
    let totalOtherCA: number = 0;
    let totalCurrentAssets: number = 0;
    let totalFixedAssets: number = 0;
    let totalOtherAssets: number = 0;
    let totalAssets: number = 0;
    let totalAP: number = 0;
    let totalOtherCL: number = 0;
    let totalCurrentLiabilities: number = 0;
    let totalLongTermDebt: number = 0;
    let totalLiabilities: number = 0;
    let totalRetainedEarnings: number = 0;
    let totalCommonStock: number = 0;
    let totalOwnersCapital: number = 0;
    let totalEquity: number = 0;
    let totalLAndE: number = 0;

    // Fetch accounts with balances from Chart of Accounts
    try {
      console.log(`  📊 Fetching accounts from Chart of Accounts...`);
      const accountsResponse = await xeroClient.accountingApi.getAccounts(tenantId);
      const accounts = accountsResponse.body.accounts || [];
      
      console.log('  ✅ Fetched accounts successfully');
      console.log(`    Total accounts: ${accounts.length}`);

      
      // Calculate AR from unpaid invoices
      console.log('  📊 Calculating AR from unpaid invoices...');
      const unpaidInvoices = invoices.filter((inv: any) => 
        inv.type === 'ACCREC' && inv.status !== 'PAID' && inv.status !== 'VOIDED'
      );
      totalAR = unpaidInvoices.reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0);
      console.log(`    AR: $${totalAR.toFixed(2)} from ${unpaidInvoices.length} unpaid invoices`);
      
      // Calculate AP from unpaid bills
      console.log('  📊 Calculating AP from unpaid bills...');
      const unpaidBills = invoices.filter((inv: any) => 
        inv.type === 'ACCPAY' && inv.status !== 'PAID' && inv.status !== 'VOIDED'
      );
      totalAP = unpaidBills.reduce((sum: number, inv: any) => sum + (inv.amountDue || 0), 0);
      console.log(`    AP: $${totalAP.toFixed(2)} from ${unpaidBills.length} unpaid bills`);
      
      // Calculate Cash from bank transactions
      console.log('  📊 Calculating Cash from bank transactions...');
      const cashIn = bankTransactions
        .filter((tx: any) => tx.type === 'RECEIVE')
        .reduce((sum: number, tx: any) => sum + Math.abs(tx.total || 0), 0);
      const cashOut = bankTransactions
        .filter((tx: any) => tx.type === 'SPEND')
        .reduce((sum: number, tx: any) => sum + Math.abs(tx.total || 0), 0);
      totalCash = cashIn - cashOut;
      console.log(`    Cash: $${totalCash.toFixed(2)} (In: $${cashIn.toFixed(2)}, Out: $${cashOut.toFixed(2)})`);
      
      console.log('  ✅ Basic Balance Sheet calculated from transactions');
      
    } catch (accountsError: any) {
      console.warn('  ⚠️  Error fetching accounts:', accountsError.message);
    }

    // Calculate totals from individual components
    totalCurrentAssets = totalCash + totalAR + totalInventory + totalOtherCA;
    totalAssets = totalCurrentAssets + totalFixedAssets + totalOtherAssets;
    totalCurrentLiabilities = totalAP + totalOtherCL;
    totalLiabilities = totalCurrentLiabilities + totalLongTermDebt;
    totalEquity = totalRetainedEarnings + totalCommonStock + totalOwnersCapital;
    
    // If equity wasn't found in TB, calculate from accounting equation
    if (totalEquity === 0 && totalAssets > 0) {
      totalEquity = totalAssets - totalLiabilities;
    }
    
    totalLAndE = totalLiabilities + totalEquity;

    console.log('  ✅ Final Balance Sheet values:');
    console.log('    ASSETS:');
    console.log(`      Cash: $${(totalCash || 0).toFixed(2)}`);
    console.log(`      Accounts Receivable: $${(totalAR || 0).toFixed(2)}`);
    console.log(`      Inventory: $${(totalInventory || 0).toFixed(2)}`);
    console.log(`      Other Current Assets: $${(totalOtherCA || 0).toFixed(2)}`);
    console.log(`      → Total Current Assets: $${(totalCurrentAssets || 0).toFixed(2)}`);
    console.log(`      Fixed Assets: $${(totalFixedAssets || 0).toFixed(2)}`);
    console.log(`      Other Assets: $${(totalOtherAssets || 0).toFixed(2)}`);
    console.log(`      → TOTAL ASSETS: $${(totalAssets || 0).toFixed(2)}`);
    console.log('    LIABILITIES:');
    console.log(`      Accounts Payable: $${(totalAP || 0).toFixed(2)}`);
    console.log(`      Other Current Liabilities: $${(totalOtherCL || 0).toFixed(2)}`);
    console.log(`      → Total Current Liabilities: $${(totalCurrentLiabilities || 0).toFixed(2)}`);
    console.log(`      Long Term Debt: $${(totalLongTermDebt || 0).toFixed(2)}`);
    console.log(`      → TOTAL LIABILITIES: $${(totalLiabilities || 0).toFixed(2)}`);
    console.log('    EQUITY:');
    console.log(`      Retained Earnings: $${(totalRetainedEarnings || 0).toFixed(2)}`);
    console.log(`      Common Stock: $${(totalCommonStock || 0).toFixed(2)}`);
    console.log(`      Owner's Capital: $${(totalOwnersCapital || 0).toFixed(2)}`);
    console.log(`      → TOTAL EQUITY: $${(totalEquity || 0).toFixed(2)}`);
    console.log(`    → TOTAL L&E: $${(totalLAndE || 0).toFixed(2)}`);

    // Group by month and apply mappings to line items
    const monthlyData: Map<string, any> = new Map();

    function initMonthData() {
      return {
        revenue: 0,
        cogsPayroll: 0,
        cogsOwnerPay: 0,
        cogsContractors: 0,
        cogsMaterials: 0,
        cogsCommissions: 0,
        cogsOther: 0,
        cogsTotal: 0,
        payroll: 0,
        ownerBasePay: 0,
        benefits: 0,
        insurance: 0,
        professionalFees: 0,
        subcontractors: 0,
        rent: 0,
        taxLicense: 0,
        phoneComm: 0,
        infrastructure: 0,
        autoTravel: 0,
        salesExpense: 0,
        marketing: 0,
        trainingCert: 0,
        mealsEntertainment: 0,
        interestExpense: 0,
        depreciationAmortization: 0,
        otherExpense: 0,
        expense: 0,
      };
    }

    // Process invoices with line item detail
    invoices.forEach((inv: any) => {
      const date = new Date(inv.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        const data = initMonthData();
        data.monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
        monthlyData.set(monthKey, data);
      }

      const data = monthlyData.get(monthKey);
      
      // Process line items
      if (inv.lineItems && inv.lineItems.length > 0) {
        let lineItemsProcessed = 0;
        let mappedCount = 0;
        
        inv.lineItems.forEach((line: any) => {
          const amount = Math.abs(line.lineAmount || 0);
          const accountCode = (line.accountCode || '').toLowerCase();
          const accountName = (line.accountName || '').toLowerCase();
          const description = (line.description || '').toLowerCase();
          
          // Try to find mapping by account name, code, or description
          const targetField = mappingLookup.get(accountName) || 
                             mappingLookup.get(accountCode) || 
                             mappingLookup.get(description);
          
          if (targetField && targetField !== 'unmapped') {
            // Map to specific field
            if (data.hasOwnProperty(targetField)) {
              data[targetField] += amount;
              mappedCount++;
            }
          } else {
            // Fallback: sales invoices = revenue, purchase = expense
            if (inv.type === 'ACCREC') {
              data.revenue += amount;
            } else if (inv.type === 'ACCPAY') {
              data.expense += amount;
            }
          }
          lineItemsProcessed++;
        });
        
        // Debug first few invoices
        if (lineItemsProcessed > 0 && invoices.indexOf(inv) < 3) {
          console.log(`  Invoice ${invoices.indexOf(inv) + 1}: ${lineItemsProcessed} line items, ${mappedCount} mapped`);
        }
      } else {
        // No line items, use total
        if (inv.type === 'ACCREC') {
          data.revenue += inv.total || 0;
        } else if (inv.type === 'ACCPAY') {
          data.expense += inv.total || 0;
        }
      }
    });

    // Process bank transactions with line item detail
    bankTransactions.forEach((tx: any) => {
      const date = new Date(tx.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData.has(monthKey)) {
        const data = initMonthData();
        data.monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
        monthlyData.set(monthKey, data);
      }

      const data = monthlyData.get(monthKey);
      
      // Process line items
      if (tx.lineItems && tx.lineItems.length > 0) {
        tx.lineItems.forEach((line: any) => {
          const amount = Math.abs(line.lineAmount || 0);
          const accountCode = (line.accountCode || '').toLowerCase();
          const accountName = (line.accountName || '').toLowerCase();
          const description = (line.description || '').toLowerCase();
          
          // Try to find mapping by account name, code, or description
          const targetField = mappingLookup.get(accountName) || 
                             mappingLookup.get(accountCode) || 
                             mappingLookup.get(description);
          
          if (targetField && targetField !== 'unmapped') {
            if (data.hasOwnProperty(targetField)) {
              data[targetField] += amount;
            }
          } else {
            // Fallback
            if (tx.type === 'RECEIVE') {
              data.revenue += amount;
            } else if (tx.type === 'SPEND') {
              data.expense += amount;
            }
          }
        });
      } else {
        // No line items
        if (tx.type === 'RECEIVE') {
          data.revenue += tx.total || 0;
        } else if (tx.type === 'SPEND') {
          data.expense += tx.total || 0;
        }
      }
    });

    // Calculate totals and add Balance Sheet data to each month
    monthlyData.forEach((data) => {
      // Income Statement totals
      data.cogsTotal = data.cogsPayroll + data.cogsOwnerPay + data.cogsContractors + 
                       data.cogsMaterials + data.cogsCommissions + data.cogsOther;
      
      data.expense = data.payroll + data.ownerBasePay + data.benefits + data.insurance +
                     data.professionalFees + data.subcontractors + data.rent + data.taxLicense +
                     data.phoneComm + data.infrastructure + data.autoTravel + data.salesExpense +
                     data.marketing + data.trainingCert + data.mealsEntertainment + 
                     data.interestExpense + data.depreciationAmortization + data.otherExpense;
      
      // Balance Sheet data (same for all months - represents current snapshot from Trial Balance)
      data.cash = totalCash;
      data.ar = totalAR;
      data.inventory = totalInventory;
      data.otherCA = totalOtherCA;
      data.tca = totalCurrentAssets;
      data.fixedAssets = totalFixedAssets;
      data.otherAssets = totalOtherAssets;
      data.totalAssets = totalAssets;
      data.ap = totalAP;
      data.otherCL = totalOtherCL;
      data.tcl = totalCurrentLiabilities;
      data.ltd = totalLongTermDebt;
      data.totalLiab = totalLiabilities;
      data.retainedEarnings = totalRetainedEarnings;
      data.commonStock = totalCommonStock;
      data.ownersCapital = totalOwnersCapital;
      data.totalEquity = totalEquity;
      data.totalLAndE = totalLAndE;
    });

    // Debug: Log some sample mappings to verify they're working
    console.log('\n🔍 Sample mapping lookups (first 5):');
    mappings.slice(0, 5).forEach(m => {
      console.log(`  "${m.qbAccount}" → ${m.targetField}`);
    });

    // Debug: Check structure of first invoice with line items
    const sampleInvoice = invoices.find((inv: any) => inv.lineItems && inv.lineItems.length > 0);
    if (sampleInvoice) {
      console.log('\n🔍 Sample invoice line item structure:');
      console.log('  Invoice Type:', sampleInvoice.type);
      console.log('  Invoice Total:', sampleInvoice.total);
      console.log('  Line Items:', sampleInvoice.lineItems.length);
      if (sampleInvoice.lineItems[0]) {
        const line = sampleInvoice.lineItems[0];
        console.log('  First line item:');
        console.log('    accountCode:', line.accountCode);
        console.log('    accountName:', line.accountName);
        console.log('    description:', line.description);
        console.log('    lineAmount:', line.lineAmount);
      }
    } else {
      console.log('\n⚠️  No invoices with line items found!');
    }

    console.log(`\n📊 Built monthly data for ${monthlyData.size} months with account mappings`);
    
    // Save to database
    const monthlyRecords = Array.from(monthlyData.values());
    
    // Log sample data
    if (monthlyRecords.length > 0) {
      const sample = monthlyRecords[0];
      console.log('\n📋 Sample month data:');
      console.log('  Income Statement:');
      console.log(`    Revenue: $${(sample.revenue || 0).toFixed(2)}`);
      console.log(`    COGS Total: $${(sample.cogsTotal || 0).toFixed(2)}`);
      console.log(`    Expense Total: $${(sample.expense || 0).toFixed(2)}`);
      console.log('  Balance Sheet:');
      console.log(`    Cash: $${(sample.cash || 0).toFixed(2)}`);
      console.log(`    AR: $${(sample.ar || 0).toFixed(2)}`);
      console.log(`    Inventory: $${(sample.inventory || 0).toFixed(2)}`);
      console.log(`    Fixed Assets: $${(sample.fixedAssets || 0).toFixed(2)}`);
      console.log(`    → Total Assets: $${(sample.totalAssets || 0).toFixed(2)}`);
      console.log(`    AP: $${(sample.ap || 0).toFixed(2)}`);
      console.log(`    Long Term Debt: $${(sample.ltd || 0).toFixed(2)}`);
      console.log(`    → Total Liabilities: $${(sample.totalLiab || 0).toFixed(2)}`);
      console.log(`    Retained Earnings: $${(sample.retainedEarnings || 0).toFixed(2)}`);
      console.log(`    → Total Equity: $${(sample.totalEquity || 0).toFixed(2)}`);
    }
    
    const financialRecord = await prisma.financialRecord.create({
      data: {
        companyId,
        uploadedByUserId: userId,
        fileName: `Xero Transaction Sync - ${new Date().toISOString()}`,
        rawData: {
          invoices: invoices.length,
          bankTransactions: bankTransactions.length,
          syncMethod: 'transactions',
          syncDate: new Date().toISOString(),
        },
        columnMapping: {
          source: 'xero_transactions',
          method: 'direct_sync',
        },
        monthlyData: {
          create: monthlyRecords.map((m: any) => ({
            companyId,
            monthDate: m.monthDate,
            // Income statement
            revenue: m.revenue,
            cogsPayroll: m.cogsPayroll,
            cogsOwnerPay: m.cogsOwnerPay,
            cogsContractors: m.cogsContractors,
            cogsMaterials: m.cogsMaterials,
            cogsCommissions: m.cogsCommissions,
            cogsOther: m.cogsOther,
            cogsTotal: m.cogsTotal,
            payroll: m.payroll,
            ownerBasePay: m.ownerBasePay,
            benefits: m.benefits,
            insurance: m.insurance,
            professionalFees: m.professionalFees,
            subcontractors: m.subcontractors,
            rent: m.rent,
            taxLicense: m.taxLicense,
            phoneComm: m.phoneComm,
            infrastructure: m.infrastructure,
            autoTravel: m.autoTravel,
            salesExpense: m.salesExpense,
            marketing: m.marketing,
            trainingCert: m.trainingCert,
            mealsEntertainment: m.mealsEntertainment,
            interestExpense: m.interestExpense,
            depreciationAmortization: m.depreciationAmortization,
            otherExpense: m.otherExpense,
            expense: m.expense,
            // Balance sheet (from Trial Balance account balances)
            cash: m.cash || 0,
            ar: m.ar || 0,
            inventory: m.inventory || 0,
            otherCA: m.otherCA || 0,
            tca: m.tca || 0,
            fixedAssets: m.fixedAssets || 0,
            otherAssets: m.otherAssets || 0,
            totalAssets: m.totalAssets || 0,
            ap: m.ap || 0,
            otherCL: m.otherCL || 0,
            tcl: m.tcl || 0,
            ltd: m.ltd || 0,
            totalLiab: m.totalLiab || 0,
            retainedEarnings: m.retainedEarnings || 0,
            commonStock: m.commonStock || 0,
            ownersCapital: m.ownersCapital || 0,
            totalEquity: m.totalEquity || 0,
            totalLAndE: m.totalLAndE || 0,
          })),
        },
      },
      include: {
        monthlyData: true,
      },
    });

    console.log(`✅ Saved ${financialRecord.monthlyData.length} months to database with detailed breakdowns`);
    
    monthlyRecords.forEach((m: any) => {
      console.log(`  ${m.monthDate.toISOString().split('T')[0]}: Rev=$${(m.revenue || 0).toFixed(2)}, COGS=$${(m.cogsTotal || 0).toFixed(2)}, Exp=$${(m.expense || 0).toFixed(2)}`);
    });

    return NextResponse.json({
      success: true,
      message: `Synced ${monthlyRecords.length} months from transactions`,
      monthsImported: monthlyRecords.length,
      recordId: financialRecord.id,
    });

  } catch (error: any) {
    console.error('❌ Transaction sync error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to sync from transactions',
    }, { status: 500 });
  }
}

