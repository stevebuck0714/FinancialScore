import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ensureRealEstateConstructionTables } from '@/lib/real-estate/construction-tables';

export const dynamic = 'force-dynamic';

const ASSET_CLASSES = ['land', 'building', 'land_improvements', 'equipment', 'ffe'];

async function authorize(companyId: string, action: string) {
  await requireAuth();
  if (await validateCompanyAccess(companyId)) return true;
  await auditForbiddenAccess('Company', companyId, action);
  return false;
}

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
  if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
  if (!(await authorize(companyId, 'OPERATIONS_REAL_ESTATE_READ'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureRealEstateConstructionTables();
    const [draws, budgetLines, invoices, fundingSources, fixedAssets] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "sequence", "label", to_char("drawDate", 'YYYY-MM-DD') AS "drawDate", "equityFunded"::float AS "equityFunded",
          "loanFunded"::float AS "loanFunded", "retainageHeld"::float AS "retainageHeld", "liquidatedDamages"::float AS "liquidatedDamages",
          "sourceDocument", "notes"
         FROM "RealEstateConstructionDraw" WHERE "companyId"=$1 ORDER BY "sequence"`,
        companyId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "lineNumber", "name", "revisedBudget"::float AS "revisedBudget", "remainingAfter"::float AS "remainingAfter", "asOfSequence", "costClass"
         FROM "RealEstateConstructionBudgetLine" WHERE "companyId"=$1 ORDER BY "lineNumber"`,
        companyId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "id", "drawSequence", "budgetLine", "vendor", to_char("invoiceDate", 'YYYY-MM-DD') AS "invoiceDate", "invoiceNumber",
          "debtAmount"::float AS "debtAmount", "equityAmount"::float AS "equityAmount", "sourceFileName"
         FROM "RealEstateConstructionInvoice" WHERE "companyId"=$1 ORDER BY "drawSequence", "budgetLine", "vendor"`,
        companyId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "stage", "effectiveSequence", "sourceName", "amount"::float AS "amount", "sortOrder"
         FROM "RealEstateFundingSource" WHERE "companyId"=$1 ORDER BY "effectiveSequence", "sortOrder"`,
        companyId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "id", "name", "assetClass", "cost"::float AS "cost", to_char("inServiceDate", 'YYYY-MM-DD') AS "inServiceDate",
          "usefulLifeYears"::float AS "usefulLifeYears", "basis", "sortOrder"
         FROM "RealEstateFixedAsset" WHERE "companyId"=$1 ORDER BY "sortOrder", "name"`,
        companyId,
      ),
    ]);
    return NextResponse.json({ draws, budgetLines, invoices, fundingSources, fixedAssets });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to load construction data', details: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const companyId = String(body?.companyId || '').trim();
  const kind = String(body?.kind || '').trim();
  if (!companyId || !['fixed-asset', 'fixed-asset-delete'].includes(kind)) {
    return NextResponse.json({ error: 'Company ID and a supported record type are required.' }, { status: 400 });
  }
  if (!(await authorize(companyId, 'OPERATIONS_REAL_ESTATE_WRITE'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureRealEstateConstructionTables();
    const id = String(body.id || '').trim();
    if (kind === 'fixed-asset-delete') {
      if (!id) return NextResponse.json({ error: 'Asset ID is required.' }, { status: 400 });
      await prisma.$executeRawUnsafe('DELETE FROM "RealEstateFixedAsset" WHERE "id"=$1 AND "companyId"=$2', id, companyId);
      return NextResponse.json({ ok: true });
    }
    const name = String(body.name || '').trim();
    const assetClass = String(body.assetClass || '').trim();
    const cost = Number(body.cost);
    const inServiceDate = body.inServiceDate ? String(body.inServiceDate) : null;
    const usefulLifeYears = body.usefulLifeYears === null || body.usefulLifeYears === '' || body.usefulLifeYears === undefined ? null : Number(body.usefulLifeYears);
    if (
      !name || !ASSET_CLASSES.includes(assetClass) || !Number.isFinite(cost) || cost < 0 ||
      (inServiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(inServiceDate)) ||
      (usefulLifeYears !== null && (!Number.isFinite(usefulLifeYears) || usefulLifeYears <= 0 || usefulLifeYears > 100))
    ) {
      return NextResponse.json({ error: 'Provide an asset name, class, cost, a valid in-service date, and a useful life between 0 and 100 years.' }, { status: 400 });
    }
    const lifeForClass = assetClass === 'land' ? null : usefulLifeYears;
    const basis = String(body.basis || '').trim() || null;
    if (id) {
      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "RealEstateFixedAsset" SET "name"=$3, "assetClass"=$4, "cost"=$5, "inServiceDate"=$6::date, "usefulLifeYears"=$7, "basis"=$8, "updatedAt"=CURRENT_TIMESTAMP
         WHERE "id"=$1 AND "companyId"=$2`,
        id, companyId, name, assetClass, Math.round(cost * 100) / 100, inServiceDate, lifeForClass, basis,
      );
      if (!updated) return NextResponse.json({ error: 'Asset was not found for this company.' }, { status: 404 });
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateFixedAsset" ("id","companyId","name","assetClass","cost","inServiceDate","usefulLifeYears","basis","sortOrder","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,(SELECT COALESCE(MAX("sortOrder"),0)+1 FROM "RealEstateFixedAsset" WHERE "companyId"=$2),CURRENT_TIMESTAMP)`,
        randomUUID(), companyId, name, assetClass, Math.round(cost * 100) / 100, inServiceDate, lifeForClass, basis,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save the fixed asset', details: String(error?.message || error) }, { status: 500 });
  }
}
