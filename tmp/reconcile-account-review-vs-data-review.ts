import prisma from '../lib/prisma';

type Row = Record<string, unknown>;

const BS_TARGETS = new Set([
  'cash',
  'ar',
  'inventory',
  'otherCA',
  'fixedAssets',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'otherCL',
  'tcl',
  'ltd',
  'totalLiab',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
  'totalLAndE',
]);

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const monthEnd = `${month}-31`;

  const mapped = await prisma.$queryRaw<Array<Row>>`
    WITH mappings AS (
      SELECT
        TRIM(COALESCE("qbAccountId","qbAccountCode")) AS account_id,
        LOWER(TRIM(COALESCE("targetField",''))) AS target_field
      FROM "AccountMapping"
      WHERE "companyId" = ${companyId}
        AND COALESCE("targetField",'') <> ''
        AND COALESCE("targetField",'') NOT IN ('unmapped','UNMAPPED')
        AND TRIM(COALESCE("qbAccountId","qbAccountCode",'')) <> ''
    ),
    gl AS (
      SELECT
        TRIM("accountId") AS account_id,
        SUM("signedAmount")::double precision AS balance
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "transDate" <= (${monthEnd}::date + INTERVAL '1 day' - INTERVAL '1 millisecond')
      GROUP BY 1
    )
    SELECT
      m.target_field,
      SUM(COALESCE(g.balance,0))::double precision AS account_review_value
    FROM mappings m
    LEFT JOIN gl g ON g.account_id = m.account_id
    GROUP BY 1
    ORDER BY 1
  `;

  const latestMonthly = await prisma.$queryRaw<Array<Row>>`
    SELECT mf.*
    FROM "MonthlyFinancial" mf
    INNER JOIN (
      SELECT "monthDate", MAX("createdAt") AS max_created
      FROM "MonthlyFinancial"
      WHERE "companyId" = ${companyId}
        AND to_char(date_trunc('month',"monthDate"),'YYYY-MM') = ${month}
      GROUP BY "monthDate"
    ) z
      ON z."monthDate" = mf."monthDate"
     AND z.max_created = mf."createdAt"
    WHERE mf."companyId" = ${companyId}
      AND to_char(date_trunc('month',mf."monthDate"),'YYYY-MM') = ${month}
    ORDER BY mf."createdAt" DESC
    LIMIT 1
  `;

  const mf = latestMonthly[0] || {};
  const deltas = mapped
    .map((r) => {
      const tf = String(r.target_field || '').trim();
      if (!BS_TARGETS.has(tf)) return null;
      const arVal = toNum(r.account_review_value);
      const drVal = toNum((mf as any)[tf]);
      return {
        targetField: tf,
        accountReview: arVal,
        dataReview: drVal,
        delta: arVal - drVal,
      };
    })
    .filter((x): x is { targetField: string; accountReview: number; dataReview: number; delta: number } => !!x)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log(
    JSON.stringify(
      {
        companyId,
        month,
        monthlyRowId: (mf as any).id || null,
        monthlyCreatedAt: (mf as any).createdAt || null,
        topDeltas: deltas.slice(0, 20),
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
