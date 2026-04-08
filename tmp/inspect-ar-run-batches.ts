import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const syncRunId = process.argv[3] || '';
const programs = (process.argv[4] || 'SLARTRANS,SLCUSTDRFTS')
  .split(',')
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

type Row = {
  businessDate: Date | null;
  miProgram: string | null;
  endpointPath: string | null;
  pageNo: number | null;
  bookmarkIn: string | null;
  bookmarkOut: string | null;
  recordCount: number | null;
  status: string | null;
  createdAt: Date;
  syncRunId: string;
};

function classifyProgramShape(row: Row) {
  const endpointPath = String(row.endpointPath || '');
  const bookmark = String(row.bookmarkOut || row.bookmarkIn || '');
  const orderBy = (() => {
    const [, query = ''] = endpointPath.split('?');
    const params = new URLSearchParams(query);
    return String(params.get('orderby') || params.get('orderBy') || '');
  })();

  if (String(row.miProgram || '').toUpperCase() === 'SLARTRANS') {
    return {
      hasRecordDate: /RecordDate/i.test(endpointPath),
      hasInvDate: /InvDate/i.test(endpointPath),
      hasRowPointerBookmark: /RowPointer|_ItemId/i.test(bookmark),
      hasLegacyCsiBookmark: /<B>|%3CB%3E/i.test(endpointPath) || /<B>|%3CB%3E/i.test(bookmark),
      orderBy,
    };
  }

  if (String(row.miProgram || '').toUpperCase() === 'SLCUSTDRFTS') {
    return {
      hasInvDate: /InvDate/i.test(endpointPath),
      hasCustInvBookmark: /CustNum|InvNum/i.test(bookmark),
      hasLegacyCsiBookmark: /<B>|%3CB%3E/i.test(endpointPath) || /<B>|%3CB%3E/i.test(bookmark),
      orderBy,
    };
  }

  return { orderBy };
}

async function main() {
  const whereSql = syncRunId
    ? `AND "syncRunId" = '${syncRunId.replace(/'/g, "''")}'`
    : 'AND "createdAt" >= NOW() - INTERVAL \'14 days\'';
  const programSql = programs.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

  const rows = await prisma.$queryRawUnsafe<Row[]>(`
    SELECT
      "businessDate",
      "miProgram",
      "endpointPath",
      "pageNo",
      "bookmarkIn",
      "bookmarkOut",
      "recordCount",
      status,
      "createdAt",
      "syncRunId"
    FROM "InforRawBatch"
    WHERE "companyId" = '${companyId.replace(/'/g, "''")}'
      AND UPPER(COALESCE("miProgram", '')) IN (${programSql})
      ${whereSql}
    ORDER BY "createdAt" DESC
    LIMIT 120
  `);

  const shaped = rows.map((row) => ({
    ...row,
    shape: classifyProgramShape(row),
  }));

  console.log(JSON.stringify(shaped, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
