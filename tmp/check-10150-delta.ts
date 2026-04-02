import prisma from '../lib/prisma';

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';
  const acct = '10150';
  const site = 'LYN';
  const d0227 = new Date(Date.UTC(2026, 1, 27, 23, 59, 59, 999));
  const d0331 = new Date(Date.UTC(2026, 2, 31, 23, 59, 59, 999));
  const rows = await prisma.$queryRaw<Array<{ bal_0227: number; bal_0331: number; move_0228_0331: number }>>`
    SELECT
      SUM(CASE WHEN "transDate" <= ${d0227} THEN "signedAmount" ELSE 0 END)::double precision AS bal_0227,
      SUM(CASE WHEN "transDate" <= ${d0331} THEN "signedAmount" ELSE 0 END)::double precision AS bal_0331,
      SUM(CASE WHEN "transDate" > ${d0227} AND "transDate" <= ${d0331} THEN "signedAmount" ELSE 0 END)::double precision AS move_0228_0331
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND TRIM("accountId") = ${acct}
      AND COALESCE(site, '') = ${site}
  `;
  console.log(JSON.stringify(rows[0], null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
