import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const result = await prisma.$executeRawUnsafe(
    `
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY
              "companyId",
              "transDate",
              "accountId",
              COALESCE("transNum",''),
              COALESCE("ref",''),
              COALESCE("description",''),
              COALESCE("signedAmount",0),
              COALESCE("debitAmount",0),
              COALESCE("creditAmount",0)
            ORDER BY "createdAt" ASC, id ASC
          ) AS rn
        FROM "GLTransactionFact"
        WHERE "companyId" = $1
      )
      DELETE FROM "GLTransactionFact" g
      USING ranked r
      WHERE g.id = r.id
        AND r.rn > 1
    `,
    companyId
  );

  const summary = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*)::int AS remaining_rows
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
  `;

  console.log(JSON.stringify({ companyId, deletedRows: Number(result || 0), summary: summary[0] || null }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
