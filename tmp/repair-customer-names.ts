import prisma from '@/lib/prisma';

const PLACEHOLDER_REGEX = "^(unknown customer( [0-9]+)?|customer [0-9]+)$";

const CANONICAL_CTE = `
WITH canonical AS (
  SELECT
    base.company_id,
    base.customer_id,
    MIN(base.customer_name) AS customer_name
  FROM (
    SELECT "companyId" AS company_id, "customerId" AS customer_id, "customerName" AS customer_name FROM "AROpenInvoiceSnapshot"
    UNION ALL
    SELECT "companyId" AS company_id, "customerId" AS customer_id, "customerName" AS customer_name FROM "ARPaymentFact"
    UNION ALL
    SELECT "companyId" AS company_id, "customerId" AS customer_id, "customerName" AS customer_name FROM "ARInvoiceDetail"
    UNION ALL
    SELECT "companyId" AS company_id, "customerId" AS customer_id, "customerName" AS customer_name FROM "CustomerContractStatus"
    UNION ALL
    SELECT "companyId" AS company_id, "customerId" AS customer_id, "customerName" AS customer_name FROM "CustomerOrderLineSnapshot"
  ) base
  WHERE
    base.customer_id IS NOT NULL
    AND BTRIM(base.customer_id) <> ''
    AND base.customer_name IS NOT NULL
    AND BTRIM(base.customer_name) <> ''
    AND LOWER(BTRIM(base.customer_name)) !~ '${PLACEHOLDER_REGEX}'
  GROUP BY base.company_id, base.customer_id
)
`;

async function updateTable(tableName: string): Promise<number> {
  const sql = `
${CANONICAL_CTE}
UPDATE "${tableName}" t
SET "customerName" = c.customer_name
FROM canonical c
WHERE
  t."companyId" = c.company_id
  AND t."customerId" = c.customer_id
  AND (
    t."customerName" IS NULL
    OR BTRIM(t."customerName") = ''
    OR LOWER(BTRIM(t."customerName")) ~ '${PLACEHOLDER_REGEX}'
  );
`;
  return prisma.$executeRawUnsafe(sql);
}

async function main(): Promise<void> {
  const tables = [
    'AROpenInvoiceSnapshot',
    'ARPaymentFact',
    'ARInvoiceDetail',
    'CustomerContractStatus',
    'CustomerOrderLineSnapshot',
  ];

  let totalUpdated = 0;
  for (const tableName of tables) {
    const count = await updateTable(tableName);
    totalUpdated += count;
    console.log(JSON.stringify({ tableName, updatedRows: count }));
  }

  console.log(JSON.stringify({ event: 'complete', totalUpdated }));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: 'error', error: String(error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
