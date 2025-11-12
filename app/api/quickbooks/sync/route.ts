import { NextRequest, NextResponse } from 'next/server';
import OAuthClient from 'intuit-oauth';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { createMonthlyRecords } from '@/lib/quickbooks-parser';

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

  try {
    const { companyId, userId } = await request.json();

    if (!companyId || !userId) {
      return NextResponse.json({ error: 'Company ID and User ID are required' }, { status: 400 });
    }

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
      console.log('🔄 Token expiring soon, refreshing...');
      try {
        const refreshResponse = await oauthClient.refresh();
        const newToken = refreshResponse.getJson();

        // Update tokens in database
        await prisma.accountingConnection.update({
          where: {
            companyId_platform: {
              companyId,
              platform: 'QUICKBOOKS',
            },
          },
          data: {
            accessToken: encryptToken(newToken.access_token),
            refreshToken: encryptToken(newToken.refresh_token),
            tokenExpiresAt: new Date(Date.now() + (newToken.expires_in || 3600) * 1000),
            status: 'ACTIVE',
            errorMessage: null,
          },
        });

        // Update the token on the client
        (oauthClient as any).token = newToken;
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

    // Fetch Profit & Loss Report using direct HTTP request to avoid header size issues
    // Request monthly summarization to get end-of-month data for each month
    const plUrl = `${companyUrl}/reports/ProfitAndLoss?start_date=${dateStart}&end_date=${dateEnd}&accounting_method=Accrual&summarize_column_by=Month&minorversion=65`;
    
    const plResponse = await fetch(plUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    // Check if the API call failed
    if (!plResponse.ok) {
      const errorText = await plResponse.text();
      console.error('❌ QuickBooks API error - Status:', plResponse.status);
      console.error('❌ Response body:', errorText);
      console.error('❌ Request URL:', plUrl);
      console.error('❌ Access token (first 20 chars):', accessToken?.substring(0, 20) + '...');
      
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
          details: errorText 
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

    // Fetch Balance Sheet Report using direct HTTP request
    // Request monthly summarization to get end-of-month data for each month
    const bsUrl = `${companyUrl}/reports/BalanceSheet?start_date=${dateStart}&end_date=${dateEnd}&summarize_column_by=Month&minorversion=65`;
    
    const bsResponse = await fetch(bsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    // Check if the API call failed
    if (!bsResponse.ok) {
      const errorText = await bsResponse.text();
      console.error('QuickBooks BS API error - Status:', bsResponse.status);
      console.error('Response body:', errorText);
      
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
          needsReconnect: true 
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

    // Fetch Chart of Accounts to get account codes/numbers
    const accountsUrl = `${companyUrl}/query?query=SELECT * FROM Account&minorversion=65`;
    
    const accountsResponse = await fetch(accountsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    let accountsData = null;
    if (accountsResponse.ok) {
      accountsData = await accountsResponse.json();
      console.log(`Fetched ${accountsData?.QueryResponse?.Account?.length || 0} accounts from Chart of Accounts`);
    } else {
      console.warn('Failed to fetch Chart of Accounts, continuing without account codes');
    }

    // Create a financial record
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
        },
        columnMapping: {
          source: 'QuickBooks Online',
          method: 'API Sync',
        },
      },
    });

    // Parse and create monthly financial records
    const parsedRecords = createMonthlyRecords(plData, bsData, financialRecord.id, 36);
    
    if (parsedRecords.length > 0) {
      const monthlyRecords = parsedRecords.map(record => ({
        companyId: companyId,
        financialRecordId: financialRecord.id,
        monthDate: record.monthDate,
        revenue: record.revenue,
        expense: record.expense,
        cogsTotal: record.cogsTotal,
        cash: record.cash,
        ar: record.ar,
        inventory: record.inventory,
        otherCA: record.otherCA,
        tca: record.tca,
        fixedAssets: record.fixedAssets,
        otherAssets: record.otherAssets,
        totalAssets: record.totalAssets,
        ap: record.ap,
        otherCL: record.otherCL,
        tcl: record.tcl,
        ltd: record.ltd,
        totalLiab: record.totalLiab,
        ownersCapital: 0, // TODO: Parse from QB Balance Sheet
        ownersDraw: 0,
        commonStock: 0,
        preferredStock: 0,
        retainedEarnings: 0,
        additionalPaidInCapital: 0,
        treasuryStock: 0,
        totalEquity: record.totalEquity,
        totalLAndE: record.totalLAndE,
      }));

      await prisma.monthlyFinancial.createMany({
        data: monthlyRecords,
      });
      recordsImported = monthlyRecords.length;
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
        errorDetails: errors.length > 0 ? { errors } : undefined,
        duration: Date.now() - syncStartTime,
      },
    });

    console.log(`Successfully synced ${recordsImported} months of financial data`);

    return NextResponse.json({
      success: true,
      message: `QuickBooks data synced successfully! ${recordsImported} months imported.`,
      recordsImported,
      monthsImported: recordsImported,
    });
  } catch (error: any) {
    console.error('QuickBooks sync error:', error);
    errorCount++;
    errors.push({ message: error.message, stack: error.stack });

    // Log the failed sync
    const body = await request.json().catch(() => ({}));
    const { companyId } = body;
    if (companyId) {
      await prisma.apiSyncLog.create({
        data: {
          companyId,
          platform: 'QUICKBOOKS',
          syncType: 'manual',
          status: 'error',
          recordsImported,
          errorCount,
          errorDetails: { errors },
          duration: Date.now() - syncStartTime,
        },
      });
    }

    return NextResponse.json(
      { error: 'Failed to sync QuickBooks data', details: error.message },
      { status: 500 }
    );
  }
}

