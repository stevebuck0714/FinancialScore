import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import { presentCompanyJson } from '@/lib/currency/api-response';
import {
  CashProofError,
  loadCashProofState,
  runCashProofAction,
  type CashProofAction,
} from '@/lib/cash-proof/service';

export const dynamic = 'force-dynamic';
// Read Statements downloads and parses every file in the Bank Statements folder.
export const maxDuration = 300;

const WRITE_ROLES = new Set(['SITEADMIN', 'CONSULTANT']);

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CashProofError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = String((error as Error)?.message || error);
  if (message.startsWith('Unauthorized')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.error(`${fallback}:`, error);
  return NextResponse.json({ error: fallback, detail: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    if (!(await validateCompanyAccess(companyId))) {
      await auditForbiddenAccess('CashProof', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const state = await withPrismaReconnectRetry(() => loadCashProofState(companyId), 'cash-proof.GET');
    return NextResponse.json(
      await presentCompanyJson(
        request,
        companyId,
        { companyId, canEdit: WRITE_ROLES.has(context.role), ...state },
        // Bank statements are in book currency; never FX-convert the tie-out.
        { convert: false },
      ),
    );
  } catch (error) {
    return errorResponse(error, 'Failed to load cash proof');
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    const body = (await request.json().catch(() => null)) as (CashProofAction & { companyId?: string }) | null;
    const companyId = String(body?.companyId || '').trim();
    if (!body || !companyId || !body.action) {
      return NextResponse.json({ error: 'companyId and action are required' }, { status: 400 });
    }

    if (!(await validateCompanyAccess(companyId))) {
      await auditForbiddenAccess('CashProof', companyId, 'UPDATE');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!WRITE_ROLES.has(context.role)) {
      return NextResponse.json({ error: 'Only consultants and site admins can edit the cash proof' }, { status: 403 });
    }

    await runCashProofAction(companyId, context.userId, body);
    const state = await loadCashProofState(companyId);
    return NextResponse.json(
      await presentCompanyJson(request, companyId, { companyId, canEdit: true, ...state }, { convert: false }),
    );
  } catch (error) {
    return errorResponse(error, 'Failed to update cash proof');
  }
}
