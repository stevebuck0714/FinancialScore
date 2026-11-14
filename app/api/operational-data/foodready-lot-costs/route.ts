import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { isFoodReadyInventorySource, saveFoodReadyLotCost } from '@/lib/operational-data/foodready-inventory';

export const dynamic = 'force-dynamic';

/** Save or clear the unit cost a user entered for one FoodReady lot in the Inventory report. */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({}));
    const companyId = String(body?.companyId || '').trim();
    const itemId = String(body?.itemId || '').trim();
    const lot = String(body?.lot || '').trim() || null;
    const rawCost = body?.unitCost;
    const unitCost = rawCost === null || rawCost === '' || rawCost === undefined ? null : Number(rawCost);
    if (!companyId || !itemId) return NextResponse.json({ error: 'companyId and itemId are required' }, { status: 400 });
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return NextResponse.json({ error: 'unitCost must be a non-negative number' }, { status: 400 });
    }
    if (!(await validateCompanyAccess(companyId))) {
      await auditForbiddenAccess('OperationalData', companyId, 'WRITE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }
    if (!(await isFoodReadyInventorySource(companyId))) {
      return NextResponse.json({ error: 'This company does not take its inventory from FoodReady.' }, { status: 400 });
    }
    await saveFoodReadyLotCost({ companyId, itemId, lot, unitCost });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Saving the lot cost failed';
    return NextResponse.json({ error: message }, { status: message.startsWith('Unauthorized') ? 401 : 500 });
  }
}
