import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const orderNo = (process.argv[2] || '43149').trim();
const companyIdArg = (process.argv[3] || '').trim();

async function main() {
  const rows = await prisma.$queryRaw<Array<{
    companyId: string;
    syncRunId: string | null;
    businessDate: Date | null;
    createdAt: Date;
    payload: unknown;
  }>>`
    select "companyId", "syncRunId", "businessDate", "createdAt", payload
    from "InforRawRecord"
    where upper(coalesce("miProgram", '')) in ('SLCOITEMS')
      and (
        payload->>'CoNum' = ${orderNo}
        or payload->>'CONUM' = ${orderNo}
        or payload->>'coNum' = ${orderNo}
        or coalesce(payload->>'CoNum', payload->>'CONUM', payload->>'coNum', '') like ${`%${orderNo}%`}
      )
      and (${companyIdArg} = '' or "companyId" = ${companyIdArg})
    order by "createdAt" asc
    limit 200
  `;

  const shaped = rows.map((row) => {
    const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
    return {
      companyId: row.companyId,
      syncRunId: row.syncRunId,
      businessDate: row.businessDate ? row.businessDate.toISOString().slice(0, 10) : null,
      createdAt: row.createdAt.toISOString(),
      CoNum: payload['CoNum'] ?? payload['CONUM'] ?? payload['coNum'] ?? null,
      CoLine: payload['CoLine'] ?? payload['COLINE'] ?? null,
      CoRelease: payload['CoRelease'] ?? payload['CORELEASE'] ?? null,
      Item: payload['Item'] ?? payload['ITNO'] ?? null,
      Stat: payload['Stat'] ?? null,
      Price: payload['Price'] ?? null,
      QtyOrdered: payload['QtyOrdered'] ?? null,
      QtyShipped: payload['QtyShipped'] ?? null,
      QtyInvoiced: payload['QtyInvoiced'] ?? null,
      Amount: payload['Amount'] ?? payload['ExtPrice'] ?? null,
      InvNum: payload['InvNum'] ?? null,
      DueDate: payload['DueDate'] ?? null,
      DT: payload['DT'] ?? null,
      RecordDate: payload['RecordDate'] ?? null,
      OrderDate: payload['OrderDate'] ?? null,
    };
  });

  console.log(JSON.stringify({ orderNo, companyFilter: companyIdArg || null, rowCount: shaped.length, rows: shaped }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

