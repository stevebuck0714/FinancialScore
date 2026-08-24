import prisma from '@/lib/prisma';
import type { AccountingPlatform, Prisma } from '@prisma/client';
import { isProductionSite } from '@/lib/db-security';
import { sendSyncFailureNotification } from '@/lib/email';

const DEFAULT_SYNC_ALERT_RECIPIENT = 'support@corelytics.com';

type NotifySyncFailureParams = {
  companyId: string;
  platform: AccountingPlatform;
  syncType: string;
  errorSummary: string;
  errorDetails?: string;
  dedupeHours?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Unknown error';
}

function buildAlertKey(params: NotifySyncFailureParams): string {
  const summary = (params.errorSummary || '').trim().toLowerCase().slice(0, 180);
  return `${params.companyId}|${params.platform}|${params.syncType}|${summary}`;
}

export async function notifyAdminsOfSyncFailure(params: NotifySyncFailureParams): Promise<{
  notified: boolean;
  deduped: boolean;
  reason?: string;
}> {
  if (!isProductionSite()) {
    return { notified: false, deduped: false, reason: 'Sync failure alerts are production-only' };
  }

  try {
    const dedupeHours = Number.isFinite(params.dedupeHours) ? Number(params.dedupeHours) : 12;
    const cutoff = new Date(Date.now() - dedupeHours * 60 * 60 * 1000);
    const alertKey = buildAlertKey(params);

    const recentAlerts = await prisma.apiSyncLog.findMany({
      where: {
        companyId: params.companyId,
        platform: params.platform,
        syncType: 'sync_failure_alert',
        createdAt: { gte: cutoff },
      },
      select: {
        errorDetails: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    const alreadyAlerted = recentAlerts.some((row) => {
      const details =
        row.errorDetails && typeof row.errorDetails === 'object' && !Array.isArray(row.errorDetails)
          ? (row.errorDetails as Record<string, unknown>)
          : {};
      return String(details.alertKey || '') === alertKey;
    });

    if (alreadyAlerted) {
      return { notified: false, deduped: true, reason: 'Already alerted in dedupe window' };
    }

    const [company, admins] = await Promise.all([
      prisma.company.findUnique({
        where: { id: params.companyId },
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { role: 'SITEADMIN' },
        select: { email: true },
      }),
    ]);

    const recipients = Array.from(
      new Set(
        [
          DEFAULT_SYNC_ALERT_RECIPIENT,
          ...admins.map((a) => (a.email || '').trim().toLowerCase()).filter(Boolean),
        ]
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const actionUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || undefined;
    const result = await sendSyncFailureNotification({
      recipients,
      companyName: company?.name || params.companyId,
      companyId: params.companyId,
      platform: params.platform,
      syncType: params.syncType,
      errorSummary: params.errorSummary,
      errorDetails: params.errorDetails,
      actionUrl,
    });
    const resultMeta = asRecord(result);
    const resultReason = typeof resultMeta.reason === 'string' ? resultMeta.reason : null;

    await prisma.apiSyncLog.create({
      data: {
        companyId: params.companyId,
        platform: params.platform,
        syncType: 'sync_failure_alert',
        status: result.success ? 'success' : 'error',
        recordsImported: 0,
        errorCount: result.success ? 0 : 1,
        errorDetails: {
          alertKey,
          sourceSyncType: params.syncType,
          errorSummary: params.errorSummary,
          errorDetails: params.errorDetails || null,
          recipientsCount: recipients.length,
          emailSent: Boolean(result.success),
          reason: resultReason,
        } as Prisma.InputJsonValue,
      },
    });

    return { notified: Boolean(result.success), deduped: false, reason: resultReason || undefined };
  } catch (error: unknown) {
    console.error('❌ Failed to notify admins of sync failure:', error);
    return { notified: false, deduped: false, reason: errorMessage(error) };
  }
}
