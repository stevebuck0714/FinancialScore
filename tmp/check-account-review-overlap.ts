import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';

  const rows = await prisma.$queryRaw<
    Array<{
      mapped_count: number;
      gl_count: number;
      overlap_exact: number;
      overlap_normalized: number;
    }>
  >`
    WITH mapped AS (
      SELECT DISTINCT TRIM(COALESCE("qbAccountId", "qbAccountCode", '')) AS acct
      FROM "AccountMapping"
      WHERE "companyId" = ${companyId}
        AND COALESCE("targetField",'') NOT IN ('', 'unmapped', 'UNMAPPED')
    ),
    gl AS (
      SELECT DISTINCT TRIM(COALESCE("accountId", '')) AS acct
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND to_char(date_trunc('month', "transDate"), 'YYYY-MM') = ${month}
    ),
    mapped_norm AS (
      SELECT DISTINCT regexp_replace(lower(acct), '[^a-z0-9]', '', 'g') AS acct
      FROM mapped
      WHERE acct <> ''
    ),
    gl_norm AS (
      SELECT DISTINCT regexp_replace(lower(acct), '[^a-z0-9]', '', 'g') AS acct
      FROM gl
      WHERE acct <> ''
    )
    SELECT
      (SELECT COUNT(*)::int FROM mapped WHERE acct <> '') AS mapped_count,
      (SELECT COUNT(*)::int FROM gl WHERE acct <> '') AS gl_count,
      (
        SELECT COUNT(*)::int
        FROM mapped m
        INNER JOIN gl g ON g.acct = m.acct
      ) AS overlap_exact,
      (
        SELECT COUNT(*)::int
        FROM mapped_norm m
        INNER JOIN gl_norm g ON g.acct = m.acct
      ) AS overlap_normalized
  `;

  const examples = await prisma.$queryRaw<
    Array<{ mapped_acct: string; has_exact: boolean; has_norm: boolean }>
  >`
    WITH mapped AS (
      SELECT DISTINCT TRIM(COALESCE("qbAccountId", "qbAccountCode", '')) AS acct
      FROM "AccountMapping"
      WHERE "companyId" = ${companyId}
        AND COALESCE("targetField",'') NOT IN ('', 'unmapped', 'UNMAPPED')
        AND TRIM(COALESCE("qbAccountId", "qbAccountCode", '')) <> ''
      LIMIT 25
    ),
    gl AS (
      SELECT DISTINCT TRIM(COALESCE("accountId", '')) AS acct
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND to_char(date_trunc('month', "transDate"), 'YYYY-MM') = ${month}
    )
    SELECT
      m.acct AS mapped_acct,
      EXISTS (SELECT 1 FROM gl g WHERE g.acct = m.acct) AS has_exact,
      EXISTS (
        SELECT 1
        FROM gl g
        WHERE regexp_replace(lower(g.acct), '[^a-z0-9]', '', 'g') =
              regexp_replace(lower(m.acct), '[^a-z0-9]', '', 'g')
      ) AS has_norm
    FROM mapped m
    ORDER BY m.acct
  `;

  console.log(JSON.stringify({ companyId, month, summary: rows[0], examples }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
