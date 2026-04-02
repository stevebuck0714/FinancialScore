import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const summary = await prisma.$queryRaw<Array<{ cnt: number; min_date: Date | null; max_date: Date | null }>>`
    SELECT COUNT(*)::int AS cnt, MIN("transDate") AS min_date, MAX("transDate") AS max_date
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
  `;
  const byMonth = await prisma.$queryRaw<Array<{ month: string; cnt: number }>>`
    SELECT to_char(date_trunc('month', "transDate"), 'YYYY-MM') AS month, COUNT(*)::int AS cnt
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 24
  `;
  const programs = await prisma.$queryRaw<Array<{ program: string; cnt: number }>>`
    SELECT COALESCE("sourceProgram",'NULL') AS program, COUNT(*)::int AS cnt
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 10
  `;
  console.log(JSON.stringify({ companyId, summary, byMonth, programs }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

