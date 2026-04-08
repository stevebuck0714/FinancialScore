import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const vendNum = process.argv[3] || '1007401';
const startDate = process.argv[4] || '2025-01-01';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pick(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') return record[key];
  }
  return null;
}

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      module: string | null;
      miProgram: string | null;
      transaction: string | null;
      businessDate: Date | null;
      createdAt: Date;
      payload: unknown;
    }>
  >`
    select
      id,
      module,
      "miProgram",
      transaction,
      "businessDate",
      "createdAt",
      payload
    from "InforRawRecord"
    where "companyId" = ${companyId}
      and coalesce("businessDate", "createdAt") >= ${new Date(`${startDate}T00:00:00.000Z`)}
      and upper(coalesce("miProgram", '')) in ('SLVCHHDRS', 'SLVENDORS')
      and (
        payload::text ilike ${`%"${vendNum}"%`}
        or payload::text ilike ${`%${vendNum}%`}
      )
    order by coalesce("businessDate", "createdAt") asc, "createdAt" asc
    limit 2000
  `;

  const slVchHdrs = [];
  const slVendors = [];

  for (const row of rows) {
    const payload = asObject(row.payload);
    const program = String(row.miProgram || '').trim().toUpperCase();
    const base = {
      businessDate: row.businessDate,
      createdAt: row.createdAt,
      module: row.module,
      miProgram: row.miProgram,
      transaction: row.transaction,
    };

    if (program === 'SLVCHHDRS') {
      slVchHdrs.push({
        ...base,
        VendNum: pick(payload, ['VendNum']),
        VadName: pick(payload, ['VadName', 'Name']),
        Voucher: pick(payload, ['Voucher']),
        VouchSeq: pick(payload, ['VouchSeq']),
        InvNum: pick(payload, ['InvNum']),
        InvDate: pick(payload, ['InvDate']),
        DistDate: pick(payload, ['DistDate']),
        RecordDate: pick(payload, ['RecordDate']),
        Type: pick(payload, ['Type']),
        InvAmt: pick(payload, ['InvAmt']),
        PreRegister: pick(payload, ['PreRegister']),
        InWorkflow: pick(payload, ['InWorkflow']),
        PostFromPo: pick(payload, ['PostFromPo']),
      });
      continue;
    }

    if (program === 'SLVENDORS') {
      slVendors.push({
        ...base,
        VendNum: pick(payload, ['VendNum']),
        Name: pick(payload, ['Name', 'VadName']),
        CurrCode: pick(payload, ['CurrCode']),
        TermsCode: pick(payload, ['TermsCode']),
        PayType: pick(payload, ['PayType']),
        RecordDate: pick(payload, ['RecordDate']),
        LastPaid: pick(payload, ['LastPaid']),
        LastPurch: pick(payload, ['LastPurch']),
        PayYtd: pick(payload, ['PayYtd']),
        PayLstYr: pick(payload, ['PayLstYr']),
        PurchYtd: pick(payload, ['PurchYtd']),
        PurchLstYr: pick(payload, ['PurchLstYr']),
        VadAddr_1: pick(payload, ['VadAddr_1']),
        VadCity: pick(payload, ['VadCity']),
        VadState: pick(payload, ['VadState']),
        VadZip: pick(payload, ['VadZip']),
        VadCountry: pick(payload, ['VadCountry']),
        Stat: pick(payload, ['Stat']),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        companyId,
        vendNum,
        startDate,
        totalRows: rows.length,
        slVchHdrsCount: slVchHdrs.length,
        slVendorsCount: slVendors.length,
        slVchHdrs,
        slVendors,
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
