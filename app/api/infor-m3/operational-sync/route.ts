import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';

type Frequency = 'daily' | 'weekly' | 'monthly';

function normalizeFrequency(value: unknown): Frequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const frequency = normalizeFrequency(body.frequency);

    const result = await syncInforM3OperationalData(companyId, frequency);
    return NextResponse.json({
      ok: result.success,
      companyId,
      frequency,
      recordsCreated: result.recordsCreated,
      errors: result.errors,
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
