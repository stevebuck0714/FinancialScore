import prisma from '../lib/prisma';

function normalizeTargetField(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const monthlyRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT *
    FROM "MonthlyFinancial" mf
    WHERE mf."companyId" = ${companyId}
      AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${month}
    ORDER BY mf."monthDate" DESC, mf."createdAt" DESC
    LIMIT 1
  `;
  const monthly = monthlyRows[0] || {};
  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      targetField: { notIn: ['', 'unmapped', 'UNMAPPED'] },
    },
    select: { qbAccount: true, qbAccountId: true, qbAccountCode: true, targetField: true },
  });
  const cashMappings = mappings.filter((m) => normalizeTargetField(m.targetField) === 'cash');
  console.log(
    JSON.stringify(
      {
        companyId,
        month,
        monthlyCash: (monthly as any).cash,
        cashMappingCount: cashMappings.length,
        cashMappings: cashMappings.slice(0, 20),
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
