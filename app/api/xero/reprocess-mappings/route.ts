import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';
import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

function applyMappedValue(details: Record<string, any>, targetField: string | null | undefined, amount: number): boolean {
  if (!targetField || targetField === 'unmapped') return false;
  if (targetField.startsWith('rev_')) {
    if (!details.revenueBreakdown || typeof details.revenueBreakdown !== 'object') details.revenueBreakdown = {};
    details.revenueBreakdown[targetField] = (Number(details.revenueBreakdown[targetField]) || 0) + Math.abs(amount);
    details.revenue = (details.revenue || 0) + Math.abs(amount);
    return true;
  }
  if (targetField.startsWith('cogs_')) {
    if (!details.cogsBreakdown || typeof details.cogsBreakdown !== 'object') details.cogsBreakdown = {};
    details.cogsBreakdown[targetField] = (Number(details.cogsBreakdown[targetField]) || 0) + Math.abs(amount);
    return true;
  }
  if (details[targetField] === undefined) {
    return false;
  }
  details[targetField] += Math.abs(amount);
  return true;
}

function sumSectorCogs(details: Record<string, any>): number {
  return Object.keys(details)
    .filter((key) => key.startsWith('cogs_'))
    .reduce((sum, key) => sum + (Number(details[key]) || 0), 0);
}

/**
 * Reprocess Xero data with account mappings
 * This fetches account-level transactions and applies mappings to create detailed monthly breakdowns
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }

    console.log('🔄 Reprocessing Xero data with account mappings for company:', companyId);

    // Get the Xero connection
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

    // Get account mappings
    const mappings = await prisma.accountMapping.findMany({
      where: { companyId },
    });

    console.log(`📋 Found ${mappings.length} account mappings`);

    if (mappings.length === 0) {
      return NextResponse.json({ 
        error: 'No account mappings found. Please map your accounts first.' 
      }, { status: 400 });
    }

    // Create a mapping lookup
    const mappingLookup = new Map();
    mappings.forEach(m => {
      mappingLookup.set(m.qbAccount.toLowerCase(), m.targetField);
    });

    // Decrypt tokens
    const accessToken = decryptOAuthToken(connection.accessToken);
    const refreshToken = decryptOAuthToken(connection.refreshToken);

    // Initialize Xero client
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

    // Get existing monthly data to update
    const financialRecords = await prisma.financialRecord.findMany({
      where: {
        companyId,
        fileName: { contains: 'Xero Sync' },
      },
      include: {
        monthlyData: {
          orderBy: { monthDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (!financialRecords || financialRecords.length === 0) {
      return NextResponse.json({ 
        error: 'No Xero financial data found. Please sync Xero first.' 
      }, { status: 400 });
    }

    const latestRecord = financialRecords[0];
    console.log(`📊 Found ${latestRecord.monthlyData.length} months of Xero data to reprocess`);

    // Fetch account-level P&L data for each month
    const updatedMonths = [];
    
    for (const monthData of latestRecord.monthlyData) {
      const monthDate = new Date(monthData.monthDate);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      
      // Calculate first and last day of the month properly
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0); // Last day of the month
      
      const firstDayStr = firstDay.toISOString().split('T')[0];
      const lastDayStr = lastDay.toISOString().split('T')[0];
      
      console.log(`\n📅 Processing ${lastDayStr} (${firstDayStr} to ${lastDayStr})...`);
      
      try {
        // Get P&L for JUST this month (not YTD) by using date range
        // standardLayout: false gives us account-level detail instead of just summary totals
        console.log('  🔄 Calling Xero P&L API...');
        console.log('    Date range:', firstDayStr, 'to', lastDayStr);
        console.log('    standardLayout: false (for account detail)');
        
        const plResponse = await xeroClient.accountingApi.getReportProfitAndLoss(
          tenantId,
          firstDayStr,
          lastDayStr,
          1,        // periods - 1 for single month
          'MONTH'   // timeframe - MONTH for monthly data
        );
        
        if (!plResponse || !plResponse.body) {
          throw new Error('Empty response from Xero P&L API');
        }
        
        // Log the full structure to understand Xero's response format
        console.log('\n📄 P&L Response Structure for', lastDayStr);
        console.log('  Report ID:', plResponse.body.reportID);
        console.log('  Report Name:', plResponse.body.reportName);
        console.log('  Report Date:', plResponse.body.reportDate);
        console.log('  Top-level rows:', plResponse.body.rows?.length || 0);
        
        // Log first few rows to see structure
        if (plResponse.body.rows && plResponse.body.rows.length > 0) {
          console.log('\n  📋 Sample row structure:');
          const sampleRow = plResponse.body.rows[0];
          console.log('    RowType:', sampleRow.rowType);
          console.log('    Title:', sampleRow.title);
          console.log('    Cells:', sampleRow.cells?.length || 0);
          if (sampleRow.rows) {
            console.log('    Nested rows:', sampleRow.rows.length);
            if (sampleRow.rows.length > 0) {
              const nestedRow = sampleRow.rows[0];
              console.log('      First nested row type:', nestedRow.rowType);
              console.log('      First nested row cells:', nestedRow.cells?.map((c: any) => c.value).join(' | '));
            }
          }
        }
        
        // Parse account-level data
        const accountTotals = parseAccountDetails(plResponse.body, mappingLookup);
        
        // Log summary of what was parsed
        console.log('\n  💰 Parsed totals:');
        console.log('    Revenue:', accountTotals.revenue);
        console.log('    COGS Total:', accountTotals.cogsTotal);
        console.log('    Expense Total:', accountTotals.expense);
        
        // Update the monthly record with detailed breakdowns
        await prisma.monthlyFinancial.update({
          where: { id: monthData.id },
          data: accountTotals,
        });
        
        updatedMonths.push(lastDayStr);
        console.log(`✅ Updated ${lastDayStr} with detailed breakdowns\n`);
        
      } catch (error: any) {
        console.error(`❌ Error processing ${lastDayStr}:`, error?.message || error);
        console.error('   Full error:', error);
        console.error('   Error stack:', error?.stack);
        if (error?.response) {
          console.error('   Status:', error.response.statusCode);
          console.error('   Body:', JSON.stringify(error.response.body, null, 2).substring(0, 500));
        }
      }
    }

    console.log(`\n✅ Reprocessed ${updatedMonths.length} months with account mappings`);

    return NextResponse.json({
      success: true,
      message: `Successfully reprocessed ${updatedMonths.length} months of Xero data with account mappings`,
      monthsUpdated: updatedMonths.length,
    });

  } catch (error: any) {
    console.error('❌ Reprocess error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to reprocess Xero data',
    }, { status: 500 });
  }
}

/**
 * Parse account-level details from Xero Trial Balance and apply mappings
 * Trial Balance shows individual account balances, which we can map to our fields
 */
function parseTrialBalanceDetails(trialBalance: any, mappingLookup: Map<string, string>): any {
  const details: any = {
    // Initialize all fields to 0
    revenue: 0,
    cogsPayroll: 0,
    cogsOwnerPay: 0,
    cogsContractors: 0,
    cogsMaterials: 0,
    cogsCommissions: 0,
    cogsOther: 0,
    cogsTotal: 0,
    cogsBreakdown: {},
    revenueBreakdown: {},
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
    loc: 0,
  };

  console.log('  🔍 Parsing Trial Balance...');
  
  let accountsFound = 0;
  let accountsMapped = 0;

  function parseRows(rows: any[]) {
    for (const row of rows) {
      if (!row) continue;

      // Trial Balance row structure: Account Code, Account Name, Debit, Credit
      if (row.rowType === 'Row' && row.cells && row.cells.length >= 4) {
        const accountCode = row.cells[0]?.value || '';
        const accountName = row.cells[1]?.value || '';
        const debit = parseFloat(row.cells[2]?.value || '0');
        const credit = parseFloat(row.cells[3]?.value || '0');
        
        // For income statement accounts, the balance shows activity for the period
        // Revenue accounts typically have credit balances, expense accounts have debit balances
        const value = debit || credit; // Use whichever is non-zero

        if (accountName && value !== 0) {
          accountsFound++;
          const targetField = mappingLookup.get(accountName.toLowerCase());
          
          if (applyMappedValue(details, targetField, value)) {
            accountsMapped++;
            console.log(`  ✅ ${accountName} (${accountCode}) $${value.toFixed(0)} → ${targetField}`);
          } else if (accountName.length > 3) {
            // Log unmapped accounts for debugging (but skip section headers)
            console.log(`  ⚠️  ${accountName} (${accountCode}) $${value.toFixed(0)} → ${targetField || 'NOT MAPPED'}`);
          }
        }
      }

      // Recursively process nested rows (for account groups)
      if (row.rows) {
        parseRows(row.rows);
      }
    }
  }

  if (trialBalance?.rows) {
    parseRows(trialBalance.rows);
  }
  
  console.log(`  📊 Found ${accountsFound} accounts, mapped ${accountsMapped} to target fields`);

  // Calculate totals
  details.cogsTotal = details.cogsPayroll + details.cogsOwnerPay + details.cogsContractors +
                      details.cogsMaterials + details.cogsCommissions + details.cogsOther +
                      sumSectorCogs(details);
  
  details.expense = details.payroll + details.ownerBasePay + details.benefits + details.insurance +
                    details.professionalFees + details.subcontractors + details.rent + details.taxLicense +
                    details.phoneComm + details.infrastructure + details.autoTravel + details.salesExpense +
                    details.marketing + details.trainingCert + details.mealsEntertainment + 
                    details.interestExpense + details.depreciationAmortization + details.otherExpense;

  return details;
}

/**
 * OLD: Parse account-level details from Xero P&L and apply mappings
 * NOTE: P&L reports in Xero don't show account-level detail, only section totals
 */
function parseAccountDetails(plData: any, mappingLookup: Map<string, string>): any {
  const details: any = {
    // Initialize all fields to 0
    revenue: 0,
    cogsPayroll: 0,
    cogsOwnerPay: 0,
    cogsContractors: 0,
    cogsMaterials: 0,
    cogsCommissions: 0,
    cogsOther: 0,
    cogsTotal: 0,
    cogsBreakdown: {},
    revenueBreakdown: {},
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
    loc: 0,
  };

  console.log('  🔍 Parsing P&L report structure...');
  console.log('  📋 Report has', plData?.rows?.length || 0, 'top-level rows');
  
  let accountsFound = 0;
  let accountsMapped = 0;

  function parseRows(rows: any[], depth: number = 0) {
    for (const row of rows) {
      if (!row) continue;

      const indent = '  '.repeat(depth);
      
      // Look for row entries with account names and values
      // Row types: "Header", "Section", "Row", "SummaryRow"
      // We want "Row" type which contains actual account data
      if (row.rowType === 'Row' && row.cells && row.cells.length >= 2) {
        const accountName = row.cells[0]?.value || '';
        
        // Try to find the value cell - could be at index 1 (for single period) or last cell
        let value = 0;
        
        // Look for the first numeric cell after the account name
        for (let i = 1; i < row.cells.length; i++) {
          const cellValue = row.cells[i]?.value;
          if (cellValue !== undefined && cellValue !== null && cellValue !== '') {
            const parsed = parseFloat(cellValue.toString().replace(/[^0-9.-]/g, ''));
            if (!isNaN(parsed) && parsed !== 0) {
              value = parsed;
              break;
            }
          }
        }

        if (accountName && value !== 0) {
          accountsFound++;
          const targetField = mappingLookup.get(accountName.toLowerCase());
          
          if (applyMappedValue(details, targetField, value)) {
            accountsMapped++;
            console.log(`${indent}✅ ${accountName} ($${value.toFixed(2)}) → ${targetField}`);
          } else {
            // Log unmapped accounts for debugging (skip section headers/totals)
            if (accountName.length > 3 && !accountName.toLowerCase().includes('total')) {
              console.log(`${indent}⚠️  ${accountName} ($${value.toFixed(2)}) → ${targetField || 'NOT MAPPED'}`);
            }
          }
        }
      } else if (row.rowType === 'Section' || row.rowType === 'Header') {
        // Log section headers for context
        const sectionName = row.title || row.cells?.[0]?.value || '';
        if (sectionName && depth === 0) {
          console.log(`${indent}📂 ${sectionName}`);
        }
      }

      // Recursively process nested rows
      if (row.rows && row.rows.length > 0) {
        parseRows(row.rows, depth + 1);
      }
    }
  }

  if (plData?.rows) {
    parseRows(plData.rows);
  }
  
  console.log(`  📊 Found ${accountsFound} accounts, mapped ${accountsMapped} to target fields`);

  // Calculate totals
  details.cogsTotal = details.cogsPayroll + details.cogsOwnerPay + details.cogsContractors +
                      details.cogsMaterials + details.cogsCommissions + details.cogsOther +
                      sumSectorCogs(details);
  
  details.expense = details.payroll + details.ownerBasePay + details.benefits + details.insurance +
                    details.professionalFees + details.subcontractors + details.rent + details.taxLicense +
                    details.phoneComm + details.infrastructure + details.autoTravel + details.salesExpense +
                    details.marketing + details.trainingCert + details.mealsEntertainment + 
                    details.interestExpense + details.depreciationAmortization + details.otherExpense;

  return details;
}

