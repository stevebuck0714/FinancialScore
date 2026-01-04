import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';
import prisma from '@/lib/prisma';
import { decryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint to check what data actually exists in Xero
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }

    console.log('🔍 Running Xero diagnostic for company:', companyId);

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

    const tenantId = connection.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID not found' }, { status: 400 });
    }

    const diagnostic: any = {
      tenantId,
      checks: [],
    };

    // 1. Check organization info
    console.log('\n📋 Checking organization...');
    try {
      const orgResponse = await xeroClient.accountingApi.getOrganisations(tenantId);
      const org = orgResponse.body.organisations?.[0];
      diagnostic.organization = {
        name: org?.name,
        version: org?.version,
        baseCurrency: org?.baseCurrency,
        countryCode: org?.countryCode,
        financialYearEndMonth: org?.financialYearEndMonth,
      };
      console.log('✅ Organization:', org?.name);
    } catch (error: any) {
      console.error('❌ Error fetching organization:', error.message);
    }

    // 2. Check for invoices
    console.log('\n📋 Checking invoices...');
    try {
      const invoicesResponse = await xeroClient.accountingApi.getInvoices(
        tenantId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        10
      );
      const invoices = invoicesResponse.body.invoices || [];
      diagnostic.checks.push({
        check: 'Invoices',
        count: invoices.length,
        sample: invoices.slice(0, 3).map((inv: any) => ({
          date: inv.date,
          total: inv.total,
          status: inv.status,
        })),
      });
      console.log(`✅ Found ${invoices.length} invoices (showing first 10)`);
    } catch (error: any) {
      console.error('❌ Error fetching invoices:', error.message);
    }

    // 3. Check for bank transactions
    console.log('\n📋 Checking bank transactions...');
    try {
      const bankTxResponse = await xeroClient.accountingApi.getBankTransactions(
        tenantId,
        undefined,
        undefined,
        undefined,
        1,
        10
      );
      const bankTx = bankTxResponse.body.bankTransactions || [];
      diagnostic.checks.push({
        check: 'Bank Transactions',
        count: bankTx.length,
        sample: bankTx.slice(0, 3).map((tx: any) => ({
          date: tx.date,
          total: tx.total,
          type: tx.type,
        })),
      });
      console.log(`✅ Found ${bankTx.length} bank transactions (showing first 10)`);
    } catch (error: any) {
      console.error('❌ Error fetching bank transactions:', error.message);
    }

    // 4. Check for manual journals
    console.log('\n📋 Checking manual journals...');
    try {
      const journalsResponse = await xeroClient.accountingApi.getManualJournals(
        tenantId,
        undefined,
        undefined,
        1,
        10
      );
      const journals = journalsResponse.body.manualJournals || [];
      diagnostic.checks.push({
        check: 'Manual Journals',
        count: journals.length,
        sample: journals.slice(0, 3).map((j: any) => ({
          date: j.date,
          total: j.journalLines?.reduce((sum: number, line: any) => sum + (line.lineAmount || 0), 0),
        })),
      });
      console.log(`✅ Found ${journals.length} manual journals (showing first 10)`);
    } catch (error: any) {
      console.error('❌ Error fetching manual journals:', error.message);
    }

    // 5. Try P&L for last month
    console.log('\n📋 Checking P&L report for last month...');
    try {
      const today = new Date();
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      
      const plResponse = await xeroClient.accountingApi.getReportProfitAndLoss(
        tenantId,
        lastMonth.toISOString().split('T')[0],
        lastMonthEnd.toISOString().split('T')[0]
      );
      
      diagnostic.checks.push({
        check: 'P&L Report (last month)',
        rowCount: plResponse.body.rows?.length || 0,
        reportDate: plResponse.body.reportDate,
        reportTitles: plResponse.body.reportTitles,
      });
      console.log(`✅ P&L has ${plResponse.body.rows?.length || 0} rows`);
      
      if (plResponse.body.rows && plResponse.body.rows.length > 0) {
        console.log('   Sample rows:', JSON.stringify(plResponse.body.rows.slice(0, 2), null, 2));
      }
    } catch (error: any) {
      console.error('❌ Error fetching P&L:', error.message);
    }

    // 6. Check accounts with balances
    console.log('\n📋 Checking accounts...');
    try {
      const accountsResponse = await xeroClient.accountingApi.getAccounts(tenantId);
      const accounts = accountsResponse.body.accounts || [];
      const accountsWithBalances = accounts.filter((acc: any) => 
        acc.status === 'ACTIVE' && 
        (acc.bankAccountType || acc.type)
      );
      
      diagnostic.checks.push({
        check: 'Active Accounts',
        total: accounts.length,
        active: accountsWithBalances.length,
        sample: accountsWithBalances.slice(0, 5).map((acc: any) => ({
          name: acc.name,
          code: acc.code,
          type: acc.type,
        })),
      });
      console.log(`✅ ${accountsWithBalances.length} active accounts out of ${accounts.length} total`);
    } catch (error: any) {
      console.error('❌ Error fetching accounts:', error.message);
    }

    console.log('\n✅ Diagnostic complete');
    console.log('Full results:', JSON.stringify(diagnostic, null, 2));

    return NextResponse.json({
      success: true,
      diagnostic,
      summary: {
        hasData: diagnostic.checks.some((c: any) => c.count > 0 || c.rowCount > 0),
        message: diagnostic.checks.some((c: any) => c.count > 0 || c.rowCount > 0)
          ? 'Xero company has some financial data'
          : 'Xero company appears to have NO financial data (empty demo company)',
      },
    });

  } catch (error: any) {
    console.error('❌ Diagnostic error:', error);
    return NextResponse.json({
      error: error.message || 'Diagnostic failed',
    }, { status: 500 });
  }
}

