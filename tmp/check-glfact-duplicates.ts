import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';

  const summary = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH scoped AS (
      SELECT
        "companyId",
        "transDate",
        TRIM(COALESCE("accountId", '')) AS account_id,
        COALESCE("transNum", '') AS trans_num,
        COALESCE("ref", '') AS ref,
        COALESCE("description", '') AS description,
        "signedAmount"
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND to_char(date_trunc('month',"transDate"),'YYYY-MM') = ${month}
    ),
    grouped AS (
      SELECT
        "transDate",
        account_id,
        trans_num,
        ref,
        description,
        "signedAmount",
        COUNT(*)::int AS dup_count
      FROM scoped
      GROUP BY 1,2,3,4,5,6
    )
    SELECT
      (SELECT COUNT(*)::int FROM scoped) AS total_rows,
      (SELECT COUNT(*)::int FROM grouped) AS distinct_rows,
      (SELECT COALESCE(SUM(dup_count - 1),0)::int FROM grouped WHERE dup_count > 1) AS extra_duplicate_rows
  `;

  const examples = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH scoped AS (
      SELECT
        "transDate",
        TRIM(COALESCE("accountId", '')) AS account_id,
        COALESCE("transNum", '') AS trans_num,
        COALESCE("ref", '') AS ref,
        COALESCE("description", '') AS description,
        "signedAmount"
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND to_char(date_trunc('month',"transDate"),'YYYY-MM') = ${month}
    )
    SELECT
      "transDate",
      account_id,
      trans_num,
      ref,
      description,
      "signedAmount",
      COUNT(*)::int AS dup_count
    FROM scoped
    GROUP BY 1,2,3,4,5,6
    HAVING COUNT(*) > 1
    ORDER BY dup_count DESC, "transDate" DESC
    LIMIT 20
  `;

  console.log(JSON.stringify({ companyId, month, summary: summary[0] || null, examples }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
