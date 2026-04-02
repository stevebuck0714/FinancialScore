import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.$queryRaw<Array<{ createdAt: Date; errorDetails: unknown }>>`
    SELECT "createdAt", "errorDetails"
    FROM "ApiSyncLog"
    WHERE "companyId" = ${companyId}
      AND platform = 'INFOR_M3'
      AND status = 'success'
      AND UPPER(COALESCE("errorDetails"->>'miProgram','NULL')) = 'NULL'
      AND jsonb_typeof("errorDetails"->'response'->'Items') = 'array'
    ORDER BY "createdAt" DESC
    LIMIT 20
  `;

  const parsed = rows.map((r) => {
    const details =
      r.errorDetails && typeof r.errorDetails === 'object' && !Array.isArray(r.errorDetails)
        ? (r.errorDetails as Record<string, unknown>)
        : {};
    const endpointPath = String(details.endpointPath || details.path || '').trim();
    const transaction = String(details.transaction || '').trim();
    const response =
      details.response && typeof details.response === 'object' && !Array.isArray(details.response)
        ? (details.response as Record<string, unknown>)
        : {};
    const items = Array.isArray(response.Items) ? (response.Items as Array<Record<string, unknown>>) : [];
    const first = items[0] || {};
    return {
      createdAt: r.createdAt,
      endpointPath,
      transaction,
      itemCount: items.length,
      firstKeys: Object.keys(first).slice(0, 30),
      firstItem: first,
    };
  });

  console.log(JSON.stringify({ companyId, rows: parsed }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
