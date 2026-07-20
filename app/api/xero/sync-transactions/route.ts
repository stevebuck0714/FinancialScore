import { NextRequest, NextResponse } from 'next/server';
import { XeroClient } from 'xero-node';
import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * Sync daily transaction data from Xero
 * This fetches invoices, bills, bank transactions for operational reports
 * 
 * Usage: POST /api/xero/sync-transactions
 * Body: { companyId: string, userId: string, startDate?: string, endDate?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, userId, startDate, endDate } = body;

    if (!companyId || !userId) {
      return NextResponse.json(
        { error: 'Company ID and User ID are required' },
        { status: 400 }
      );
    }

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

    // Refresh token if needed
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const shouldRefresh = connection.tokenExpiresAt && 
                         (connection.tokenExpiresAt.getTime() - now.getTime() < bufferTime);
    
    if (shouldRefresh) {
      console.log('🔄 Refreshing Xero token...');
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
        },
      });
    }

    const tenantId = connection.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID not found' }, { status: 400 });
    }

    // Default date range: last 90 days
    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 90);

    const fetchStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const fetchEndDate = endDate ? new Date(endDate) : defaultEndDate;

    console.log('📅 Syncing transactions from', fetchStartDate.toISOString().split('T')[0], 
                'to', fetchEndDate.toISOString().split('T')[0]);

    let transactionsSynced = 0;

    // 1. Fetch Invoices (AR/Revenue transactions)
    console.log('\n📄 Fetching Invoices...');
    try {
      const invoicesResponse = await xeroClient.accountingApi.getInvoices(
        tenantId,
        undefined, // ifModifiedSince
        `Date >= DateTime(${fetchStartDate.toISOString()}) AND Date <= DateTime(${fetchEndDate.toISOString()})`, // where
        undefined, // order
        undefined, // IDs
        undefined, // invoiceNumbers
        undefined, // contactIDs
        undefined, // statuses
        1, // page
        undefined, // includeArchived
        false, // createdByMyApp
        undefined, // unitdp
        true // summaryOnly
      );

      const invoices = invoicesResponse.body.invoices || [];
      console.log(`  Found ${invoices.length} invoices`);

      // Store invoices in database
      for (const invoice of invoices) {
        await prisma.xeroTransaction.upsert({
          where: {
            companyId_transactionId: {
              companyId,
              transactionId: invoice.invoiceID || '',
            },
          },
          create: {
            companyId,
            transactionId: invoice.invoiceID || '',
            transactionType: 'INVOICE',
            date: invoice.date || new Date(),
            dueDate: invoice.dueDate,
            contact: invoice.contact?.name || '',
            reference: invoice.reference || '',
            total: invoice.total || 0,
            amountPaid: invoice.amountPaid || 0,
            amountDue: invoice.amountDue || 0,
            status: invoice.status || '',
            lineItems: (invoice.lineItems || []) as any,
            rawData: invoice as any,
          },
          update: {
            date: invoice.date || new Date(),
            dueDate: invoice.dueDate,
            contact: invoice.contact?.name || '',
            reference: invoice.reference || '',
            total: invoice.total || 0,
            amountPaid: invoice.amountPaid || 0,
            amountDue: invoice.amountDue || 0,
            status: invoice.status || '',
            lineItems: (invoice.lineItems || []) as any,
            rawData: invoice as any,
            updatedAt: new Date(),
          },
        });
        transactionsSynced++;
      }
    } catch (error: any) {
      console.error('❌ Error fetching invoices:', error.message);
    }

    // 2. Fetch Bills (AP/Expense transactions)
    console.log('\n📄 Fetching Bills...');
    try {
      const billsResponse = await xeroClient.accountingApi.getInvoices(
        tenantId,
        undefined,
        `Type == "ACCPAY" AND Date >= DateTime(${fetchStartDate.toISOString()}) AND Date <= DateTime(${fetchEndDate.toISOString()})`,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        undefined,
        false,
        undefined,
        true
      );

      const bills = billsResponse.body.invoices || [];
      console.log(`  Found ${bills.length} bills`);

      for (const bill of bills) {
        await prisma.xeroTransaction.upsert({
          where: {
            companyId_transactionId: {
              companyId,
              transactionId: bill.invoiceID || '',
            },
          },
          create: {
            companyId,
            transactionId: bill.invoiceID || '',
            transactionType: 'BILL',
            date: bill.date || new Date(),
            dueDate: bill.dueDate,
            contact: bill.contact?.name || '',
            reference: bill.reference || '',
            total: bill.total || 0,
            amountPaid: bill.amountPaid || 0,
            amountDue: bill.amountDue || 0,
            status: bill.status || '',
            lineItems: (bill.lineItems || []) as any,
            rawData: bill as any,
          },
          update: {
            date: bill.date || new Date(),
            dueDate: bill.dueDate,
            contact: bill.contact?.name || '',
            reference: bill.reference || '',
            total: bill.total || 0,
            amountPaid: bill.amountPaid || 0,
            amountDue: bill.amountDue || 0,
            status: bill.status || '',
            lineItems: (bill.lineItems || []) as any,
            rawData: bill as any,
            updatedAt: new Date(),
          },
        });
        transactionsSynced++;
      }
    } catch (error: any) {
      console.error('❌ Error fetching bills:', error.message);
    }

    // 3. Fetch Bank Transactions
    console.log('\n🏦 Fetching Bank Transactions...');
    try {
      const bankTxResponse = await xeroClient.accountingApi.getBankTransactions(
        tenantId,
        undefined, // ifModifiedSince
        `Date >= DateTime(${fetchStartDate.toISOString()}) AND Date <= DateTime(${fetchEndDate.toISOString()})`, // where
        undefined, // order
        1, // page
        100 // pageSize
      );

      const bankTransactions = bankTxResponse.body.bankTransactions || [];
      console.log(`  Found ${bankTransactions.length} bank transactions`);

      for (const txn of bankTransactions) {
        await prisma.xeroTransaction.upsert({
          where: {
            companyId_transactionId: {
              companyId,
              transactionId: txn.bankTransactionID || '',
            },
          },
          create: {
            companyId,
            transactionId: txn.bankTransactionID || '',
            transactionType: 'BANK_TRANSACTION',
            date: txn.date || new Date(),
            contact: txn.contact?.name || '',
            reference: txn.reference || '',
            total: txn.total || 0,
            status: txn.status || '',
            lineItems: txn.lineItems || [],
            rawData: txn as any,
          },
          update: {
            date: txn.date || new Date(),
            contact: txn.contact?.name || '',
            reference: txn.reference || '',
            total: txn.total || 0,
            status: txn.status || '',
            lineItems: txn.lineItems || [],
            rawData: txn as any,
            updatedAt: new Date(),
          },
        });
        transactionsSynced++;
      }
    } catch (error: any) {
      console.error('❌ Error fetching bank transactions:', error.message);
    }

    console.log(`\n✅ Synced ${transactionsSynced} transactions`);

    return NextResponse.json({
      success: true,
      message: `Synced ${transactionsSynced} transactions`,
      transactionsSynced,
      dateRange: {
        start: fetchStartDate.toISOString().split('T')[0],
        end: fetchEndDate.toISOString().split('T')[0],
      },
    });

  } catch (error: any) {
    console.error('❌ Transaction sync error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to sync transactions',
    }, { status: 500 });
  }
}

