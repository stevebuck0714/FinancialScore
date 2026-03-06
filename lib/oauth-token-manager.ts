import prisma from '@/lib/prisma';
import type { AccountingPlatform } from '@prisma/client';
import { decryptOAuthToken, encryptOAuthToken } from '@/lib/encryption';

type ManagedPlatform = Extract<AccountingPlatform, 'QUICKBOOKS' | 'XERO'>;

type EnsureValidOAuthTokensParams = {
  companyId: string;
  platform: ManagedPlatform;
  forceRefresh?: boolean;
  bufferMs?: number;
  refreshReason?: string;
  onRefresh: (tokens: { accessToken: string; refreshToken: string }) => Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds?: number;
  }>;
  onRefreshFailureMessage?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExpiringSoon(expiresAt: Date | null | undefined, bufferMs: number): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - Date.now() < bufferMs;
}

async function tryAcquireLock(lockKey: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_lock(hashtext(${lockKey})) as acquired
  `;
  return Boolean(rows?.[0]?.acquired);
}

async function releaseLock(lockKey: string): Promise<void> {
  await prisma.$queryRaw`
    SELECT pg_advisory_unlock(hashtext(${lockKey}))
  `;
}

export async function ensureValidOAuthTokens(
  params: EnsureValidOAuthTokensParams,
): Promise<{ accessToken: string; refreshToken: string }> {
  const {
    companyId,
    platform,
    forceRefresh = false,
    bufferMs = 5 * 60 * 1000,
    onRefresh,
    refreshReason = 'token refresh',
    onRefreshFailureMessage = 'Token refresh failed - please reconnect',
  } = params;

  const readConnection = async () =>
    prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform,
        },
      },
      select: {
        id: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
        status: true,
      },
    });

  const connection = await readConnection();
  if (!connection?.accessToken || !connection?.refreshToken) {
    throw new Error(`${platform} not connected`);
  }

  if (!forceRefresh && !isExpiringSoon(connection.tokenExpiresAt, bufferMs)) {
    return {
      accessToken: decryptOAuthToken(connection.accessToken),
      refreshToken: decryptOAuthToken(connection.refreshToken),
    };
  }

  const lockKey = `oauth-refresh:${platform}:${companyId}`;
  let acquired = false;

  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      acquired = await tryAcquireLock(lockKey);
      if (acquired) break;

      // Another worker is refreshing. Wait briefly, then reuse fresh tokens if available.
      await sleep(500);
      const waiting = await readConnection();
      if (waiting?.accessToken && waiting?.refreshToken && !isExpiringSoon(waiting.tokenExpiresAt, bufferMs)) {
        return {
          accessToken: decryptOAuthToken(waiting.accessToken),
          refreshToken: decryptOAuthToken(waiting.refreshToken),
        };
      }
    }

    if (!acquired) {
      throw new Error(`Unable to acquire OAuth refresh lock for ${platform}`);
    }

    const latest = await readConnection();
    if (!latest?.accessToken || !latest?.refreshToken) {
      throw new Error(`${platform} connection lost while refreshing`);
    }

    if (!forceRefresh && !isExpiringSoon(latest.tokenExpiresAt, bufferMs)) {
      return {
        accessToken: decryptOAuthToken(latest.accessToken),
        refreshToken: decryptOAuthToken(latest.refreshToken),
      };
    }

    const decryptedAccess = decryptOAuthToken(latest.accessToken);
    const decryptedRefresh = decryptOAuthToken(latest.refreshToken);

    const refreshed = await onRefresh({
      accessToken: decryptedAccess,
      refreshToken: decryptedRefresh,
    });

    const nextAccess = refreshed.accessToken;
    const nextRefresh = refreshed.refreshToken || decryptedRefresh;
    const expiresInSeconds = Number(refreshed.expiresInSeconds || 3600);

    await prisma.accountingConnection.update({
      where: {
        companyId_platform: {
          companyId,
          platform,
        },
      },
      data: {
        accessToken: encryptOAuthToken(nextAccess),
        refreshToken: encryptOAuthToken(nextRefresh),
        tokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
        status: 'ACTIVE',
        errorMessage: null,
      },
    });

    console.log(`✅ OAuth token refreshed (${platform})`, { companyId, refreshReason });
    return { accessToken: nextAccess, refreshToken: nextRefresh };
  } catch (error: any) {
    await prisma.accountingConnection.updateMany({
      where: {
        companyId,
        platform,
      },
      data: {
        status: 'EXPIRED',
        errorMessage: onRefreshFailureMessage,
      },
    });
    throw error;
  } finally {
    if (acquired) {
      await releaseLock(lockKey).catch(() => undefined);
    }
  }
}
