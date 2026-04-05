import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireSiteAdmin } from '@/lib/tenant-security';
import { getRequestedCompanyId } from '@/lib/infor-m3/route-guards';

export const dynamic = 'force-dynamic';

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const parsed = Math.floor(n);
  return parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireSiteAdmin();
    const companyId = getRequestedCompanyId(request);
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required.' }, { status: 400 });
    }

    const searchParams = request.nextUrl.searchParams;
    const fiscalYear = parsePositiveInt(searchParams.get('fiscalYear'));
    const fiscalPeriod = parsePositiveInt(searchParams.get('fiscalPeriod'));

    if (fiscalPeriod !== null && (fiscalPeriod < 1 || fiscalPeriod > 12)) {
      return NextResponse.json({ error: 'fiscalPeriod must be 1-12.' }, { status: 400 });
    }

    const rows = await prisma.$queryRaw<
      Array<{
        accountId: string;
        accountName: string | null;
        accountType: string | null;
        accountCategory: string | null;
        fiscalYear: number;
        fiscalPeriod: number;
        debit: number;
        credit: number;
        netBalance: number;
      }>
    >`
      WITH gl_base AS (
        SELECT
          TRIM(COALESCE(g."accountId", '')) AS "accountId",
          COALESCE(g."accountName", '') AS "accountName",
          COALESCE(g."accountType", '') AS "accountType",
          COALESCE(g."accountCategory", '') AS "accountCategory",
          EXTRACT(YEAR FROM g."transDate")::int AS "fiscalYear",
          EXTRACT(MONTH FROM g."transDate")::int AS "fiscalPeriod",
          COALESCE(g."debitAmount", 0)::double precision AS "debitAmount",
          COALESCE(g."creditAmount", 0)::double precision AS "creditAmount",
          COALESCE(g."signedAmount", 0)::double precision AS "signedAmount",
          g."transDate"
        FROM "GLTransactionFact" g
        WHERE g."companyId" = ${companyId}
      ),
      normalized AS (
        SELECT
          "accountId",
          NULLIF(MAX(NULLIF(TRIM("accountName"), '')), '') AS "accountName",
          NULLIF(MAX(NULLIF(TRIM("accountType"), '')), '') AS "accountType",
          NULLIF(MAX(NULLIF(TRIM("accountCategory"), '')), '') AS "accountCategory",
          "fiscalYear",
          "fiscalPeriod",
          SUM(
            CASE
              WHEN "debitAmount" <> 0 OR "creditAmount" <> 0 THEN "debitAmount"
              WHEN "signedAmount" > 0 THEN "signedAmount"
              ELSE 0
            END
          )::double precision AS debit,
          SUM(
            CASE
              WHEN "debitAmount" <> 0 OR "creditAmount" <> 0 THEN "creditAmount"
              WHEN "signedAmount" < 0 THEN ABS("signedAmount")
              ELSE 0
            END
          )::double precision AS credit,
          SUM("signedAmount")::double precision AS "netBalance"
        FROM gl_base
        WHERE "accountId" <> ''
          ${fiscalYear !== null ? Prisma.sql`AND "fiscalYear" = ${fiscalYear}` : Prisma.empty}
          ${fiscalPeriod !== null ? Prisma.sql`AND "fiscalPeriod" = ${fiscalPeriod}` : Prisma.empty}
        GROUP BY "accountId", "fiscalYear", "fiscalPeriod"
      )
      SELECT
        "accountId",
        "accountName",
        "accountType",
        "accountCategory",
        "fiscalYear",
        "fiscalPeriod",
        debit,
        credit,
        "netBalance"
      FROM normalized
      ORDER BY "fiscalYear" DESC, "fiscalPeriod" DESC, "accountId" ASC
    `;

    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += Number(row.debit || 0);
        acc.credit += Number(row.credit || 0);
        acc.netBalance += Number(row.netBalance || 0);
        return acc;
      },
      { debit: 0, credit: 0, netBalance: 0 }
    );

    return NextResponse.json({
      ok: true,
      companyId,
      filters: {
        fiscalYear,
        fiscalPeriod,
      },
      summary: {
        rowCount: rows.length,
        debit: totals.debit,
        credit: totals.credit,
        netBalance: totals.netBalance,
      },
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to build trial balance from GL transactions',
        details: message,
      },
      { status }
    );
  }
}

