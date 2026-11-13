/**
 * DEV ONLY: seeds a cash proof for one company with mock bank statement PDFs
 * in the Data Room "Bank Statements" folder, then enters each statement.
 *
 *   npx tsx scripts/seed-cash-proof-mock-statements.ts --company "CTR Payroll Services"
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { put, del } from '@vercel/blob';
import prisma from '../lib/prisma';
import { validateDatabaseConnection } from '../lib/db-security';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '../lib/dataroom/constants';
import { getDataRoomState, upsertDataRoomState } from '../lib/dataroom/state';
import { loadCashProofState, runCashProofAction } from '../lib/cash-proof/service';
import { loadRevenueBasisByMonth, shiftMonth } from '../lib/cash-proof/book-balances';
import type { RevenueAdjustmentCategory } from '../lib/cash-proof/revenue-reconciliation';

const MOCK_PREFIX = 'dataroom-mock/cash-proof';

const BANK_PROFILES: Array<{ match: RegExp; bankName: string; last4: string; type: string; address: string }> = [
  { match: /operating cash/i, bankName: 'First Citizens Bank', last4: '4821', type: 'Business Checking', address: 'PO Box 27131, Raleigh, NC 27611' },
  { match: /reserve|money market/i, bankName: 'First Citizens Bank', last4: '7730', type: 'Business Money Market', address: 'PO Box 27131, Raleigh, NC 27611' },
  { match: /clearing/i, bankName: 'JPMorgan Chase Bank, N.A.', last4: '3392', type: 'Fiduciary Payroll Clearing', address: 'PO Box 182051, Columbus, OH 43218' },
  { match: /tax/i, bankName: 'JPMorgan Chase Bank, N.A.', last4: '5518', type: 'Fiduciary Payroll Tax', address: 'PO Box 182051, Columbus, OH 43218' },
];

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] || null : null;
}

// ---------- minimal PDF writer ----------
type Op = string;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const text = (x: number, y: number, s: string, size = 9, bold = false): Op =>
  `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(s)}) Tj ET`;
const textRight = (xRight: number, y: number, s: string, size = 9, bold = false): Op =>
  text(xRight - s.length * size * 0.5, y, s, size, bold);
const line = (x1: number, y1: number, x2: number, y2: number, w = 0.5): Op => `${w} w ${x1} ${y1} m ${x2} ${y2} l S`;
const rect = (x: number, y: number, w: number, h: number, gray: number): Op => `${gray} g ${x} ${y} ${w} ${h} re f 0 g`;

function buildPdf(ops: Op[]): Buffer {
  const content = ops.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

// ---------- statement content ----------
const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function splitAmount(total: number, parts: number, rand: () => number): number[] {
  if (total <= 0 || parts <= 1) return total > 0 ? [round2(total)] : [];
  const weights = Array.from({ length: parts }, () => 0.4 + rand());
  const sum = weights.reduce((s, w) => s + w, 0);
  const amounts = weights.map((w) => round2((total * w) / sum));
  amounts[amounts.length - 1] = round2(total - amounts.slice(0, -1).reduce((s, a) => s + a, 0));
  return amounts;
}

const DEPOSIT_TEXT: Record<string, string[]> = {
  operating: ['ACH CREDIT CLIENT SERVICE FEES', 'REMOTE DEPOSIT', 'ACH CREDIT PAYROLL PROCESSING FEES', 'WIRE IN CLIENT RETAINER'],
  reserve: ['TRANSFER FROM CHK 4821', 'INTEREST PAID'],
  clearing: ['ACH CREDIT CLIENT PAYROLL FUNDING', 'WIRE IN CLIENT PAYROLL FUNDING'],
  tax: ['ACH CREDIT CLIENT TAX IMPOUND', 'TRANSFER FROM CLEARING 3392'],
};
const WITHDRAWAL_TEXT: Record<string, string[]> = {
  operating: ['ACH DEBIT ADP PAYROLL', 'CHECK', 'ACH DEBIT RENT - OFFICE LEASE', 'CARD PURCHASE SOFTWARE', 'TRANSFER TO MM 7730'],
  reserve: ['TRANSFER TO CHK 4821'],
  clearing: ['ACH DEBIT EMPLOYEE NET PAY BATCH', 'ACH DEBIT DIRECT DEPOSIT BATCH', 'TRANSFER TO TAX 5518'],
  tax: ['EFTPS FEDERAL TAX PAYMENT', 'STATE WITHHOLDING PAYMENT', 'SUI PAYMENT'],
};

function accountKind(name: string) {
  if (/clearing/i.test(name)) return 'clearing';
  if (/tax/i.test(name)) return 'tax';
  if (/reserve|money market/i.test(name)) return 'reserve';
  return 'operating';
}

const DEPOSITS_CATEGORY: Record<string, RevenueAdjustmentCategory | null> = {
  operating: null,
  reserve: 'TRANSFER_IN',
  clearing: 'CUSTOMER_FUNDS',
  tax: 'CUSTOMER_FUNDS',
};

// Operating-account events layered on top of customer collections.
const BAD_DEBT_WRITE_OFF: Record<string, number> = { '2024-10': 90000, '2024-11': 90000, '2024-12': 90000 };
const OPERATING_EVENTS: Array<{ month: string; category: RevenueAdjustmentCategory; amount: number; description: string }> = [
  { month: '2024-03', category: 'OWNER_CONTRIBUTION', amount: 75000, description: 'Owner capital contribution, wire from personal account' },
  { month: '2025-06', category: 'LOAN_PROCEEDS', amount: 150000, description: 'First Citizens line of credit draw' },
];
const FY2024_NOTE =
  'Q4 2024 billings of $270,000 to Meridian Staffing Group were recognized as revenue but never collected; the client filed for bankruptcy and the receivable was written off in 2025. A QoE adjustment reducing FY2024 revenue by $270,000 is recommended.';

function statementPdf(input: {
  companyName: string;
  bankName: string;
  bankAddress: string;
  accountType: string;
  last4: string;
  month: string;
  beginning: number;
  deposits: number;
  withdrawals: number;
  ending: number;
  kind: string;
}) {
  const [y, m] = input.month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  const rand = seeded(`${input.last4}-${input.month}`);
  const credits = splitAmount(input.deposits, input.deposits > 0 ? 3 + Math.floor(rand() * 4) : 0, rand);
  const debits = splitAmount(input.withdrawals, input.withdrawals > 0 ? 4 + Math.floor(rand() * 5) : 0, rand);
  const tx = [
    ...credits.map((amt) => ({ day: 1 + Math.floor(rand() * lastDay), desc: DEPOSIT_TEXT[input.kind][Math.floor(rand() * DEPOSIT_TEXT[input.kind].length)], amt })),
    ...debits.map((amt) => ({ day: 1 + Math.floor(rand() * lastDay), desc: WITHDRAWAL_TEXT[input.kind][Math.floor(rand() * WITHDRAWAL_TEXT[input.kind].length)], amt: -amt })),
  ].sort((a, b) => a.day - b.day);

  const ops: Op[] = [];
  ops.push(text(50, 742, input.bankName, 16, true));
  ops.push(text(50, 728, input.bankAddress, 8));
  ops.push(textRight(562, 742, input.accountType.toUpperCase() + ' STATEMENT', 10, true));
  ops.push(textRight(562, 728, `Statement Period ${mm}/01/${y} - ${mm}/${lastDay}/${y}`, 8));
  ops.push(line(50, 718, 562, 718, 1));
  ops.push(text(50, 700, input.companyName.toUpperCase(), 10, true));
  ops.push(text(50, 688, '1200 Commerce Park Dr, Suite 300', 8));
  ops.push(text(50, 677, 'Charlotte, NC 28217', 8));
  ops.push(textRight(562, 700, `Account Number: ******${input.last4}`, 9, true));
  ops.push(textRight(562, 688, `Page 1 of 1`, 8));

  ops.push(rect(50, 590, 512, 70, 0.93));
  ops.push(text(60, 645, 'ACCOUNT SUMMARY', 9, true));
  const summary: Array<[string, number]> = [
    [`Beginning Balance on ${mm}/01/${y}`, input.beginning],
    [`Deposits and Other Credits (${credits.length})`, input.deposits],
    [`Withdrawals and Other Debits (${debits.length})`, -input.withdrawals],
    [`Ending Balance on ${mm}/${lastDay}/${y}`, input.ending],
  ];
  summary.forEach(([label, value], i) => {
    const yy = 630 - i * 11;
    ops.push(text(60, yy, label, 8, i === 3));
    ops.push(textRight(550, yy, money(value), 8, i === 3));
  });

  ops.push(text(50, 570, 'TRANSACTION DETAIL', 9, true));
  ops.push(line(50, 565, 562, 565));
  ops.push(text(50, 555, 'Date', 8, true));
  ops.push(text(100, 555, 'Description', 8, true));
  ops.push(textRight(430, 555, 'Credits', 8, true));
  ops.push(textRight(500, 555, 'Debits', 8, true));
  ops.push(textRight(562, 555, 'Balance', 8, true));
  ops.push(line(50, 550, 562, 550));
  let running = input.beginning;
  let yy = 538;
  for (const t of tx) {
    running = round2(running + t.amt);
    ops.push(text(50, yy, `${mm}/${String(t.day).padStart(2, '0')}`, 8));
    ops.push(text(100, yy, t.desc + (t.desc === 'CHECK' ? ` #${1000 + Math.floor(rand() * 900)}` : ''), 8));
    if (t.amt >= 0) ops.push(textRight(430, yy, money(t.amt), 8));
    else ops.push(textRight(500, yy, money(-t.amt), 8));
    ops.push(textRight(562, yy, money(running), 8));
    yy -= 12;
  }
  ops.push(line(50, yy + 4, 562, yy + 4));
  ops.push(text(100, yy - 8, 'Ending Balance', 8, true));
  ops.push(textRight(562, yy - 8, money(input.ending), 8, true));

  ops.push(line(50, 60, 562, 60));
  ops.push(text(50, 48, 'MOCK STATEMENT - GENERATED FOR CORELYTICS DEVELOPMENT TESTING ONLY. NOT A REAL BANK RECORD.', 7, true));
  ops.push(text(50, 38, 'Member FDIC. Questions about this statement? Call the number on the back of your card.', 7));
  return buildPdf(ops);
}

async function main() {
  const db = validateDatabaseConnection();
  if (!String(db?.label || '').toUpperCase().includes('DEV')) {
    throw new Error(`Refusing to seed mock statements outside the dev database (${db?.label})`);
  }
  const companyName = argValue('--company') || 'CTR Payroll Services';
  const envLocal = dotenv.parse(fs.readFileSync(path.join(process.cwd(), '.env.local')));
  const token = envLocal.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('BLOB_READ_WRITE_TOKEN missing from .env.local');

  const company = await prisma.company.findFirst({ where: { name: companyName }, select: { id: true, name: true } });
  if (!company) throw new Error(`Company not found: ${companyName}`);
  const admin = await prisma.user.findFirst({ where: { role: 'SITEADMIN' }, select: { id: true } });
  if (!admin) throw new Error('No SITEADMIN user to own the uploads');

  // Clear any earlier mock run so this script can be re-run.
  const oldDocs = await prisma.dataRoomDocument.findMany({
    where: { companyId: company.id, blobPathname: { startsWith: `${MOCK_PREFIX}/${company.id}/` } },
    select: { id: true, blobUrl: true },
  });
  if (oldDocs.length) {
    await del(oldDocs.map((d) => d.blobUrl), { token }).catch(() => undefined);
    await prisma.dataRoomDocument.deleteMany({ where: { id: { in: oldDocs.map((d) => d.id) } } });
  }
  await prisma.cashProofEngagement.deleteMany({ where: { companyId: company.id } });

  await runCashProofAction(company.id, admin.id, { action: 'create', fiscalYearEndMonth: 12 });
  let state = await loadCashProofState(company.id);
  const engagementId = state.engagement!.id;

  for (const account of state.accounts) {
    const profile = BANK_PROFILES.find((p) => p.match.test(account.accountName));
    if (!profile) continue;
    await runCashProofAction(company.id, admin.id, {
      action: 'update-account',
      engagementId,
      bankAccountId: account.id,
      bankName: profile.bankName,
      accountLast4: profile.last4,
      accountType: profile.type,
      depositsCategory: DEPOSITS_CATEGORY[accountKind(account.accountName)],
    });
  }
  await runCashProofAction(company.id, admin.id, { action: 'generate-sample', engagementId });
  state = await loadCashProofState(company.id);

  console.log(`Period ${state.engagement!.periodStartMonth}..${state.engagement!.periodEndMonth}`);
  console.log('Accounts:', state.accounts.map((a) => `${a.accountName} (${Object.keys(a.balances).length} balances)`));
  console.log('Sampled months:', [...new Set(state.samples.map((s) => `${s.month} ${s.selectionReason}`))]);

  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
  const sampledMonths = [...new Set(state.samples.map((s) => s.month))].sort();
  const latest = sampledMonths[sampledMonths.length - 1];
  const fye2025 = sampledMonths.find((m) => m.endsWith('-12') && m < latest) || sampledMonths[0];
  const randomMonth = state.samples.find((s) => s.selectionReason === 'RANDOM')?.month || sampledMonths[0];

  // Scenarios on top of a clean tie: bank figure − book figure, plus how it is handled.
  type Scenario = { bankMinusBook: number; reconciling: number; exceptionNote?: string; resolutionNote?: string };
  const scenarioFor = (accountName: string, month: string): Scenario => {
    if (/operating cash/i.test(accountName) && month === latest) {
      return { bankMinusBook: 3215.4, reconciling: -3215.4 };
    }
    if (/clearing/i.test(accountName) && month === randomMonth) {
      return { bankMinusBook: -12500, reconciling: 12500 };
    }
    if (/reserve|money market/i.test(accountName) && month === fye2025) {
      return {
        bankMinusBook: 1850,
        reconciling: 0,
        exceptionNote: 'Bank ending balance is $1,850.00 higher than the general ledger.',
        resolutionNote: 'December money market interest credited by the bank on 12/31 was recorded in January. Confirmed on the January statement and GL; timing only.',
      };
    }
    if (/tax/i.test(accountName) && month === latest) {
      return {
        bankMinusBook: -640.25,
        reconciling: 0,
        exceptionNote: 'Bank is $640.25 lower than books. Appears to be an EFTPS penalty debit not yet recorded; requested support from client.',
      };
    }
    return { bankMinusBook: 0, reconciling: 0 };
  };

  const index = new Map<string, number>();
  let uploaded = 0;
  const company2 = await prisma.company.findUniqueOrThrow({ where: { id: company.id }, select: { userDefinedAllocations: true } });
  const dataRoom = getDataRoomState(company2.userDefinedAllocations);
  const documentIndex = (dataRoom.documentIndex as Array<Record<string, unknown>>).filter(
    (e) => !oldDocs.some((d) => d.id === e.documentId),
  );

  const basis = await loadRevenueBasisByMonth(company.id, shiftMonth(state.months[0], -1), state.months[state.months.length - 1]);
  const samplesByKey = new Map(state.samples.map((s) => [`${s.bankAccountId}|${s.month}`, s]));
  const cells = state.accounts
    .filter((a) => a.included && BANK_PROFILES.some((p) => p.match.test(a.accountName)))
    .flatMap((a) => state.months.map((month) => ({ account: a, month })))
    .sort((x, y) => x.month.localeCompare(y.month));

  for (const { account, month } of cells) {
    const sample = samplesByKey.get(`${account.id}|${month}`);
    const kind = accountKind(account.accountName);
    const profile = BANK_PROFILES.find((p) => p.match.test(account.accountName))!;
    const book = account.balances[month]?.value ?? 0;
    const priorBook = account.balances[shiftMonth(month, -1)]?.value ?? book;
    const scenario: Scenario = sample ? scenarioFor(account.accountName, month) : { bankMinusBook: 0, reconciling: 0 };
    const beginning = round2(index.get(`${account.id}|${shiftMonth(month, -1)}`) ?? priorBook);
    const ending = round2(book + scenario.bankMinusBook);
    const rand = seeded(`${account.id}${month}`);
    const net = round2(ending - beginning);
    const scale = Math.max(Math.abs(book), 25000);
    let deposits: number;
    if (kind === 'operating') {
      // Customer collections = revenue − change in receivables, so deposits tie to revenue.
      const cur = basis[month];
      const prior = basis[shiftMonth(month, -1)];
      const collections = cur && prior ? cur.revenue - (cur.receivables - prior.receivables) : 0;
      const events = OPERATING_EVENTS.filter((e) => e.month === month).reduce((s, e) => s + e.amount, 0);
      deposits = round2(collections * (1 + (rand() - 0.5) * 0.004) - (BAD_DEBT_WRITE_OFF[month] || 0) + events);
    } else {
      deposits = round2(scale * (0.6 + rand() * 0.8) + Math.max(0, net));
    }
    const withdrawals = round2(deposits - net);
    if (withdrawals < 0) console.warn(`Negative withdrawals for ${account.accountName} ${month}: ${withdrawals}`);
    index.set(`${account.id}|${month}`, ending);

    const pdf = statementPdf({
      companyName: company.name,
      bankName: profile.bankName,
      bankAddress: profile.address,
      accountType: profile.type,
      last4: profile.last4,
      month,
      beginning,
      deposits,
      withdrawals,
      ending,
      kind,
    });
    const fileName = `${profile.bankName.split(',')[0]} x${profile.last4} - ${month} Statement.pdf`;
    const blob = await put(`${MOCK_PREFIX}/${company.id}/${fileName}`, pdf, {
      access: 'public',
      contentType: 'application/pdf',
      addRandomSuffix: true,
      token,
    });
    const doc = await prisma.dataRoomDocument.create({
      data: {
        companyId: company.id,
        uploadedByUserId: admin.id,
        category: 'OTHER',
        originalFileName: fileName,
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        contentType: 'application/pdf',
        sizeBytes: pdf.length,
        extractionStatus: 'PENDING',
      },
    });
    const nowIso = new Date().toISOString();
    documentIndex.push({
      documentId: doc.id,
      folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
      scanStatus: 'clean',
      scanReason: null,
      scanQueuedAt: nowIso,
      scannedAt: nowIso,
      scanAttempts: 1,
      nextScanAt: null,
      watermarkOnDownload: true,
      updatedAt: nowIso,
    });
    uploaded++;

    if (!sample) {
      await runCashProofAction(company.id, admin.id, {
        action: 'set-deposit',
        engagementId,
        bankAccountId: account.id,
        month,
        totalDeposits: deposits,
      });
      continue;
    }
    await runCashProofAction(company.id, admin.id, {
      action: 'update-sample',
      engagementId,
      sampleId: sample.id,
      dataRoomDocumentId: doc.id,
      statementBeginning: beginning,
      statementDeposits: deposits,
      statementWithdrawals: withdrawals,
      statementEnding: ending,
      reconcilingItems: scenario.reconciling || null,
      exceptionNote: scenario.exceptionNote ?? null,
      resolutionNote: scenario.resolutionNote ?? null,
    });
    if (scenario.resolutionNote) {
      await runCashProofAction(company.id, admin.id, { action: 'update-sample', engagementId, sampleId: sample.id, clear: true });
    }
  }

  await prisma.company.update({
    where: { id: company.id },
    data: { userDefinedAllocations: upsertDataRoomState(company2.userDefinedAllocations, { documentIndex }) },
  });

  const operating = state.accounts.find((a) => accountKind(a.accountName) === 'operating');
  for (const event of OPERATING_EVENTS) {
    await runCashProofAction(company.id, admin.id, {
      action: 'add-revenue-adjustment',
      engagementId,
      bankAccountId: operating?.id ?? null,
      ...event,
    });
  }
  await runCashProofAction(company.id, admin.id, {
    action: 'set-revenue-period-note',
    engagementId,
    periodKey: 'FY2024',
    note: FY2024_NOTE,
  });

  state = await loadCashProofState(company.id);
  console.log(`Uploaded ${uploaded} mock statements to the Bank Statements folder.`);
  console.log('Summary:', state.summary);
  for (const p of [...state.revenueReconciliation!.periods, state.revenueReconciliation!.total]) {
    console.log(
      p.label.padEnd(32),
      'deposits', p.bankDeposits.toFixed(0).padStart(12),
      'non-rev', p.nonRevenueDeposits.toFixed(0).padStart(12),
      'implied', String(p.impliedRevenue?.toFixed(0)).padStart(11),
      'reported', String(p.reportedRevenue?.toFixed(0)).padStart(11),
      'diff', String(p.difference?.toFixed(0)).padStart(9),
      `${p.variancePct?.toFixed(2)}%`.padStart(8),
      p.status,
    );
  }
  for (const s of state.samples.filter((x) => x.status !== 'TIED')) {
    console.log(s.status, accountsById.get(s.bankAccountId)?.accountName, s.month, 'difference', s.tieOut.difference);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
