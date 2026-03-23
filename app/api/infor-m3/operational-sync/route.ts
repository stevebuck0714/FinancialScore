import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';
import prisma from '@/lib/prisma';
import { normalizeInforSystem } from '@/lib/infor-m3/system';

type Frequency = 'daily' | 'weekly' | 'monthly';
type SyncMode = 'daily_overlap' | 'backfill' | 'manual';
type SyncWindow = { startDate: Date; endDate: Date; mode: SyncMode } | null;

function normalizeFrequency(value: unknown): Frequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildSyncWindow(body: Record<string, unknown>, frequency: Frequency): SyncWindow {
  const explicitStart = parseDate(body.startDate);
  const explicitEnd = parseDate(body.endDate);
  if (explicitStart && explicitEnd && explicitStart <= explicitEnd) {
    return { startDate: explicitStart, endDate: explicitEnd, mode: 'manual' };
  }

  const mode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';
  const now = new Date();
  if (mode === 'backfill') {
    const months = normalizePositiveInt(body.backfillMonths) ?? 36;
    const start = new Date(now);
    start.setMonth(start.getMonth() - months);
    return { startDate: start, endDate: now, mode: 'backfill' };
  }

  if (frequency === 'daily') {
    const lookbackDays = normalizePositiveInt(body.lookbackDays) ?? 30;
    const start = new Date(now);
    start.setDate(start.getDate() - lookbackDays);
    return { startDate: start, endDate: now, mode: 'daily_overlap' };
  }

  return null;
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const frequency = normalizeFrequency(body.frequency);
    const site = String(body.site || '').trim();
    const syncWindow = buildSyncWindow(body, frequency);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);
    if (inforSystem === 'INFOR_CSI' && !site) {
      return NextResponse.json(
        {
          error: 'Missing required field: site',
          details: 'CSI operational sync requires site.',
        },
        { status: 400 }
      );
    }

    const result = await syncInforM3OperationalData(companyId, frequency, site, syncWindow || undefined);
    return NextResponse.json({
      ok: result.success,
      companyId,
      frequency,
      site,
      syncWindow: syncWindow
        ? {
            mode: syncWindow.mode,
            startDate: syncWindow.startDate.toISOString(),
            endDate: syncWindow.endDate.toISOString(),
          }
        : null,
      recordsCreated: result.recordsCreated,
      errors: result.errors,
      credentialSource: result.credentialSource,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to run Infor M3 operational sync',
        details: message,
      },
      { status }
    );
  }
}
