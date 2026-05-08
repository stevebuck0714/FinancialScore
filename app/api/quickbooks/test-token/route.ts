import { NextRequest, NextResponse } from 'next/server';
import OAuthClient from 'intuit-oauth';
import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

function qboApiBaseUrl(): string {
  return (process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox') === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

function hintForFailure(status: number, errorPreview: string): string | undefined {
  const combined = `${status} ${errorPreview}`.toLowerCase();
  if (status === 404 || combined.includes('could not find') || combined.includes('not found')) {
    return 'Often this means QUICKBOOKS_ENVIRONMENT on the server does not match the company (sandbox company needs sandbox; production needs production), or the realmId on the connection is wrong. Reconnect QuickBooks after fixing the env.';
  }
  if (status === 401 || status === 403) {
    return 'Authorization failed after attempting a token refresh. Reconnect QuickBooks from API Connections, or confirm the Intuit app still has access to this company.';
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
    });

    if (!connection || !connection.accessToken || !connection.refreshToken) {
      return NextResponse.json({
        error: 'QuickBooks not connected',
        connected: false,
      }, { status: 400 });
    }

    console.log('\n🧪 QUICKBOOKS TOKEN TEST');
    console.log('========================');

    let accessToken: string;
    let refreshToken: string;
    try {
      accessToken = decryptOAuthToken(connection.accessToken);
      refreshToken = decryptOAuthToken(connection.refreshToken);
      console.log('✅ Token decryption: SUCCESS');
    } catch (err) {
      console.error('❌ Token decryption: FAILED', err);
      return NextResponse.json({
        error: 'Token decryption failed',
        needsReconnect: true,
        connected: false,
      }, { status: 401 });
    }

    const now = new Date();
    const expired = connection.tokenExpiresAt ? connection.tokenExpiresAt < now : false;
    const timeUntilExpiry = connection.tokenExpiresAt
      ? connection.tokenExpiresAt.getTime() - now.getTime()
      : null;

    const baseUrl = qboApiBaseUrl();
    const realmId = connection.realmId?.trim();
    if (!realmId) {
      return NextResponse.json(
        {
          connected: true,
          tokenDecryption: 'success',
          tokenWorksWithAPI: false,
          error: 'realmId is missing on this connection. Reconnect QuickBooks.',
          needsReconnect: true,
          environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
        },
        { status: 400 }
      );
    }

    const testUrl = `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`;

    const callCompanyInfo = (token: string) =>
      fetch(testUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

    let testResponse = await callCompanyInfo(accessToken);
    let refreshed = false;

    if (!testResponse.ok && (testResponse.status === 401 || testResponse.status === 403)) {
      console.warn(`⚠️ CompanyInfo returned ${testResponse.status}; attempting token refresh...`);
      try {
        const oauthClient = new OAuthClient({
          clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
          clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
          environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
          redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback',
        });
        const refreshResponse = await oauthClient.refreshUsingToken(refreshToken);
        const newToken = refreshResponse.getJson();
        const newAccess = newToken.access_token as string;
        const newRefresh = (newToken.refresh_token as string) || refreshToken;
        const expiresIn = (newToken.expires_in as number) || 3600;

        await prisma.accountingConnection.update({
          where: {
            companyId_platform: { companyId, platform: 'QUICKBOOKS' },
          },
          data: {
            accessToken: encryptOAuthToken(newAccess),
            refreshToken: encryptOAuthToken(newRefresh),
            tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
            status: 'ACTIVE',
            errorMessage: null,
          },
        });
        accessToken = newAccess;
        refreshToken = newRefresh;
        refreshed = true;
        testResponse = await callCompanyInfo(accessToken);
        console.log('✅ Token refresh succeeded; retried CompanyInfo:', testResponse.status);
      } catch (refreshErr) {
        console.error('❌ Token refresh failed:', refreshErr);
        await prisma.accountingConnection.updateMany({
          where: { companyId, platform: 'QUICKBOOKS' },
          data: {
            status: 'EXPIRED',
            errorMessage: 'Token refresh failed during connection validation — reconnect QuickBooks',
          },
        });
        const errorBody = await testResponse.text().catch(() => '');
        return NextResponse.json({
          connected: true,
          tokenDecryption: 'success',
          tokenExpired: expired,
          tokenWorksWithAPI: false,
          apiResponseStatus: testResponse.status,
          apiErrorPreview: errorBody.slice(0, 1500),
          refreshed: false,
          refreshFailed: true,
          realmId,
          environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
          needsReconnect: true,
          hint: hintForFailure(testResponse.status, errorBody),
        });
      }
    }

    const tokenWorks = testResponse.ok;
    let apiErrorPreview: string | null = null;
    if (!tokenWorks) {
      apiErrorPreview = (await testResponse.text().catch(() => '')).slice(0, 1500);
      console.error('❌ Token test FAILED', testResponse.status, apiErrorPreview);
    } else {
      console.log('✅ Token test PASSED');
    }

    console.log('========================\n');

    return NextResponse.json({
      connected: true,
      tokenDecryption: 'success',
      tokenExpired: expired,
      tokenExpiresAt: connection.tokenExpiresAt?.toISOString(),
      timeUntilExpiry: timeUntilExpiry ? Math.round(timeUntilExpiry / 1000 / 60) + ' minutes' : null,
      tokenWorksWithAPI: tokenWorks,
      apiResponseStatus: testResponse.status,
      apiErrorPreview: tokenWorks ? null : apiErrorPreview,
      realmId,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      refreshed,
      hint: tokenWorks ? undefined : hintForFailure(testResponse.status, apiErrorPreview || ''),
      needsReconnect: !tokenWorks && (testResponse.status === 401 || testResponse.status === 403),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Token test error:', error);
    return NextResponse.json(
      {
        error: 'Token test failed',
        details: message,
      },
      { status: 500 }
    );
  }
}
