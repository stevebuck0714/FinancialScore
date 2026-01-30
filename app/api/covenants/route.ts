import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const loanId = searchParams.get('loanId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('Covenants', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    let covenants: any[] = [];
    try {
      const rows = loanId
        ? await prisma.$queryRaw<Array<any>>`
            SELECT
              c."id" as "covenantId",
              c."covenantName",
              c."covenantType",
              c."threshold",
              c."currentValue",
              c."status",
              c."isApplicable",
              c."description",
              c."updatedAt",
              l."id" as "loanId",
              l."loanName",
              l."lenderName"
            FROM "Covenant" c
            JOIN "Loan" l ON l."id" = c."loanId"
            WHERE l."companyId" = ${companyId}
              AND l."id" = ${loanId}
          `
        : await prisma.$queryRaw<Array<any>>`
            SELECT
              c."id" as "covenantId",
              c."covenantName",
              c."covenantType",
              c."threshold",
              c."currentValue",
              c."status",
              c."isApplicable",
              c."description",
              c."updatedAt",
              l."id" as "loanId",
              l."loanName",
              l."lenderName"
            FROM "Covenant" c
            JOIN "Loan" l ON l."id" = c."loanId"
            WHERE l."companyId" = ${companyId}
          `;
      covenants = rows.map((row) => ({
        id: row.covenantId,
        covenantName: row.covenantName,
        covenantType: row.covenantType,
        threshold: row.threshold,
        currentValue: row.currentValue,
        status: row.status,
        isApplicable: row.isApplicable,
        description: row.description,
        updatedAt: row.updatedAt,
        loan: {
          id: row.loanId,
          loanName: row.loanName,
          lenderName: row.lenderName,
        },
      }));
    } catch (error) {
      console.warn('Covenants API: fallback query used', error);
      const rows = loanId
        ? await prisma.$queryRaw<Array<any>>`
            SELECT
              c."id" as "covenantId",
              c."covenantName",
              c."covenantType",
              c."threshold",
              NULL as "currentValue",
              c."alertLevel" as "status",
              c."applicable" as "isApplicable",
              c."notes" as "description",
              c."updatedAt",
              l."id" as "loanId",
              l."loanName",
              l."lenderName"
            FROM "Covenant" c
            JOIN "Loan" l ON l."id" = c."loanId"
            WHERE l."companyId" = ${companyId}
              AND l."id" = ${loanId}
          `
        : await prisma.$queryRaw<Array<any>>`
            SELECT
              c."id" as "covenantId",
              c."covenantName",
              c."covenantType",
              c."threshold",
              NULL as "currentValue",
              c."alertLevel" as "status",
              c."applicable" as "isApplicable",
              c."notes" as "description",
              c."updatedAt",
              l."id" as "loanId",
              l."loanName",
              l."lenderName"
            FROM "Covenant" c
            JOIN "Loan" l ON l."id" = c."loanId"
            WHERE l."companyId" = ${companyId}
          `;
      covenants = rows.map((row) => ({
        id: row.covenantId,
        covenantName: row.covenantName,
        covenantType: row.covenantType,
        threshold: row.threshold,
        currentValue: row.currentValue,
        status: row.status,
        isApplicable: row.isApplicable,
        description: row.description,
        updatedAt: row.updatedAt,
        loan: {
          id: row.loanId,
          loanName: row.loanName,
          lenderName: row.lenderName,
        },
      }));
    }

    return NextResponse.json({ covenants });
  } catch (error) {
    console.error('Covenants API error:', error);
    return NextResponse.json(
      { error: 'Failed to load covenants', details: String(error) },
      { status: 500 }
    );
  }
}
