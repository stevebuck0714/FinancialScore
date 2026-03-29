import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getInforM3CredentialsForCompany } from '@/lib/infor-m3/credentials';
import { requestInforM3AccessToken } from '@/lib/infor-m3/client';

type Frequency = 'daily' | 'weekly' | 'monthly';

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

    const frequency = normalizeFrequency(body.frequency);
    const pullTime = normalizePullTime(body.pullTime);
    const autoSyncWindowDays = normalizePositiveInt(body.autoSyncWindowDays);

    if (!frequency || !pullTime) {
      return NextResponse.json(
        { error: 'frequency (daily|weekly|monthly) and pullTime (HH:mm) are required.' },
        { status: 400 }
      );
    }

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

    const mergedMetadata = {
      ...existingMetadata,
      operationalPullTime: pullTime,
      ...(typeof autoSyncWindowDays === 'number'
        ? { operationalAutoSyncWindowDays: autoSyncWindowDays }
        : {}),
      operationalScheduleUpdatedAt: new Date().toISOString(),
    };

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      update: {
        autoSync: true,
        syncFrequency: frequency,
        connectionMetadata: mergedMetadata,
        errorMessage: null,
      },
      create: {
        companyId,
        platform: 'INFOR_M3',
        status: 'INACTIVE',
        autoSync: true,
        syncFrequency: frequency,
        connectionMetadata: mergedMetadata,
      },
    });

    // Trigger immediate pull attempt by validating token with stored company credentials.
    const credentials = await getInforM3CredentialsForCompany(companyId);
    if (!credentials) {
      return NextResponse.json(
        {
          ok: false,
          companyId,
          message:
            'Schedule saved, but credentials are not configured yet. Connect Infor M3 first to enable operational pulls.',
        },
        { status: 200 }
      );
    }

    const tokenResult = await requestInforM3AccessToken(credentials, 12000);
    if (!tokenResult.ok) {
      await prisma.accountingConnection.update({
        where: {
          companyId_platform: {
            companyId,
            platform: 'INFOR_M3',
          },
        },
        data: {
          status: 'ERROR',
          errorMessage: tokenResult.errorDescription || tokenResult.error || 'Token request failed',
        },
      });

      return NextResponse.json(
        {
          ok: false,
          companyId,
          message: 'Schedule saved, but operational pull trigger failed.',
          details: tokenResult.errorDescription || tokenResult.error || 'Token request failed',
        },
        { status: 502 }
      );
    }

    await prisma.accountingConnection.update({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      data: {
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        errorMessage: null,
      },
    });

    await prisma.apiSyncLog.create({
      data: {
        companyId,
        platform: 'INFOR_M3',
        syncType: 'operational_manual_trigger',
        status: 'success',
        recordsImported: 0,
        errorCount: 0,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      frequency,
      pullTime,
      autoSyncWindowDays: typeof autoSyncWindowDays === 'number' ? autoSyncWindowDays : null,
      message: 'Operational schedule saved and pull trigger executed.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to save operational schedule',
        details: message,
      },
      { status }
    );
  }
}
