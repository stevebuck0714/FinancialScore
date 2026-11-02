import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { getAllowedTargetFieldSet } from '@/lib/constants/sector-target-fields';
import { isNonrecurringRepairLine, suggestPropertyTargets } from '@/lib/real-estate/property-income-statement';
import { ensureRealEstateAccountMappingTable } from '@/lib/real-estate/account-mapping-table';

export const dynamic = 'force-dynamic';

async function authorize(companyId: string, action: string) {
  await requireAuth();
  if (await validateCompanyAccess(companyId)) return true;
  await auditForbiddenAccess('Company', companyId, action);
  return false;
}

const ensureTable = ensureRealEstateAccountMappingTable;

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
  const feed = String(request.nextUrl.searchParams.get('feed') || '').trim().toUpperCase();
  if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
  if (!(await authorize(companyId, 'REAL_ESTATE_ACCOUNT_MAPPINGS_READ'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureTable();
    const feeds = (await prisma.$queryRawUnsafe<Array<{ sourceEntity: string }>>(
      `SELECT DISTINCT "sourceEntity" FROM "RealEstateFinancialLine" WHERE "companyId"=$1 ORDER BY "sourceEntity"`,
      companyId,
    ).catch(() => [])).map((row) => row.sourceEntity);
    if (!feed) return NextResponse.json({ feeds, accounts: [] });
    if (!feeds.includes(feed)) return NextResponse.json({ error: 'Unknown financial feed for this company.' }, { status: 404 });
    const accounts = await prisma.$queryRawUnsafe<any[]>(
      `SELECT l."accountCode", MIN(l."accountName") AS "accountName", MIN(l."accountType") AS "accountType",
              MIN(l."reportType") AS "reportType", m."targetField", m."bookTreatment"
         FROM "RealEstateFinancialLine" l
         LEFT JOIN "RealEstateAccountMapping" m
           ON m."companyId"=l."companyId" AND m."financialFeed"=l."sourceEntity" AND m."accountCode"=l."accountCode"
        WHERE l."companyId"=$1 AND l."sourceEntity"=$2
        GROUP BY l."accountCode", m."targetField", m."bookTreatment"
        ORDER BY l."accountCode"`,
      companyId,
      feed,
    );
    const suggestions = suggestPropertyTargets(accounts);
    return NextResponse.json({
      feeds,
      accounts: accounts.map((account) => ({
        ...account,
        suggestedTargetField: suggestions.get(account.accountCode)?.targetField || null,
        suggestionConfidence: suggestions.get(account.accountCode)?.confidence || null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to load feed account mappings', details: String(error?.message || error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const companyId = String(body?.companyId || '').trim();
  const feed = String(body?.feed || '').trim().toUpperCase();
  const mappings = Array.isArray(body?.mappings) ? body.mappings : null;
  if (!companyId || !feed || !mappings) {
    return NextResponse.json({ error: 'companyId, feed, and mappings are required.' }, { status: 400 });
  }
  if (!(await authorize(companyId, 'REAL_ESTATE_ACCOUNT_MAPPINGS_WRITE'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureTable();
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { industrySectorCategory: true } });
    const allowed = getAllowedTargetFieldSet(company?.industrySectorCategory || null);
    allowed.add('ignored');
    const known = await prisma.$queryRawUnsafe<Array<{ accountCode: string }>>(
      `SELECT DISTINCT "accountCode" FROM "RealEstateFinancialLine" WHERE "companyId"=$1 AND "sourceEntity"=$2`,
      companyId,
      feed,
    );
    const knownCodes = new Set(known.map((row) => row.accountCode));
    const invalid = mappings
      .map((mapping: any) => String(mapping?.targetField || '').trim())
      .find((targetField: string) => targetField && targetField !== 'unmapped' && !allowed.has(targetField));
    if (invalid) {
      return NextResponse.json({ error: `"${invalid}" is not a valid mapping target for this sector.` }, { status: 400 });
    }
    let saved = 0;
    for (const mapping of mappings) {
      const accountCode = String(mapping?.accountCode || '').trim();
      const targetField = String(mapping?.targetField || '').trim();
      if (!knownCodes.has(accountCode)) continue;
      if (!targetField || targetField === 'unmapped') {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "RealEstateAccountMapping" WHERE "companyId"=$1 AND "financialFeed"=$2 AND "accountCode"=$3`,
          companyId, feed, accountCode,
        );
        continue;
      }
      const bookTreatment = isNonrecurringRepairLine(targetField)
        ? (mapping?.bookTreatment === 'capitalize' ? 'capitalize' : 'expense')
        : null;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RealEstateAccountMapping" ("id","companyId","financialFeed","accountCode","accountName","accountType","targetField","bookTreatment","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT ("companyId","financialFeed","accountCode")
         DO UPDATE SET "accountName"=EXCLUDED."accountName","accountType"=EXCLUDED."accountType","targetField"=EXCLUDED."targetField","bookTreatment"=EXCLUDED."bookTreatment","updatedAt"=NOW()`,
        randomUUID(), companyId, feed, accountCode,
        String(mapping?.accountName || '').trim(), String(mapping?.accountType || '').trim(), targetField, bookTreatment,
      );
      saved += 1;
    }
    return NextResponse.json({ ok: true, saved });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save feed account mappings', details: String(error?.message || error) }, { status: 500 });
  }
}
