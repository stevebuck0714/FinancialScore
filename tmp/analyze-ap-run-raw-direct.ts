import { PrismaClient } from '@prisma/client';

const companyId = 'cmmnwyofv000fqhp4z8lebbny';
const syncRunId = process.argv[2] || '23b68765-3876-465d-a31b-7974c52ac938';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<Array<{ miProgram: string | null; transaction: string | null; payload: unknown }>>`
      select "miProgram", transaction, payload
      from "InforRawRecord"
      where "companyId" = ${companyId}
        and "syncRunId" = ${syncRunId}
        and module = 'AP'
      order by "createdAt" desc
      limit 200000
    `;

    const summary = new Map<string, {
      count: number;
      typeCounts: Record<string, number>;
      positiveAmtPaid: number;
      positiveInvAmt: number;
      sampleRows: Array<Record<string, unknown>>;
    }>();

    for (const row of rows) {
      const program = String(row.miProgram || 'UNKNOWN');
      if (!summary.has(program)) {
        summary.set(program, {
          count: 0,
          typeCounts: {},
          positiveAmtPaid: 0,
          positiveInvAmt: 0,
          sampleRows: [],
        });
      }
      const acc = summary.get(program)!;
      acc.count += 1;
      const payload = asRecord(row.payload);
      const typeToken = String(payload.Type || payload.type || '<null>').trim() || '<empty>';
      acc.typeCounts[typeToken] = (acc.typeCounts[typeToken] || 0) + 1;
      if (toNumber(payload.AmtPaid) > 0) acc.positiveAmtPaid += 1;
      if (toNumber(payload.InvAmt) > 0) acc.positiveInvAmt += 1;
      if (acc.sampleRows.length < 5) {
        acc.sampleRows.push({
          Type: payload.Type ?? null,
          VendNum: payload.VendNum ?? null,
          VendaddrName: payload.VendaddrName ?? null,
          InvNum: payload.InvNum ?? null,
          Voucher: payload.Voucher ?? null,
          InvDate: payload.InvDate ?? null,
          DueDate: payload.DueDate ?? null,
          RecordDate: payload.RecordDate ?? null,
          InvAmt: payload.InvAmt ?? null,
          AmtPaid: payload.AmtPaid ?? null,
        });
      }
    }

    const result = Array.from(summary.entries()).map(([miProgram, acc]) => ({
      miProgram,
      count: acc.count,
      typeCounts: Object.entries(acc.typeCounts).sort((a, b) => b[1] - a[1]),
      positiveAmtPaid: acc.positiveAmtPaid,
      positiveInvAmt: acc.positiveInvAmt,
      sampleRows: acc.sampleRows,
    }));

    console.log(JSON.stringify({ ok: true, syncRunId, result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
