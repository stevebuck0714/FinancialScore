import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function s(v: unknown): string {
  return String(v ?? '').trim();
}

async function main() {
  const companyId = 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.apiSyncLog.findMany({
    where: { companyId, syncType: 'operational_sales_CSI_LOAD' },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: { createdAt: true, status: true, errorDetails: true, recordsImported: true },
  });

  const out = rows
    .map((r) => {
      const d: any = r.errorDetails;
      const mi = s(d?.miProgram).toUpperCase();
      if (mi !== 'SLCOS' && mi !== 'SLCOITEMS') return null;
      return {
        createdAt: r.createdAt,
        status: r.status,
        miProgram: mi,
        recordsImported: r.recordsImported,
        endpointPath: d?.endpointPath || null,
        syncWindow: d?.syncWindow || null,
        sourceRecordCount: d?.sourceRecordCount ?? null,
        postWindowRecordCount: d?.postWindowRecordCount ?? null,
        persistedRecordCount: d?.persistedRecordCount ?? null,
        pagesFetched: d?.pagesFetched ?? null,
        paginationTruncated: d?.paginationTruncated ?? null,
        requestedSite: d?.requestedSite ?? null,
        mongooseConfig: d?.mongooseConfig ?? null,
      };
    })
    .filter(Boolean);

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

