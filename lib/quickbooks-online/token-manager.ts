import OAuthClient from 'intuit-oauth';
import prisma from '@/lib/prisma';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';

const DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const REFRESH_LOCK_TIMEOUT_MS = 60_000;

export class QuickBooksReconnectRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuickBooksReconnectRequiredError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error || 'Unknown QuickBooks token error');
}

export function isQuickBooksReconnectRequired(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('invalid_grant') ||
    lower.includes('token is invalid') ||
    lower.includes('token has expired') ||
    lower.includes('revoked') ||
    lower.includes('invalid refresh token')
  );
}

function shouldRefresh(tokenExpiresAt: Date | null, bufferMs: number): boolean {
  if (!tokenExpiresAt) return true;
  return tokenExpiresAt.getTime() - Date.now() <= bufferMs;
}

type QuickBooksTokenResult = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  realmId: string | null;
  refreshed: boolean;
};

export async function getValidQuickBooksToken(
  connectionId: string,
  options: {
    forceRefresh?: boolean;
    reason?: string;
    refreshBufferMs?: number;
  } = {}
): Promise<QuickBooksTokenResult> {
  const refreshBufferMs = options.refreshBufferMs ?? DEFAULT_REFRESH_BUFFER_MS;
  const reason = options.reason || 'QuickBooks API call';

  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`qbo-token:${connectionId}`}))`;

      const connection = await tx.accountingConnection.findUnique({
        where: { id: connectionId },
        select: {
          id: true,
          realmId: true,
          accessToken: true,
          refreshToken: true,
          tokenExpiresAt: true,
        },
      });

      if (!connection?.accessToken || !connection.refreshToken) {
        throw new QuickBooksReconnectRequiredError('QuickBooks tokens are missing. Reconnect QuickBooks.');
      }

      const accessToken = decryptOAuthToken(connection.accessToken);
      const refreshToken = decryptOAuthToken(connection.refreshToken);

      if (!options.forceRefresh && !shouldRefresh(connection.tokenExpiresAt, refreshBufferMs)) {
        return {
          accessToken,
          refreshToken,
          tokenExpiresAt: connection.tokenExpiresAt as Date,
          realmId: connection.realmId,
          refreshed: false,
        };
      }

      const oauthClient = new OAuthClient({
        clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
        clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
        environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
        redirectUri: process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback',
      });

      try {
        const refreshResponse = await oauthClient.refreshUsingToken(refreshToken);
        const newToken = refreshResponse.getJson();
        const nextAccessToken = newToken.access_token || accessToken;
        const nextRefreshToken = newToken.refresh_token || refreshToken;
        const tokenExpiresAt = new Date(Date.now() + (newToken.expires_in || 3600) * 1000);

        await tx.accountingConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: encryptOAuthToken(nextAccessToken),
            refreshToken: encryptOAuthToken(nextRefreshToken),
            tokenExpiresAt,
            status: 'ACTIVE',
            errorMessage: null,
          },
        });

        return {
          accessToken: nextAccessToken,
          refreshToken: nextRefreshToken,
          tokenExpiresAt,
          realmId: connection.realmId,
          refreshed: true,
        };
      } catch (error) {
        const message = errorMessage(error);
        const needsReconnect = isQuickBooksReconnectRequired(message);
        await tx.accountingConnection.update({
          where: { id: connection.id },
          data: {
            status: needsReconnect ? 'EXPIRED' : 'ACTIVE',
            errorMessage: `QuickBooks token refresh failed (${reason}): ${message}`.slice(0, 900),
          },
        });

        return {
          error: message,
          needsReconnect,
        };
      }
    },
    { timeout: REFRESH_LOCK_TIMEOUT_MS }
  );

  if ('error' in result) {
    if (result.needsReconnect) {
      throw new QuickBooksReconnectRequiredError(`QuickBooks token refresh failed: ${result.error}`);
    }
    throw new Error(`QuickBooks token refresh failed: ${result.error}`);
  }

  return result;
}
