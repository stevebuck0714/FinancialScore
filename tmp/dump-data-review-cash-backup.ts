import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const outDir = path.join(process.cwd(), 'exports');
  const outFile = path.join(outDir, `data-review-cash-backup-${month}.csv`);

  await fs.mkdir(outDir, { recursive: true });

  const monthlyRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      mf.id,
      mf."companyId",
      mf."financialRecordId",
      mf."monthDate",
      mf."createdAt",
      mf."cash",
      mf."totalAssets",
      mf."totalLiab",
      mf."totalEquity",
      fr."fileName" AS financial_record_file
    FROM "MonthlyFinancial" mf
    LEFT JOIN "FinancialRecord" fr ON fr.id = mf."financialRecordId"
    WHERE mf."companyId" = ${companyId}
      AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${month}
    ORDER BY mf."createdAt" DESC, mf.id DESC
  `;

  const latestId = monthlyRows.length ? String(monthlyRows[0].id ?? '') : '';
  const lines: string[] = [];
  lines.push(
    [
      'is_latest_row_used_by_data_review',
      'company_id',
      'month',
      'monthly_financial_id',
      'financial_record_id',
      'financial_record_file',
      'month_date',
      'created_at',
      'cash',
      'total_assets',
      'total_liab',
      'total_equity',
    ].join(',')
  );

  for (const row of monthlyRows) {
    const id = String(row.id ?? '');
    lines.push(
      [
        csvEscape(id === latestId ? 'Y' : 'N'),
        csvEscape(row.companyId ?? ''),
        csvEscape(month),
        csvEscape(id),
        csvEscape(row.financialRecordId ?? ''),
        csvEscape(row.financial_record_file ?? ''),
        csvEscape(row.monthDate ?? ''),
        csvEscape(row.createdAt ?? ''),
        csvEscape(row.cash ?? ''),
        csvEscape(row.totalAssets ?? ''),
        csvEscape(row.totalLiab ?? ''),
        csvEscape(row.totalEquity ?? ''),
      ].join(',')
    );
  }

  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        companyId,
        month,
        outFile,
        rows: monthlyRows.length,
        latestRowId: latestId,
        latestCash: monthlyRows[0]?.cash ?? null,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
