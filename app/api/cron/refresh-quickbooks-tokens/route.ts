import { NextRequest, NextResponse } from 'next/server';
import OAuthClient from 'intuit-oauth';
import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isLikelyReconnectRequired(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('invalid_grant') ||
    lower.includes('token is invalid') ||
    lower.includes('token has expired') ||
    lower.includes('revoked') ||
    lower.includes('invalid refresh token')
  );
}

/**
 * Cron endpoint to proactively rotate QuickBooks OAuth tokens.
 * Goal: avoid refresh-token inactivity expiry by refreshing regularly.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';

    if (cronSecret && !isVercelCron && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connections = await prisma.accountingConnection.findMany({
      where: {
        platform: 'QUICKBOOKS',
        refreshToken: { not: null },
        accessToken: { not: null },
      },
      select: {
        id: true,
        companyId: true,
        accessToken: true,
        refreshToken: true,
      },
    });

    if (connections.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No QuickBooks connections found for token refresh.',
        total: 0,
        refreshed: 0,
        failed: 0,
      });
    }

    const oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri:
        process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback',
    });

    let refreshed = 0;
    let failed = 0;
    const failures: Array<{ companyId: string; reason: string }> = [];

    for (const connection of connections) {
      try {
        const accessToken = decryptOAuthToken(String(connection.accessToken));
        const refreshToken = decryptOAuthToken(String(connection.refreshToken));

        (oauthClient as any).token = {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'bearer',
          expires_in: 3600,
        };

        const refreshResponse = await oauthClient.refresh();
        const newToken = refreshResponse.getJson();
        const nextAccessToken = newToken.access_token || accessToken;
        const nextRefreshToken = newToken.refresh_token || refreshToken;
        const tokenExpiresAt = new Date(Date.now() + (newToken.expires_in || 3600) * 1000);

        await prisma.accountingConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: encryptOAuthToken(nextAccessToken),
            refreshToken: encryptOAuthToken(nextRefreshToken),
            tokenExpiresAt,
            status: 'ACTIVE',
            errorMessage: null,
          },
        });

        refreshed += 1;
      } catch (error: any) {
        failed += 1;
        const reason = String(error?.message || 'Unknown token refresh error').slice(0, 500);
        failures.push({ companyId: connection.companyId, reason });

        await prisma.accountingConnection.update({
          where: { id: connection.id },
          data: {
            status: isLikelyReconnectRequired(reason) ? 'EXPIRED' : undefined,
            errorMessage: `Scheduled token refresh failed: ${reason}`.slice(0, 900),
          },
        });
      }
    }

    return NextResponse.json({
      success: failed === 0,
      total: connections.length,
      refreshed,
      failed,
      failures,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to refresh QuickBooks tokens',
      },
      { status: 500 }
    );
  }
}

