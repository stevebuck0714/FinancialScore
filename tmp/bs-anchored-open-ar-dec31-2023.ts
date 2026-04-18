/**
 * BS-ANCHORED OPEN AR AS OF 12/31/2023 — v3 with _ItemId dedup.
 *
 * Each artran event in CSI has a stable identifier embedded in the payload's
 * `_ItemId` field, e.g.
 *   _ItemId = 'PBT=[artran] art.DT=[2023-12-29 10:45:07.167] art.ID=[<uuid>]'
 * Across re-runs of our CSI sync, the same source artran row gets re-ingested
 * into InforRawRecord with a new syncRunId, so a single real artran event can
 * appear N times. We must dedupe on _ItemId before doing any AR math.
 *
 * Process:
 *   1. Pull invoices: SLArtrans Type='I', InvDate '20230801'..'20231231 99'
 *      → DISTINCT ON (payload->>'_ItemId').
 *   2. Pull payments: SLArtrans Type IN ('P','C','CR'), RecordDate <= '20231231 99'
 *      → DISTINCT ON (payload->>'_ItemId').
 *   3. Match payments to invoices by (cust, ApplyToInvNum) → invoice.
 *   4. open balance = invoice.Amount - sum(applied payments). open if > $0.005.
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: true });
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const COMPANY = process.env.COMPANY_ID || 'cmmnwyofv000fqhp4z8lebbny';
const INV_FROM = '20230801';
const TO_PREFIX = '20231231';
const TARGET_TOTAL = 1_179_854.70;

function fmt$(n: number): string { return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
function fmt$2(n: number): string { return '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function ts(): string { return new Date().toISOString().slice(11,19); }

async function main() {
  console.log('DB:', (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0]);
  console.log(`Invoice universe: InvDate ${INV_FROM}..${TO_PREFIX}, Type='I', deduped on _ItemId`);
  console.log(`Payments universe: RecordDate <= ${TO_PREFIX}, Type in (P,C,CR), deduped on _ItemId`);
  console.log(`Target (BS account 11100, 12/31/2023): ${fmt$2(TARGET_TOTAL)}\n`);

  console.log(`[${ts()}] Fetching invoices (deduped)...`);
  const invRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT ON (payload->>'_ItemId')
        payload->>'_ItemId'                                                         AS item_id,
        TRIM(COALESCE(payload->>'CustNum',''))                                       AS cust,
        COALESCE(payload->>'DerCustName', payload->>'UbCustName')                    AS cust_name,
        TRIM(COALESCE(payload->>'InvNum',''))                                        AS inv_num,
        payload->>'InvDate'                                                          AS inv_date,
        payload->>'DueDate'                                                          AS due_date,
        payload->>'CurrCode'                                                         AS currency,
        ABS((payload->>'Amount')::float8)                                            AS inv_amount
       FROM "InforRawRecord"
      WHERE "companyId"=$1
        AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') = 'I'
        AND payload->>'InvDate' >= $2
        AND payload->>'InvDate' <= ($3 || ' 99')
        AND payload->>'_ItemId' IS NOT NULL
        AND (payload->>'Amount') IS NOT NULL`,
    COMPANY, INV_FROM, TO_PREFIX
  );
  console.log(`[${ts()}] Got ${invRows.length} unique invoice events`);

  console.log(`[${ts()}] Fetching payments/credits (deduped)...`);
  const payRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT DISTINCT ON (payload->>'_ItemId')
        payload->>'_ItemId'                                                         AS item_id,
        TRIM(COALESCE(payload->>'CustNum',''))                                       AS cust,
        TRIM(COALESCE(
          NULLIF(payload->>'ApplyToInvNum',''),
          NULLIF(payload->>'DerApplyToInvNum',''),
          payload->>'InvNum'
        )) AS apply_inv,
        UPPER(payload->>'Type') AS typ,
        ABS((payload->>'Amount')::float8) AS pay_amount,
        payload->>'RecordDate' AS rec_date
       FROM "InforRawRecord"
      WHERE "companyId"=$1
        AND "miProgram" ILIKE 'SLArtrans'
        AND UPPER(payload->>'Type') IN ('P','C','CR')
        AND payload->>'RecordDate' <= ($2 || ' 99')
        AND payload->>'_ItemId' IS NOT NULL
        AND (payload->>'Amount') IS NOT NULL`,
    COMPANY, TO_PREFIX
  );
  console.log(`[${ts()}] Got ${payRows.length} unique payment events`);

  // Build invoice map keyed by (cust, inv_num). After _ItemId dedup, multiple
  // events under the same (cust, inv_num) would represent legitimate amendments
  // — sum them.
  const invMap = new Map<string, {
    cust: string; cust_name: string; inv_num: string; inv_date: string | null;
    due_date: string | null; currency: string | null; inv_amount: number;
    paid: number; events: number;
  }>();
  for (const r of invRows) {
    const key = `${r.cust}|${r.inv_num}`;
    const existing = invMap.get(key);
    if (existing) {
      existing.inv_amount += Number(r.inv_amount);
      existing.events++;
    } else {
      invMap.set(key, {
        cust: r.cust ?? '', cust_name: r.cust_name ?? '',
        inv_num: r.inv_num,
        inv_date: r.inv_date, due_date: r.due_date, currency: r.currency,
        inv_amount: Number(r.inv_amount), paid: 0, events: 1,
      });
    }
  }

  let matchedPay = 0, orphanPay = 0, matchedSum = 0, orphanSum = 0;
  for (const p of payRows) {
    const key = `${p.cust}|${p.apply_inv}`;
    const inv = invMap.get(key);
    if (inv) {
      inv.paid += Number(p.pay_amount);
      matchedPay++;
      matchedSum += Number(p.pay_amount);
    } else {
      orphanPay++;
      orphanSum += Number(p.pay_amount);
    }
  }
  console.log(`[${ts()}] Payments matched: ${matchedPay} (${fmt$(matchedSum)})`);
  console.log(`[${ts()}] Payments orphan : ${orphanPay} (${fmt$(orphanSum)})`);

  let totalInv = 0, totalPaid = 0, totalOpen = 0, openCount = 0;
  let zeroCount = 0, overpaidCount = 0, overpaidTotal = 0;
  const records: any[] = [];
  for (const inv of invMap.values()) {
    totalInv += inv.inv_amount;
    totalPaid += inv.paid;
    const balance = inv.inv_amount - inv.paid;
    if (balance > 0.005) {
      openCount++;
      totalOpen += balance;
      records.push({ ...inv, balance });
    } else if (balance < -0.005) {
      overpaidCount++;
      overpaidTotal += balance;
    } else {
      zeroCount++;
    }
  }

  console.log(`\nUniverse summary:`);
  console.log(`  invoices in window     : ${invMap.size}`);
  console.log(`  invoiced amount sum    : ${fmt$2(totalInv)}`);
  console.log(`  applied payments sum   : ${fmt$2(totalPaid)}`);
  console.log(`  zero-balance (paid)    : ${zeroCount}`);
  console.log(`  overpaid invoices      : ${overpaidCount}  (net ${fmt$2(overpaidTotal)})`);
  console.log(`  OPEN invoices          : ${openCount}`);
  console.log(`  OPEN total             : ${fmt$2(totalOpen)}`);
  console.log(`  TARGET (BS)            : ${fmt$2(TARGET_TOTAL)}`);
  const diff = totalOpen - TARGET_TOTAL;
  const pct = (diff / TARGET_TOTAL) * 100;
  console.log(`  diff vs BS             : ${fmt$2(diff)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`);

  records.sort((a, b) => b.balance - a.balance);
  console.log(`\nTop 25 open invoices:`);
  console.log('  inv_date    cust        inv_num        inv$         paid$        bal$');
  for (const r of records.slice(0, 25)) {
    const dt = (r.inv_date || '').slice(0,8);
    const dtFmt = dt.length === 8 ? `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}` : dt;
    console.log(
      `  ${dtFmt}  ${String(r.cust).padEnd(10)}  ${String(r.inv_num).padEnd(13)}  ${fmt$(r.inv_amount).padStart(11)}  ${fmt$(r.paid).padStart(11)}  ${fmt$2(r.balance).padStart(13)}`
    );
  }

  const csvPath = 'tmp/open-ar-dec31-2023-deduped.csv';
  const csvHeader = 'cust,cust_name,inv_num,inv_date,due_date,currency,inv_amount,paid_total,balance,events\n';
  const csvBody = records.map(r => [
    r.cust ?? '',
    `"${String(r.cust_name ?? '').replace(/"/g,'""')}"`,
    r.inv_num,
    r.inv_date ?? '',
    r.due_date ?? '',
    r.currency ?? '',
    r.inv_amount.toFixed(2),
    r.paid.toFixed(2),
    r.balance.toFixed(2),
    r.events,
  ].join(',')).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvBody);
  console.log(`\nWrote ${openCount} open invoices to ${csvPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
