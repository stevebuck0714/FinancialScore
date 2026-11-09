import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ensureRealEstateCashFlowLineTable } from '@/lib/real-estate/cash-flow-line-table';
import { publishConsolidatedFinancials } from '@/lib/real-estate/consolidated-financials';
import { isConsolidatedReportingCompany } from '@/lib/real-estate/consolidated-reporting-companies';
import {
  monthEndDate, periodFromReport, slnActivityLines, slnBalanceLines, slnCashFlowLines, slnLegalEntity, statementKind,
  type SlnStatementKind,
} from '@/lib/real-estate/sln-statement-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type Statement = { kind: SlnStatementKind; fileName: string; sheet: string; rows: unknown[][] };

function isUploadBlob(value: FormDataEntryValue): value is File {
  return typeof File !== 'undefined' && value instanceof File && typeof value.arrayBuffer === 'function';
}

/**
 * Replaces one month of SLN data from the property manager's monthly workbooks:
 * the Income Statement (actuals, budget, and its Cash Flow Summary) and/or the Balance Sheet.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const companyId = String(form.get('companyId') || '').trim();
    const month = String(form.get('month') || '').trim();
    if (!companyId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: 'Choose the month these statements are for.' }, { status: 400 });
    }
    await requireAuth();
    if (!(await validateCompanyAccess(companyId))) {
      await auditForbiddenAccess('Company', companyId, 'OPERATIONS_REAL_ESTATE_WRITE');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const [existing] = await prisma.$queryRawUnsafe<Array<{ found: number }>>(
      `SELECT COUNT(*)::int AS found FROM "RealEstateFinancialLine" WHERE "companyId"=$1 AND "sourceEntity"='SLN'`,
      companyId,
    ).catch(() => [{ found: 0 }]);
    if (!existing?.found) {
      return NextResponse.json({ error: 'This company does not report SLN financials.' }, { status: 400 });
    }

    const files = form.getAll('files').filter(isUploadBlob);
    if (!files.length) return NextResponse.json({ error: 'Choose the SLN Income Statement and/or Balance Sheet workbook.' }, { status: 400 });
    if (files.some((file) => file.size > MAX_UPLOAD_BYTES)) return NextResponse.json({ error: 'Each workbook must be 20 MB or smaller.' }, { status: 400 });

    const periodEnd = monthEndDate(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    const statements: Statement[] = [];
    for (const file of files) {
      const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
      const found = workbook.SheetNames.flatMap((sheet) => {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: null, raw: true });
        const kind = statementKind(file.name, rows);
        return kind ? [{ kind, fileName: file.name, sheet, rows }] : [];
      });
      if (!found.length) {
        return NextResponse.json({ error: `${file.name} is not an SLN Income Statement with Budget Comparison or Balance Sheet.` }, { status: 400 });
      }
      for (const statement of found) {
        const reportPeriod = periodFromReport(statement.rows);
        if (reportPeriod && reportPeriod.slice(0, 7) !== month) {
          return NextResponse.json({ error: `${file.name} is for ${reportPeriod.slice(0, 7)}, not ${month}.` }, { status: 400 });
        }
      }
      statements.push(...found);
    }
    const incomeStatements = statements.filter((statement) => statement.kind === 'ACTIVITY');
    const balanceSheets = statements.filter((statement) => statement.kind === 'BALANCE');
    if (incomeStatements.length > 1 || balanceSheets.length > 1) {
      return NextResponse.json({ error: 'Upload one Income Statement and one Balance Sheet at most.' }, { status: 400 });
    }

    const income = incomeStatements[0];
    const balance = balanceSheets[0];
    const activity = income ? slnActivityLines(income.rows) : [];
    const cashFlow = income ? slnCashFlowLines(income.rows) : [];
    const balances = balance ? slnBalanceLines(balance.rows) : [];
    if (income && !activity.length) return NextResponse.json({ error: `No account lines were found in ${income.fileName}.` }, { status: 400 });
    if (balance && !balances.length) return NextResponse.json({ error: `No account lines were found in ${balance.fileName}.` }, { status: 400 });

    await ensureRealEstateCashFlowLineTable();
    const insertLine = (tx: typeof prisma, statement: Statement, reportType: string, line: { accountCode: string; accountName: string; accountType: string; row: number }, amount: number) =>
      tx.$executeRawUnsafe(
        `INSERT INTO "RealEstateFinancialLine"
          ("id","companyId","sourceEntity","legalEntity","reportType","periodEnd","accountCode","accountName","accountType","amount","sourceFileName","sourceSheetName","sourceRowNumber","updatedAt")
         VALUES ($1,$2,'SLN',$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,NOW())`,
        randomUUID(), companyId, slnLegalEntity(line.accountName), reportType, periodEnd, line.accountCode, line.accountName,
        line.accountType, amount, statement.fileName, statement.sheet, line.row,
      );

    await prisma.$transaction(async (tx) => {
      const db = tx as unknown as typeof prisma;
      if (income) {
        await db.$executeRawUnsafe(
          `DELETE FROM "RealEstateFinancialLine" WHERE "companyId"=$1 AND "sourceEntity"='SLN' AND "periodEnd"=$2::date
             AND "reportType" IN ('ACTIVITY','ACTIVITY_BUDGET') AND "accountCode" LIKE 'sln\\_%'`,
          companyId, periodEnd,
        );
        await db.$executeRawUnsafe(`DELETE FROM "RealEstateCashFlowLine" WHERE "companyId"=$1 AND "sourceEntity"='SLN' AND "periodEnd"=$2::date`, companyId, periodEnd);
        for (const line of activity) {
          await insertLine(db, income, 'ACTIVITY', line, line.actual);
          if (line.budget !== null) await insertLine(db, income, 'ACTIVITY_BUDGET', line, line.budget);
        }
        for (const line of cashFlow) {
          await db.$executeRawUnsafe(
            `INSERT INTO "RealEstateCashFlowLine"
              ("id","companyId","sourceEntity","periodEnd","lineKey","lineName","lineOrder","amount","budgetAmount","sourceFileName","sourceSheetName","sourceRowNumber","updatedAt")
             VALUES ($1,$2,'SLN',$3::date,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
            randomUUID(), companyId, periodEnd, line.lineKey, line.lineName, line.lineOrder, line.actual, line.budget,
            income.fileName, income.sheet, line.row,
          );
        }
      }
      if (balance) {
        await db.$executeRawUnsafe(
          `DELETE FROM "RealEstateFinancialLine" WHERE "companyId"=$1 AND "sourceEntity"='SLN' AND "periodEnd"=$2::date
             AND "reportType"='BALANCE' AND "accountCode" LIKE 'sln\\_%'`,
          companyId, periodEnd,
        );
        for (const line of balances) await insertLine(db, balance, 'BALANCE', line, line.amount);
      }
    }, { maxWait: 20_000, timeout: 120_000 });

    const published = isConsolidatedReportingCompany(companyId)
      ? await publishConsolidatedFinancials(companyId, 'sln-statement-upload')
      : null;
    return NextResponse.json({
      ok: true,
      periodEnd,
      incomeStatementLines: activity.length,
      cashFlowLines: cashFlow.length,
      balanceSheetLines: balances.length,
      published: published ? published.ok : null,
      publishError: published && !published.ok && 'error' in published ? published.error : null,
    });
  } catch (error: unknown) {
    console.error('SLN statement upload failed', error);
    const message = error instanceof Error ? error.message : String(error);
    const status = /unauthorized|forbidden/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: 'Failed to load the SLN statements.', details: message }, { status });
  }
}
