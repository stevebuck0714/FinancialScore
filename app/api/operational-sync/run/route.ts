import { NextRequest, NextResponse } from 'next/server';
import type { AccountingPlatform } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { runOperationalSyncForCompany, type SyncFrequency } from '@/lib/operational-sync/runner';

export const dynamic = 'force-dynamic';

function normalizeFrequency(value: unknown): SyncFrequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function mapAccountingSystemToPlatform(system: unknown): AccountingPlatform | null {
  const normalized = String(system || '').trim().toUpperCase();
  if (normalized === 'INFOR_M3') return 'INFOR_M3';
  if (normalized === 'INFOR_CSI') return 'INFOR_M3';
  if (normalized === 'QUICKBOOKS' || normalized === 'QUICKBOOKS_DESKTOP') return 'QUICKBOOKS';
  if (normalized === 'DYNAMICS' || normalized === 'DYNAMICS365') return 'DYNAMICS365';
  if (normalized === 'ACUMATICA') return 'ACUMATICA';
  if (normalized === 'ODOO') return 'ODOO';
  if (normalized === 'SAGE_INTACCT' || normalized === 'SAGE') return 'SAGE_INTACCT';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const frequency = normalizeFrequency(body.frequency);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }

    const platform = mapAccountingSystemToPlatform(company.accountingSystem);
    if (!platform) {
      return NextResponse.json(
        { ok: false, error: `Operational sync is not supported for accounting system ${company.accountingSystem}.` },
        { status: 400 }
      );
    }

    const result = await runOperationalSyncForCompany(companyId, platform, frequency);

    await prisma.accountingConnection.updateMany({
      where: { companyId, platform },
      data: {
        lastSyncAt: new Date(),
        errorMessage: result.success ? null : result.errors.join(' | ').slice(0, 900),
      },
    });

    return NextResponse.json({
      ok: result.success,
      companyId,
      companyName: company.name,
      platform,
      frequency,
      recordsCreated: result.recordsCreated,
      errors: result.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to run operational sync',
        details: message,
      },
      { status }
    );
  }
}
