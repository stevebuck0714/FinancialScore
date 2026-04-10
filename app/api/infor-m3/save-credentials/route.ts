import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  type InforM3Credentials,
  saveInforM3CredentialsForCompany,
} from '@/lib/infor-m3/credentials';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';
type Frequency = 'daily' | 'weekly' | 'monthly';

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseBodyCredentials(body: Record<string, unknown>): Partial<InforM3Credentials> {
  const parsed: Partial<InforM3Credentials> = {};
  const tenantId = normalizeString(body.tenantId);
  const clientName = normalizeString(body.clientName);
  const clientId = normalizeString(body.clientId);
  const clientSecret = normalizeString(body.clientSecret);
  const ionApiBaseUrl = normalizeString(body.ionApiBaseUrl);
  const ssoBaseUrl = normalizeString(body.ssoBaseUrl);
  const oauthAuthPath = normalizeString(body.oauthAuthPath);
  const oauthTokenPath = normalizeString(body.oauthTokenPath);
  const oauthRevokePath = normalizeString(body.oauthRevokePath);
  const serviceAccountAccessKey = normalizeString(body.serviceAccountAccessKey);
  const serviceAccountSecretKey = normalizeString(body.serviceAccountSecretKey);

  if (tenantId) parsed.tenantId = tenantId;
  if (clientName) parsed.clientName = clientName;
  if (clientId) parsed.clientId = clientId;
  if (clientSecret) parsed.clientSecret = clientSecret;
  if (ionApiBaseUrl) parsed.ionApiBaseUrl = ionApiBaseUrl;
  if (ssoBaseUrl) parsed.ssoBaseUrl = ssoBaseUrl;
  if (oauthAuthPath) parsed.oauthAuthPath = oauthAuthPath;
  if (oauthTokenPath) parsed.oauthTokenPath = oauthTokenPath;
  if (oauthRevokePath) parsed.oauthRevokePath = oauthRevokePath;
  if (serviceAccountAccessKey) parsed.serviceAccountAccessKey = serviceAccountAccessKey;
  if (serviceAccountSecretKey) parsed.serviceAccountSecretKey = serviceAccountSecretKey;

  return parsed;
}

function isCompleteCredentials(value: Partial<InforM3Credentials>): value is InforM3Credentials {
  return Boolean(
    value.tenantId &&
      value.clientId &&
      value.clientSecret &&
      value.ionApiBaseUrl &&
      value.ssoBaseUrl &&
      value.serviceAccountAccessKey &&
      value.serviceAccountSecretKey
  );
}

function normalizeFrequency(value: unknown): Frequency | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'daily' || normalized === 'weekly' || normalized === 'monthly') {
    return normalized;
  }
  return null;
}

function normalizePullTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized >= 1 ? normalized : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1) return parsed;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const bodyCredentials = parseBodyCredentials(body);
    const frequency = normalizeFrequency(body.frequency);
    const pullTime = normalizePullTime(body.pullTime);
    const autoSyncWindowDays = normalizePositiveInt(body.autoSyncWindowDays);

    if (!isCompleteCredentials(bodyCredentials)) {
      return NextResponse.json(
        {
          error: 'Missing required Infor M3 credential fields.',
          required: [
            'tenantId',
            'clientId',
            'clientSecret',
            'ionApiBaseUrl',
            'ssoBaseUrl',
            'serviceAccountAccessKey',
            'serviceAccountSecretKey',
          ],
        },
        { status: 400 }
      );
    }

    await saveInforM3CredentialsForCompany(companyId, bodyCredentials, undefined, {
      // Saving credentials should keep this connector usable instead of forcing
      // it into INACTIVE state and blocking follow-up pulls/retries.
      activateConnection: true,
    });

    if (frequency && pullTime) {
      const existing = await prisma.accountingConnection.findUnique({
        where: {
          companyId_platform: {
            companyId,
            platform: 'INFOR_M3',
          },
        },
        select: {
          connectionMetadata: true,
        },
      });

      const existingMetadata =
        existing?.connectionMetadata && typeof existing.connectionMetadata === 'object'
          ? (existing.connectionMetadata as Record<string, unknown>)
          : {};

      await prisma.accountingConnection.update({
        where: {
          companyId_platform: {
            companyId,
            platform: 'INFOR_M3',
          },
        },
        data: {
          autoSync: true,
          syncFrequency: frequency,
          connectionMetadata: {
            ...existingMetadata,
            operationalPullTime: pullTime,
            ...(typeof autoSyncWindowDays === 'number'
              ? { operationalAutoSyncWindowDays: autoSyncWindowDays }
              : {}),
            operationalScheduleUpdatedAt: new Date().toISOString(),
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      companyId,
      message: 'Infor M3 credentials and schedule saved for this company.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to save Infor M3 credentials',
        details: message,
      },
      { status }
    );
  }
}
