import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { transformInforM3RawRun } from '@/lib/infor-m3/operational-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function normalizeFrequency(value: unknown): 'daily' | 'weekly' | 'monthly' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const syncRunId = String(body.syncRunId || '').trim();
    if (!syncRunId) {
      return NextResponse.json({ ok: false, error: 'syncRunId is required.' }, { status: 400 });
    }

    const result = await transformInforM3RawRun({
      companyId,
      syncRunId,
      frequency: normalizeFrequency(body.frequency),
      businessDateIso: String(body.businessDateIso || '').trim() || undefined,
      maxBusinessDates:
        Number.isFinite(Number(body.maxBusinessDates)) && Number(body.maxBusinessDates) > 0
          ? Math.floor(Number(body.maxBusinessDates))
          : undefined,
      batchSize:
        Number.isFinite(Number(body.batchSize)) && Number(body.batchSize) > 0
          ? Math.floor(Number(body.batchSize))
          : undefined,
    });

    return NextResponse.json({
      ok: result.success,
      companyId,
      syncRunId,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to process Infor raw transform run.',
        details: message,
      },
      { status }
    );
  }
}
