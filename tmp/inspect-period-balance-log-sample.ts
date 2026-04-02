import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.$queryRaw<Array<{ errorDetails: unknown; createdAt: Date }>>`
    SELECT "errorDetails", "createdAt"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND status = 'success'
      AND UPPER(COALESCE("errorDetails"->>'miProgram','')) = 'GLACCTPERIODBALANCES'
      AND jsonb_typeof("errorDetails"->'response'->'Items') = 'array'
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

  const payload =
    rows[0]?.errorDetails && typeof rows[0].errorDetails === 'object' && !Array.isArray(rows[0].errorDetails)
      ? (rows[0].errorDetails as Record<string, unknown>)
      : {};
  const response =
    payload.response && typeof payload.response === 'object' && !Array.isArray(payload.response)
      ? (payload.response as Record<string, unknown>)
      : {};
  const items = Array.isArray(response.Items) ? (response.Items as Array<Record<string, unknown>>) : [];
  const first = items[0] || {};

  console.log(
    JSON.stringify(
      {
        createdAt: rows[0]?.createdAt || null,
        itemCount: items.length,
        firstItemKeys: Object.keys(first).sort(),
        firstItem: first,
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
