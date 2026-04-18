/**
 * Dump every SLArtrans Type='I' raw row for a given InvDate so we can see
 * what an actual day's invoices look like.
 *
 * InvDate is stored as Infor CSI string 'YYYYMMDD 00:00:00.000', so we
 * filter with a LIKE prefix on the JSON string (no ::date cast).
 *
 * Usage:
 *   tsx tmp/probe-day-detail.ts 2023-12-28
 *   tsx tmp/probe-day-detail.ts 2023-08-15
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = 'cmmnwyofv000fqhp4z8lebbny';

function fmt$(n: number): string {
  return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function ts(): string { return new Date().toISOString().slice(11,19); }

async function main() {
  const day = (process.argv[2] || '2023-12-28').slice(0,10);
  const ymd = day.replace(/-/g,'');
  console.log(`[${ts()}] DB: ${(process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]}`);
  console.log(`[${ts()}] InvDate prefix = '${ymd}'  (i.e. ${day})\n`);

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
        payload->>'CustNum'              AS cust,
        COALESCE(payload->>'DerCustName', payload->>'UbCustName') AS cust_name,
        TRIM(payload->>'InvNum')         AS inv_num,
        payload->>'InvDate'              AS inv_date,
        payload->>'DueDate'              AS due_date,
        payload->>'CurrCode'             AS curr,
        (payload->>'Amount')::float8     AS amount,
        (payload->>'UbOpening')::float8  AS ub_opening,
        (payload->>'UbPayment')::float8  AS ub_payment,
        (payload->>'DerPaymentCheckAmount')::float8 AS der_paychk,
        TRIM(payload->>'ApplyToInvNum')  AS apply_to,
        payload->>'RecordDate'           AS rec_date,
        "createdAt"                      AS ingested_at
       FROM "InforRawRecord"
      WHERE "companyId"=$1
        AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') = 'I'
        AND payload->>'InvDate' LIKE $2
      ORDER BY TRIM(payload->>'InvNum'), payload->>'CustNum',
               (payload->>'RecordDate'),
               "createdAt"`,
    COMPANY, ymd + '%'
  );

  console.log(`[${ts()}] ${rows.length} Type='I' raw events on ${day}\n`);
  if (rows.length === 0) return;

  // Group by (cust, inv_num)
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const key = `${r.cust}|${r.inv_num}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let totalAmount = 0, totalOpening = 0, totalPayment = 0, totalPayChk = 0;
  for (const r of rows) {
    totalAmount  += Math.abs(Number(r.amount  ?? 0));
    totalOpening += Math.abs(Number(r.ub_opening ?? 0));
    totalPayment += Math.abs(Number(r.ub_payment ?? 0));
    totalPayChk  += Math.abs(Number(r.der_paychk ?? 0));
  }
  console.log(`Distinct (cust,inv) pairs: ${groups.size}`);
  console.log(`Sum |Amount|              : ${fmt$(totalAmount)}`);
  console.log(`Sum |UbOpening|           : ${fmt$(totalOpening)}`);
  console.log(`Sum |UbPayment|           : ${fmt$(totalPayment)}`);
  console.log(`Sum |DerPaymentCheckAmount|: ${fmt$(totalPayChk)}\n`);

  console.log('=== Every invoice (cust, inv) on this day ===');
  console.log('  cust       inv_num         curr       amount     ub_open    ub_pay   der_chk    rec_date              cust_name');
  for (const [key, list] of groups.entries()) {
    if (list.length === 1) {
      const r = list[0];
      console.log(
        `  ${String(r.cust).padEnd(10)} ${String(r.inv_num).padEnd(15)} ${String(r.curr).padEnd(5)} ` +
        `${fmt$(r.amount).padStart(11)} ${fmt$(r.ub_opening).padStart(11)} ${fmt$(r.ub_payment).padStart(9)} ${fmt$(r.der_paychk).padStart(9)}  ` +
        `${String(r.rec_date).padEnd(22)} ${String(r.cust_name).slice(0,32)}`
      );
    } else {
      console.log(`  --- pair ${key} has ${list.length} events ---`);
      let i = 0;
      for (const r of list) {
        i++;
        console.log(
          `    #${i}  amount=${fmt$(r.amount).padStart(11)}  ub_open=${fmt$(r.ub_opening).padStart(11)}  ub_pay=${fmt$(r.ub_payment).padStart(9)}  der_chk=${fmt$(r.der_paychk).padStart(9)}  rec=${r.rec_date}`
        );
      }
    }
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); }).finally(()=>prisma.$disconnect());
