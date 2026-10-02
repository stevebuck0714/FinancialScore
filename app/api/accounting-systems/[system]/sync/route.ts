import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getAccountingSystemModule } from '@/lib/accounting-systems/registry';
import { runOperationalSyncForCompany, type SyncFrequency } from '@/lib/operational-sync/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteContext = { params: Promise<{ system: string }> };

function normalizeFrequency(value: unknown): SyncFrequency {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function validCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const startedAt = Date.now();
  try {
    const { system } = await context.params;
    const plugin = getAccountingSystemModule(system);
    if (!plugin) {
      return NextResponse.json({ ok: false, error: `Unknown accounting system: ${system}` }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (getAccountingSystemModule(company.accountingSystem)?.key !== plugin.key) {
      return NextResponse.json(
        { ok: false, error: `Sync requires the company's accounting system to be ${plugin.key}.` },
        { status: 400 }
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: { companyId_platform: { companyId, platform: plugin.platform } },
      select: { syncFrequency: true },
    });
    if (!connection) {
      return NextResponse.json(
        { ok: false, error: `No saved ${plugin.label} connection. Save settings before syncing.` },
        { status: 400 }
      );
    }

    const frequency = normalizeFrequency(body.frequency || connection.syncFrequency);
    const mode = body.mode === 'backfill' ? 'backfill' : 'incremental';
    const startDate = body.startDate;
    const endDate = body.endDate;
    if (mode === 'backfill') {
      if (!validCalendarDate(startDate) || !validCalendarDate(endDate) || startDate > endDate) {
        return NextResponse.json(
          { ok: false, error: 'A valid date range is required: start date must be on or before end date.' },
          { status: 400 }
        );
      }
    }
    const result = await runOperationalSyncForCompany(companyId, plugin.platform, frequency, {
      mode,
      startDate: validCalendarDate(startDate) ? startDate : undefined,
      endDate: validCalendarDate(endDate) ? endDate : undefined,
    });

    return NextResponse.json({
      ok: result.success,
      companyId,
      companyName: company.name,
      platform: plugin.platform,
      frequency,
      mode,
      startDate: validCalendarDate(startDate) ? startDate : undefined,
      endDate: validCalendarDate(endDate) ? endDate : undefined,
      recordsCreated: result.recordsCreated,
      moduleCounts: result.moduleCounts,
      errors: result.errors,
      durationMs: Date.now() - startedAt,
      message: result.success
        ? `${plugin.label} ${mode === 'backfill' ? 'date-range sync' : 'sync'} complete: ${result.recordsCreated} record(s) pulled.`
        : `${plugin.label} sync finished with errors.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message, durationMs: Date.now() - startedAt }, { status });
  }
}
