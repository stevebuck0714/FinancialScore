import { NextRequest, NextResponse } from 'next/server';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { generateCompanyPulse, getCompanyPulseContext, getCompanyPulseSnapshot } from '@/lib/company-pulse/generator';
import { presentCompanyJson } from '@/lib/currency/api-response';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const COMPANY_PULSE_ENABLED = String(process.env.COMPANY_PULSE_ENABLED || 'true').toLowerCase() !== 'false';

async function requireCompanyAccess(companyId: string, action: string) {
  await requireAuth();
  const hasAccess = await validateCompanyAccess(companyId);
  if (!hasAccess) {
    await auditForbiddenAccess('Company', companyId, action);
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  if (!COMPANY_PULSE_ENABLED) {
    return NextResponse.json({ error: 'Company Pulse is disabled.' }, { status: 410 });
  }
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }
    if (!(await requireCompanyAccess(companyId, 'PULSE_COMPANY_READ'))) {
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const [snapshot, context] = await Promise.all([
      getCompanyPulseSnapshot(companyId),
      getCompanyPulseContext(companyId),
    ]);
    return NextResponse.json(await presentCompanyJson(request, companyId, { ...snapshot, ...context }));
  } catch (error: any) {
    console.error('Company Pulse GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load Company Pulse', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!COMPANY_PULSE_ENABLED) {
    return NextResponse.json({ error: 'Company Pulse is disabled.' }, { status: 410 });
  }
  try {
    const authContext = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const companyId = String(body?.companyId || request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Company', companyId, 'PULSE_COMPANY_GENERATE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const [result, pulseContext] = await Promise.all([
      generateCompanyPulse(companyId, {
        actorUserId: authContext.userId,
        actorEmail: authContext.email,
      }),
      getCompanyPulseContext(companyId),
    ]);
    return NextResponse.json(await presentCompanyJson(request, companyId, { ...result, ...pulseContext }));
  } catch (error: any) {
    console.error('Company Pulse POST error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Company Pulse', details: String(error?.message || error) },
      { status: 500 }
    );
  }
}
