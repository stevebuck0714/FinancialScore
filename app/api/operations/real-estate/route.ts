import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ensureRealEstateAccountMappingTable } from '@/lib/real-estate/account-mapping-table';
import { ensureRealEstateWaterfallTables } from '@/lib/real-estate/waterfall-tables';
import { normalizeName } from '@/lib/real-estate/cash-flow-report';
import { ensureRealEstateTaxReconciliationTables } from '@/lib/real-estate/tax-reconciliation-tables';

export const dynamic = 'force-dynamic';

async function authorize(companyId: string, action: string) {
  await requireAuth();
  if (await validateCompanyAccess(companyId)) return true;
  await auditForbiddenAccess('Company', companyId, action);
  return false;
}

async function ensureTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateFinancialLine" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "sourceEntity" TEXT NOT NULL, "legalEntity" TEXT, "reportType" TEXT NOT NULL, "periodEnd" DATE NOT NULL,
      "accountCode" TEXT NOT NULL, "accountName" TEXT NOT NULL, "accountType" TEXT NOT NULL,
      "canonicalAccountCode" TEXT, "amount" NUMERIC(18,2) NOT NULL, "sourceFileName" TEXT,
      "sourceSheetName" TEXT, "sourceRowNumber" INTEGER, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","sourceEntity","reportType","periodEnd","accountCode")
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RealEstateFinancialLine"
    ADD COLUMN IF NOT EXISTS "legalEntity" TEXT
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateInvestor" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "legalName" TEXT NOT NULL, "memberGroup" TEXT, "ownershipPercentage" NUMERIC(9,6),
      "preferredReturnRate" NUMERIC(9,6), "active" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("companyId","legalName")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateInvestorLedgerEntry" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "investorId" TEXT NOT NULL, "entryType" TEXT NOT NULL, "effectiveDate" DATE NOT NULL,
      "amount" NUMERIC(18,2) NOT NULL, "reference" TEXT, "notes" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateOccupancySnapshot" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "periodEnd" DATE NOT NULL, "totalUnits" INTEGER NOT NULL, "occupiedUnits" INTEGER NOT NULL,
      "physicalOccupancyPct" NUMERIC(7,4) NOT NULL, "economicOccupancyPct" NUMERIC(7,4),
      "sourceReference" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE ("companyId","periodEnd")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateCashActivity" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "periodEnd" DATE NOT NULL, "activityDate" DATE, "activityType" TEXT NOT NULL,
      "counterparty" TEXT, "description" TEXT, "amount" NUMERIC(18,2) NOT NULL,
      "sourceReference" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE ("companyId","sourceReference")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "RealEstateOperationalMetric" (
      "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, "companyId" TEXT NOT NULL,
      "periodEnd" DATE NOT NULL, "metric" TEXT NOT NULL, "value" NUMERIC(18,4) NOT NULL,
      "unit" TEXT, "sourceReference" TEXT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE ("companyId","periodEnd","metric")
    )
  `);
}

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
  if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
  if (!(await authorize(companyId, 'OPERATIONS_REAL_ESTATE_READ'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureTables();
    await ensureRealEstateWaterfallTables();
    await ensureRealEstateTaxReconciliationTables();
    const [lines, investors, occupancy, cashActivities, operationalMetrics, mappings, settingsRows, aliases, taxReturns, taxDepreciationRecords] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "RealEstateFinancialLine" WHERE "companyId"=$1 ORDER BY "periodEnd", "accountCode"`, companyId),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT i.*, COALESCE(jsonb_agg(jsonb_build_object('entryType',e."entryType",'amount',e."amount",'effectiveDate',e."effectiveDate") ORDER BY e."effectiveDate") FILTER (WHERE e.id IS NOT NULL), '[]') AS entries
        FROM "RealEstateInvestor" i LEFT JOIN "RealEstateInvestorLedgerEntry" e ON e."investorId"=i.id
        WHERE i."companyId"=$1 GROUP BY i.id ORDER BY i."legalName"`, companyId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "RealEstateOccupancySnapshot" WHERE "companyId"=$1 ORDER BY "periodEnd"`, companyId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "RealEstateCashActivity" WHERE "companyId"=$1 ORDER BY "periodEnd", "activityDate", "counterparty"`, companyId),
      prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "RealEstateOperationalMetric" WHERE "companyId"=$1 ORDER BY "periodEnd", "metric"`, companyId),
      ensureRealEstateAccountMappingTable().then(() => prisma.$queryRawUnsafe<any[]>(
        `SELECT "financialFeed", "accountCode", "targetField", "bookTreatment" FROM "RealEstateAccountMapping" WHERE "companyId"=$1`,
        companyId,
      )),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT to_char("stabilizationDate", 'YYYY-MM-DD') AS "stabilizationDate", "preferredReturnRate"::float AS "preferredReturnRate" FROM "RealEstateWaterfallSettings" WHERE "companyId"=$1`,
        companyId,
      ),
      prisma.$queryRawUnsafe<any[]>(`SELECT "alias", "investorId" FROM "RealEstateInvestorAlias" WHERE "companyId"=$1`, companyId),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "taxYear", "filingStatus", "sourceDocument", "sourceReference", "coverageStatus", "notes"
         FROM "RealEstateTaxReturn" WHERE "companyId"=$1 ORDER BY "taxYear"`,
        companyId,
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT "taxYear", "assetReference", "taxTreatment", "taxBasis"::float AS "taxBasis",
          to_char("placedInServiceDate", 'YYYY-MM-DD') AS "placedInServiceDate",
          "recoveryPeriodYears"::float AS "recoveryPeriodYears", "convention", "method",
          "deduction"::float AS "deduction", "sourceReference", "confidence", "matchStatus", "notes"
         FROM "RealEstateTaxDepreciationRecord" WHERE "companyId"=$1 ORDER BY "taxYear", "assetReference"`,
        companyId,
      ),
    ]);
    const waterfallSettings = settingsRows[0] || { stabilizationDate: null, preferredReturnRate: 6 };
    // QuickBooks Desktop lines are BGAH's books. They replace the BGAH workbook
    // only once the QBD feed is mapped; until then they stay separate so the
    // two BGAH sources are never added together.
    const quickBooksLines = lines.filter((line) => line.sourceEntity === 'QBD');
    const quickBooksMappings = mappings.filter((mapping) => mapping.financialFeed === 'QBD');
    const bgahFromQuickBooks = quickBooksLines.length > 0 && quickBooksMappings.length > 0;
    const reportLines = bgahFromQuickBooks
      ? [
          ...lines.filter((line) => line.sourceEntity !== 'QBD' && line.sourceEntity !== 'BGAH'),
          ...quickBooksLines.map((line) => ({ ...line, sourceEntity: 'BGAH', fromQuickBooks: true })),
        ]
      : lines.filter((line) => line.sourceEntity !== 'QBD');
    const reportMappings = bgahFromQuickBooks
      ? [
          ...mappings.filter((mapping) => mapping.financialFeed !== 'QBD' && mapping.financialFeed !== 'BGAH'),
          ...quickBooksMappings.map((mapping) => ({ ...mapping, financialFeed: 'BGAH' })),
        ]
      : mappings.filter((mapping) => mapping.financialFeed !== 'QBD');
    return NextResponse.json({
      lines: reportLines, quickBooksLines, quickBooksMappings, bgahSource: bgahFromQuickBooks ? 'QUICKBOOKS' : 'WORKBOOK',
      investors, occupancy, cashActivities, operationalMetrics, mappings: reportMappings, waterfallSettings, aliases,
      taxReturns, taxDepreciationRecords,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to load real-estate operations', details: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const companyId = String(body?.companyId || '').trim();
  const kind = String(body?.kind || '').trim();
  if (!companyId || !['occupancy', 'investor', 'ledger-entry', 'waterfall-settings', 'distribution-batch'].includes(kind)) {
    return NextResponse.json({ error: 'Company ID and a supported record type are required.' }, { status: 400 });
  }
  if (!(await authorize(companyId, 'OPERATIONS_REAL_ESTATE_WRITE'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureTables();
    if (kind === 'waterfall-settings') {
      await ensureRealEstateWaterfallTables();
      const stabilizationDate = body.stabilizationDate ? String(body.stabilizationDate) : null;
      const preferredReturnRate = Number(body.preferredReturnRate);
      if ((stabilizationDate && !/^\d{4}-\d{2}-\d{2}$/.test(stabilizationDate)) || !Number.isFinite(preferredReturnRate) || preferredReturnRate < 0 || preferredReturnRate > 100) {
        return NextResponse.json({ error: 'Provide a valid Stabilization Date and preferred return rate.' }, { status: 400 });
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateWaterfallSettings" ("companyId","stabilizationDate","preferredReturnRate","updatedAt")
         VALUES ($1,$2::date,$3,NOW())
         ON CONFLICT ("companyId") DO UPDATE SET "stabilizationDate"=EXCLUDED."stabilizationDate","preferredReturnRate"=EXCLUDED."preferredReturnRate","updatedAt"=NOW()`,
        companyId, stabilizationDate, preferredReturnRate,
      );
      return NextResponse.json({ ok: true });
    }
    if (kind === 'distribution-batch') {
      await ensureRealEstateWaterfallTables();
      const effectiveDate = String(body.effectiveDate || '');
      const reference = String(body.reference || '').trim() || null;
      const lines: Array<{ investorId: string; amount: number; payee: string }> = Array.isArray(body.lines)
        ? body.lines.map((line: any) => ({ investorId: String(line?.investorId || '').trim(), amount: Number(line?.amount), payee: String(line?.payee || '').trim() }))
        : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !lines.length || lines.some((line) => !line.investorId || !Number.isFinite(line.amount) || line.amount <= 0)) {
        return NextResponse.json({ error: 'Provide a distribution date and a member and positive amount for every line.' }, { status: 400 });
      }
      const investorRows = await prisma.$queryRawUnsafe<Array<{ id: string; legalName: string }>>(
        'SELECT "id", "legalName" FROM "RealEstateInvestor" WHERE "companyId"=$1',
        companyId,
      );
      const known = new Map(investorRows.map((row) => [row.id, row.legalName]));
      if (lines.some((line) => !known.has(line.investorId))) {
        return NextResponse.json({ error: 'Every line must be matched to a member of this company.' }, { status: 400 });
      }
      const existing = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM "RealEstateInvestorLedgerEntry" WHERE "companyId"=$1 AND "entryType"='DISTRIBUTION' AND "effectiveDate"=$2::date`,
        companyId, effectiveDate,
      );
      if (existing[0]?.count && !body.replaceExisting) {
        return NextResponse.json({ error: `Distributions are already recorded for ${effectiveDate}.`, existingCount: existing[0].count }, { status: 409 });
      }
      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `DELETE FROM "RealEstateInvestorLedgerEntry" WHERE "companyId"=$1 AND "entryType"='DISTRIBUTION' AND "effectiveDate"=$2::date`,
          companyId, effectiveDate,
        ),
        ...lines.map((line) => prisma.$executeRawUnsafe(
          `INSERT INTO "RealEstateInvestorLedgerEntry" ("id","companyId","investorId","entryType","effectiveDate","amount","reference","notes","updatedAt")
           VALUES ($1,$2,$3,'DISTRIBUTION',$4::date,$5,$6,$7,NOW())`,
          randomUUID(), companyId, line.investorId, effectiveDate, Math.round(line.amount * 100) / 100, reference,
          line.payee && line.payee !== known.get(line.investorId) ? `Cash flow report payee: ${line.payee}` : null,
        )),
        ...lines
          .filter((line) => line.payee && normalizeName(line.payee) !== normalizeName(known.get(line.investorId) || ''))
          .map((line) => prisma.$executeRawUnsafe(
            `INSERT INTO "RealEstateInvestorAlias" ("id","companyId","investorId","alias","updatedAt") VALUES ($1,$2,$3,$4,NOW())
             ON CONFLICT ("companyId","alias") DO UPDATE SET "investorId"=EXCLUDED."investorId","updatedAt"=NOW()`,
            randomUUID(), companyId, line.investorId, line.payee,
          )),
      ]);
      return NextResponse.json({ ok: true, recorded: lines.length });
    }
    if (kind === 'occupancy') {
      const periodEnd = String(body.periodEnd || '');
      const totalUnits = Number(body.totalUnits);
      const occupiedUnits = Number(body.occupiedUnits);
      const economicOccupancyPct = body.economicOccupancyPct == null ? null : Number(body.economicOccupancyPct);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !Number.isInteger(totalUnits) || totalUnits < 1 || !Number.isInteger(occupiedUnits) || occupiedUnits < 0 || occupiedUnits > totalUnits || (economicOccupancyPct != null && (!Number.isFinite(economicOccupancyPct) || economicOccupancyPct < 0 || economicOccupancyPct > 100))) {
        return NextResponse.json({ error: 'Provide a valid monthly occupancy snapshot.' }, { status: 400 });
      }
      const physicalOccupancyPct = (occupiedUnits / totalUnits) * 100;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateOccupancySnapshot" ("id","companyId","periodEnd","totalUnits","occupiedUnits","physicalOccupancyPct","economicOccupancyPct","sourceReference","updatedAt")
         VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT ("companyId","periodEnd") DO UPDATE SET "totalUnits"=EXCLUDED."totalUnits","occupiedUnits"=EXCLUDED."occupiedUnits","physicalOccupancyPct"=EXCLUDED."physicalOccupancyPct","economicOccupancyPct"=EXCLUDED."economicOccupancyPct","sourceReference"=EXCLUDED."sourceReference","updatedAt"=NOW()`,
        randomUUID(), companyId, periodEnd, totalUnits, occupiedUnits, physicalOccupancyPct, economicOccupancyPct, String(body.sourceReference || '').trim() || null,
      );
    } else if (kind === 'investor') {
      const legalName = String(body.legalName || '').trim();
      if (!legalName) return NextResponse.json({ error: 'Investor legal name is required.' }, { status: 400 });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateInvestor" ("id","companyId","legalName","memberGroup","ownershipPercentage","preferredReturnRate","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT ("companyId","legalName") DO UPDATE SET "memberGroup"=EXCLUDED."memberGroup","ownershipPercentage"=EXCLUDED."ownershipPercentage","preferredReturnRate"=EXCLUDED."preferredReturnRate","updatedAt"=NOW()`,
        randomUUID(), companyId, legalName, String(body.memberGroup || '').trim() || null,
        body.ownershipPercentage == null ? null : Number(body.ownershipPercentage),
        body.preferredReturnRate == null ? null : Number(body.preferredReturnRate),
      );
    } else {
      const investorId = String(body.investorId || '').trim();
      const effectiveDate = String(body.effectiveDate || '');
      const entryType = String(body.entryType || '').trim();
      const amount = Number(body.amount);
      if (!investorId || !entryType || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || !Number.isFinite(amount)) {
        return NextResponse.json({ error: 'Investor, date, entry type, and amount are required.' }, { status: 400 });
      }
      const investor = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "RealEstateInvestor" WHERE "id"=$1 AND "companyId"=$2',
        investorId,
        companyId,
      );
      if (!investor.length) return NextResponse.json({ error: 'Investor was not found for this company.' }, { status: 404 });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateInvestorLedgerEntry" ("id","companyId","investorId","entryType","effectiveDate","amount","reference","notes","updatedAt")
         VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,NOW())`,
        randomUUID(), companyId, investorId, entryType, effectiveDate, amount,
        String(body.reference || '').trim() || null, String(body.notes || '').trim() || null,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save real-estate operations data', details: String(error?.message || error) }, { status: 500 });
  }
}
