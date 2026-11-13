import prisma from '@/lib/prisma';
import { extractTextFromArrayBuffer } from '@/lib/company-documents/extract-text';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { shiftMonth } from './book-balances';
import { parseBankStatement, type ParsedStatement } from './statement-parser';
import { computeTieOut } from './tie-out';

export type StatementScanStatus =
  | 'APPLIED'
  | 'VERIFIED'
  | 'CONFLICT'
  | 'NEEDS_REVIEW'
  | 'UNMATCHED'
  | 'NO_TEXT'
  | 'FAILED'
  | 'PENDING_SCAN';

export type StatementScanResult = {
  documentId: string;
  fileName: string;
  status: StatementScanStatus;
  message: string;
  bankAccountId: string | null;
  month: string | null;
  parsed: ParsedStatement | null;
};

export type StatementScan = { scannedAt: string; results: StatementScanResult[] };

const CONCURRENCY = 6;
const round2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= 0.01;
const fmt = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

type Doc = { id: string; originalFileName: string; blobUrl: string; contentType: string | null; scanStatus: string };

async function readDocument(doc: Doc): Promise<{ parsed: ParsedStatement | null; failure?: StatementScanResult }> {
  const base = { documentId: doc.id, fileName: doc.originalFileName, bankAccountId: null, month: null, parsed: null };
  if (doc.scanStatus !== 'clean') {
    return { parsed: null, failure: { ...base, status: 'PENDING_SCAN', message: 'Waiting for the Data Room virus scan to finish.' } };
  }
  try {
    const res = await fetch(doc.blobUrl);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const extracted = await extractTextFromArrayBuffer({
      arrayBuffer: await res.arrayBuffer(),
      contentType: doc.contentType,
      fileName: doc.originalFileName,
    });
    if (extracted.status === 'FAILED') throw new Error(extracted.error);
    if (extracted.status === 'NO_TEXT' || extracted.text.length < 40) {
      return {
        parsed: null,
        failure: { ...base, status: 'NO_TEXT', message: 'No readable text. This looks like a scanned image; enter the figures by hand.' },
      };
    }
    return { parsed: parseBankStatement(extracted.text, doc.originalFileName) };
  } catch (e) {
    return { parsed: null, failure: { ...base, status: 'FAILED', message: e instanceof Error ? e.message : String(e) } };
  }
}

function missingFigures(p: ParsedStatement): string[] {
  const missing: string[] = [];
  if (!p.last4) missing.push('account last 4');
  if (!p.month) missing.push('statement period');
  if (p.beginning === null) missing.push('beginning balance');
  if (p.deposits === null) missing.push('deposits');
  if (p.withdrawals === null) missing.push('withdrawals');
  if (p.ending === null) missing.push('ending balance');
  return missing;
}

/**
 * Reads every statement in the Data Room Bank Statements folder, matches it to
 * an included account (by last 4) and month, and fills in figures that are still
 * blank. Entered figures are never overwritten; disagreements are reported.
 */
export async function scanBankStatements(companyId: string, engagementId: string, userId: string): Promise<StatementScan> {
  const engagement = await prisma.cashProofEngagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: {
      bankAccounts: { where: { included: true }, include: { deposits: true, bookBalances: true } },
      samples: true,
    },
  });
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
  const index = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>).filter(
    (e) => String(e?.folderId || '') === DATAROOM_BANK_STATEMENTS_FOLDER_ID,
  );
  const scanStatusById = new Map(index.map((e) => [String(e.documentId || ''), String(e.scanStatus || '')]));
  const docs: Doc[] = (
    await prisma.dataRoomDocument.findMany({
      where: { companyId, id: { in: [...scanStatusById.keys()] } },
      select: { id: true, originalFileName: true, blobUrl: true, contentType: true },
      orderBy: { originalFileName: 'asc' },
    })
  ).map((d) => ({ ...d, scanStatus: scanStatusById.get(d.id) || '' }));

  const reads = await mapLimit(docs, CONCURRENCY, readDocument);

  const samples = new Map(engagement.samples.map((s) => [`${s.bankAccountId}|${s.month}`, s]));
  const deposits = new Map<string, (typeof engagement.bankAccounts)[number]['deposits'][number]>(
    engagement.bankAccounts.flatMap((a) => a.deposits.map((d) => [`${a.id}|${d.month}`, d] as [string, typeof d])),
  );
  const results: StatementScanResult[] = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const { parsed, failure } = reads[i];
    if (failure || !parsed) {
      results.push(failure!);
      continue;
    }
    const result = (status: StatementScanStatus, message: string, bankAccountId: string | null = null) =>
      results.push({ documentId: doc.id, fileName: doc.originalFileName, status, message, bankAccountId, month: parsed.month, parsed });

    const missing = missingFigures(parsed);
    if (missing.length > 0) {
      result('NEEDS_REVIEW', `Could not read ${missing.join(', ')}.`);
      continue;
    }
    if (!parsed.foots) {
      const off = round2(parsed.beginning! + parsed.deposits! - parsed.withdrawals! - parsed.ending!);
      result('NEEDS_REVIEW', `Figures read do not foot (off by ${fmt(off)}). Check the statement and enter it by hand.`);
      continue;
    }
    const accounts = engagement.bankAccounts.filter((a) => a.accountLast4 === parsed.last4);
    if (accounts.length === 0) {
      result('UNMATCHED', `No included account has last 4 ${parsed.last4}. Set Last 4 on the account in the balance grid.`);
      continue;
    }
    if (accounts.length > 1) {
      result('UNMATCHED', `More than one included account has last 4 ${parsed.last4}.`);
      continue;
    }
    const account = accounts[0];
    const month = parsed.month!;
    if (month < engagement.periodStartMonth || month > engagement.periodEndMonth) {
      result('UNMATCHED', 'Statement month is outside the review period.', account.id);
      continue;
    }
    const key = `${account.id}|${month}`;
    const sample = samples.get(key);

    if (sample) {
      const entered = {
        statementBeginning: sample.statementBeginning,
        statementDeposits: sample.statementDeposits,
        statementWithdrawals: sample.statementWithdrawals,
        statementEnding: sample.statementEnding,
      };
      const read = {
        statementBeginning: parsed.beginning,
        statementDeposits: parsed.deposits,
        statementWithdrawals: parsed.withdrawals,
        statementEnding: parsed.ending,
      };
      const labels = { statementBeginning: 'beginning', statementDeposits: 'deposits', statementWithdrawals: 'withdrawals', statementEnding: 'ending' };
      const fields = Object.keys(read) as Array<keyof typeof read>;
      const conflicts = fields.filter((f) => entered[f] !== null && !same(entered[f], read[f]));
      const otherDoc = sample.dataRoomDocumentId && sample.dataRoomDocumentId !== doc.id;
      if (conflicts.length > 0) {
        result(
          'CONFLICT',
          `Sampled statement already entered with different ${conflicts.map((f) => `${labels[f]} (${fmt(entered[f])} entered, ${fmt(read[f])} read)`).join(', ')}.`,
          account.id,
        );
        continue;
      }
      const blanks = fields.filter((f) => entered[f] === null);
      if (blanks.length === 0) {
        if (!sample.dataRoomDocumentId) {
          await prisma.cashProofSample.update({ where: { id: sample.id }, data: { dataRoomDocumentId: doc.id } });
          sample.dataRoomDocumentId = doc.id;
        }
        result('VERIFIED', otherDoc ? 'Matches the sampled statement (another file is linked).' : 'Matches the figures entered for this sampled month.', account.id);
        continue;
      }
      const data: Record<string, unknown> = Object.fromEntries(blanks.map((f) => [f, read[f]]));
      if (!sample.dataRoomDocumentId) data.dataRoomDocumentId = doc.id;
      data.enteredByUserId = userId;
      data.enteredAt = new Date();
      const merged = { ...sample, ...data } as typeof sample;
      const book = account.bookBalances.find((b) => b.month === month)?.endingBalance ?? null;
      const prior = samples.get(`${account.id}|${shiftMonth(month, -1)}`);
      data.status = computeTieOut(merged, book, prior?.statementEnding ?? null, engagement.balanceTolerance).status;
      await prisma.cashProofSample.update({ where: { id: sample.id }, data });
      samples.set(key, { ...merged, status: String(data.status) });
      result('APPLIED', `Filled in the sampled statement (${String(data.status).toLowerCase()}).`, account.id);
      continue;
    }

    const existing = deposits.get(key);
    if (existing) {
      if (!same(existing.totalDeposits, parsed.deposits)) {
        result('CONFLICT', `Deposits already entered as ${fmt(existing.totalDeposits)}; statement shows ${fmt(parsed.deposits)}.`, account.id);
        continue;
      }
      if (!existing.dataRoomDocumentId) {
        await prisma.cashProofDeposit.update({ where: { id: existing.id }, data: { dataRoomDocumentId: doc.id } });
        existing.dataRoomDocumentId = doc.id;
      }
      result('VERIFIED', 'Matches the deposits entered for this month.', account.id);
      continue;
    }
    const created = await prisma.cashProofDeposit.create({
      data: { bankAccountId: account.id, month, totalDeposits: parsed.deposits!, dataRoomDocumentId: doc.id, enteredByUserId: userId },
    });
    deposits.set(key, created);
    result('APPLIED', `Entered deposits of ${fmt(parsed.deposits)}.`, account.id);
  }

  const scan: StatementScan = { scannedAt: new Date().toISOString(), results };
  await prisma.cashProofEngagement.update({ where: { id: engagementId }, data: { statementScan: scan } });
  return scan;
}
