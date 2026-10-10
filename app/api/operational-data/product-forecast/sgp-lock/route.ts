import { NextRequest, NextResponse } from 'next/server';
import {
  asForecastYear,
  assertProductsForecastAccess,
  ensureProductRevenueForecastTables,
} from '@/lib/operations/product-revenue-forecast-db';
import { ensureProductRevenueTables } from '@/lib/operations/product-revenue-actual-db';
import {
  buildSgpBudgetSummary,
  canManageSgpBudget,
  getActiveSgpBudgetLock,
  lockSgpBudget,
  SgpBudgetLockedError,
  unlockSgpBudget,
} from '@/lib/operations/product-sgp-budget-lock';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error && error.message ? error.message : fallback;
  const status = error instanceof SgpBudgetLockedError ? 409 : /required|not locked/i.test(message) ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertProductsForecastAccess(companyId);
    if (denied) return denied;

    const year = asForecastYear(request.nextUrl.searchParams.get('year'));
    const preview = request.nextUrl.searchParams.get('preview') === '1';
    const [lock, canManage] = await Promise.all([
      getActiveSgpBudgetLock(companyId, year),
      canManageSgpBudget(companyId),
    ]);
    let summary = null;
    if (preview && canManage && !lock) {
      await Promise.all([ensureProductRevenueTables(), ensureProductRevenueForecastTables()]);
      summary = await buildSgpBudgetSummary(companyId, year);
    }
    return NextResponse.json({ year, lock, canManage, summary });
  } catch (error) {
    return errorResponse(error, 'Failed to load SGP budget lock');
  }
}

async function readBody(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    companyId: String(body.companyId || '').trim(),
    year: asForecastYear(body.year),
    note: String(body.note || ''),
    reason: String(body.reason || ''),
  };
}

async function authorize(companyId: string) {
  if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
  const denied = await assertProductsForecastAccess(companyId);
  if (denied) return denied;
  if (!(await canManageSgpBudget(companyId))) {
    return NextResponse.json(
      { error: 'Only company admins can sign off or unlock the SGP budget.' },
      { status: 403 }
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { companyId, year, note } = await readBody(request);
    const denied = await authorize(companyId);
    if (denied) return denied;
    await Promise.all([ensureProductRevenueTables(), ensureProductRevenueForecastTables()]);
    const lock = await lockSgpBudget({ companyId, year, note });
    return NextResponse.json({ ok: true, year, lock, canManage: true });
  } catch (error) {
    return errorResponse(error, 'Failed to lock SGP budget');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { companyId, year, reason } = await readBody(request);
    const denied = await authorize(companyId);
    if (denied) return denied;
    await unlockSgpBudget({ companyId, year, reason });
    return NextResponse.json({ ok: true, year, lock: null, canManage: true });
  } catch (error) {
    return errorResponse(error, 'Failed to unlock SGP budget');
  }
}
