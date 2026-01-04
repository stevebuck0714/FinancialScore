import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';
import prisma from '@/lib/prisma';
import { decryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * Find the actual date range that has financial data in Xero
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }

    console.log('🔍 Finding data range in Xero for company:', companyId);

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

    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    const dataSources: string[] = [];

    // Check invoices
    console.log('📄 Checking invoices for date range...');
    try {
      const invoicesResponse = await xeroClient.accountingApi.getInvoices(
        tenantId,
        undefined,
        undefined,
        'Date DESC',
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        100
      );
      const invoices = invoicesResponse.body.invoices || [];
      
      if (invoices.length > 0) {
        invoices.forEach((inv: any) => {
          if (inv.date) {
            const invDate = new Date(inv.date);
            if (!minDate || invDate < minDate) minDate = invDate;
            if (!maxDate || invDate > maxDate) maxDate = invDate;
          }
        });
        dataSources.push(`${invoices.length} invoices`);
        console.log(`  ✅ Found ${invoices.length} invoices`);
        console.log(`     Earliest: ${invoices[invoices.length - 1]?.date}`);
        console.log(`     Latest: ${invoices[0]?.date}`);
      }
    } catch (error: any) {
      console.error('❌ Error checking invoices:', error.message);
    }

    // Check bank transactions
    console.log('🏦 Checking bank transactions for date range...');
    try {
      const bankTxResponse = await xeroClient.accountingApi.getBankTransactions(
        tenantId,
        undefined,
        undefined,
        'Date DESC',
        1,
        100
      );
      const bankTx = bankTxResponse.body.bankTransactions || [];
      
      if (bankTx.length > 0) {
        bankTx.forEach((tx: any) => {
          if (tx.date) {
            const txDate = new Date(tx.date);
            if (!minDate || txDate < minDate) minDate = txDate;
            if (!maxDate || txDate > maxDate) maxDate = txDate;
          }
        });
        dataSources.push(`${bankTx.length} bank transactions`);
        console.log(`  ✅ Found ${bankTx.length} bank transactions`);
        console.log(`     Earliest: ${bankTx[bankTx.length - 1]?.date}`);
        console.log(`     Latest: ${bankTx[0]?.date}`);
      }
    } catch (error: any) {
      console.error('❌ Error checking bank transactions:', error.message);
    }

    if (!minDate || !maxDate) {
      return NextResponse.json({
        success: false,
        message: 'No financial data found in Xero. The demo company may be empty.',
        hasData: false,
      });
    }

    // Calculate a good sync range (include a bit of buffer)
    const syncStart = new Date(minDate);
    syncStart.setMonth(syncStart.getMonth() - 1); // Start 1 month before earliest data
    syncStart.setDate(1); // First of month
    
    const syncEnd = new Date(maxDate);
    syncEnd.setMonth(syncEnd.getMonth() + 1, 0); // Last day of month

    const result = {
      success: true,
      hasData: true,
      dataRange: {
        earliest: minDate.toISOString().split('T')[0],
        latest: maxDate.toISOString().split('T')[0],
      },
      recommendedSyncRange: {
        start: syncStart.toISOString().split('T')[0],
        end: syncEnd.toISOString().split('T')[0],
      },
      dataSources,
      message: `Found data from ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`,
    };

    console.log('\n✅ Data range analysis complete:');
    console.log(JSON.stringify(result, null, 2));

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('❌ Error finding data range:', error);
    return NextResponse.json({
      error: error.message || 'Failed to find data range',
    }, { status: 500 });
  }
}

