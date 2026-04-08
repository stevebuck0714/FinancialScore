import { PrismaClient } from '@prisma/client';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const afterDate = process.argv[2] || '2026-01-16';
const voucher = process.argv[3] || '401761';
const invNum = process.argv[4] || 'IN119969';
const vendNum = process.argv[5] || '1007401';

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        syncRunId: string | null;
        businessDate: Date | null;
        module: string | null;
        miProgram: string | null;
        transaction: string | null;
        createdAt: Date;
        payload: unknown;
      }>
    >`
      select
        id,
        "syncRunId",
        "businessDate",
        module,
        "miProgram",
        transaction,
        "createdAt",
        payload
      from "InforRawRecord"
      where "companyId" = ${companyId}
        and "createdAt" >= ${new Date(`${afterDate}T00:00:00.000Z`)}
        and (
          payload::text ilike ${`%"${voucher}"%`}
          or payload::text ilike ${`%${voucher}%`}
          or payload::text ilike ${`%"${invNum}"%`}
          or payload::text ilike ${`%${invNum}%`}
          or payload::text ilike ${`%"${vendNum}"%`}
          or payload::text ilike ${`%${vendNum}%`}
        )
      order by "createdAt" desc
      limit 200
    `;

    const summarized = rows.map((row) => {
      const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
      return {
        id: row.id,
        syncRunId: row.syncRunId,
        businessDate: row.businessDate,
        module: row.module,
        miProgram: row.miProgram,
        transaction: row.transaction,
        createdAt: row.createdAt,
        payloadSummary: {
          VendNum: payload['VendNum'] ?? null,
          VadName: payload['VadName'] ?? null,
          Voucher: payload['Voucher'] ?? null,
          VouchSeq: payload['VouchSeq'] ?? null,
          InvNum: payload['InvNum'] ?? null,
          InvDate: payload['InvDate'] ?? null,
          DistDate: payload['DistDate'] ?? null,
          RecordDate: payload['RecordDate'] ?? null,
          Type: payload['Type'] ?? null,
          InvAmt: payload['InvAmt'] ?? null,
          AmtPaid: payload['AmtPaid'] ?? null,
          CheckDate: payload['CheckDate'] ?? null,
          DomCheckAmt: payload['DomCheckAmt'] ?? null,
          DerDomAmtApplied: payload['DerDomAmtApplied'] ?? null,
          Ref: payload['Ref'] ?? null,
        },
      };
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          afterDate,
          voucher,
          invNum,
          vendNum,
          rowCount: summarized.length,
          rows: summarized,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
