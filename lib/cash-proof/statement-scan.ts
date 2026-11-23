import prisma from '@/lib/prisma';
import { extractTextFromArrayBuffer } from '@/lib/company-documents/extract-text';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { readDataRoomBlob } from '@/lib/dataroom/blob-storage';
import { isAggregatorSource, parseBankActivity } from '@/lib/bank-statements/providers';
import { matchStatementAccount } from '@/lib/bank-statements/account-match';
import { detectBankName } from './bank-names';
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

type Doc = {
  id: string;
  originalFileName: string;
  blobUrl: string;
  storageAccess: string;
  contentType: string | null;
  statementMonth: string | null;
  statementAccountLast4: string | null;
  statementInstitution: string | null;
  statementSource: string | null;
  bankActivity: unknown;
  reviewStatus: string | null;
  scanStatus: string;
};

type DocumentRead = { parsed: ParsedStatement[]; bankName?: string | null; failure?: StatementScanResult };

/** Bank data reports and reviewed transaction files carry their monthly figures; they are used as-is. */
function bankActivityStatements(doc: Doc): ParsedStatement[] {
  return parseBankActivity(doc.bankActivity).map((a) => ({
    last4: a.last4,
    month: a.month,
    periodLabel: null,
    beginning: a.beginning,
    deposits: a.deposits,
    withdrawals: a.withdrawals,
    ending: a.ending,
    foots: a.beginning === null || a.ending === null || Math.abs(a.beginning + a.deposits - a.withdrawals - a.ending) <= 0.01,
  }));
}

const ACTIVITY_SOURCES = new Set(['PLAID_ASSETS', 'UPLOAD_EXPORT']);
/** Transaction exports have no balances; only deposits and withdrawals are filled from them. */
const isDepositsOnly = (doc: Doc) => doc.statementSource === 'UPLOAD_EXPORT';
/** Lower wins when two sources disagree on a month's deposits. */
const SOURCE_PRIORITY: Record<string, number> = { PLAID: 0, PLAID_ASSETS: 1 };

async function readDocument(doc: Doc): Promise<DocumentRead> {
  const base = { documentId: doc.id, fileName: doc.originalFileName, bankAccountId: null, month: null, parsed: null };
  if (doc.statementSource === 'UPLOAD_EXPORT') {
    if (doc.reviewStatus === 'REJECTED') return { parsed: [] };
    if (doc.reviewStatus !== 'ACCEPTED') {
      return { parsed: [], failure: { ...base, status: 'NEEDS_REVIEW', message: 'Transaction file has not been reviewed yet. Click Review to confirm its columns and bank account.' } };
    }
    return { parsed: bankActivityStatements(doc) };
  }
  // A report without monthly figures carries transaction detail only; statements cover its accounts.
  if (doc.statementSource === 'PLAID_ASSETS') return { parsed: bankActivityStatements(doc) };
  if (doc.scanStatus !== 'clean') {
    return { parsed: [], failure: { ...base, status: 'PENDING_SCAN', message: 'Waiting for the Data Room virus scan to finish.' } };
  }
  try {
    const extracted = await extractTextFromArrayBuffer({
      arrayBuffer: await readDataRoomBlob(doc),
      contentType: doc.contentType,
      fileName: doc.originalFileName,
    });
    if (extracted.status === 'FAILED') throw new Error(extracted.error);
    if (extracted.status === 'NO_TEXT' || extracted.text.length < 40) {
      return {
        parsed: [],
        failure: { ...base, status: 'NO_TEXT', message: 'No readable text. This looks like a scanned image; enter the figures by hand.' },
      };
    }
    const parsed = parseBankStatement(extracted.text, doc.originalFileName);
    // The account number from a bank connector is authoritative; statement text can name several accounts.
    if (isAggregatorSource(doc.statementSource) && doc.statementAccountLast4) parsed.last4 = doc.statementAccountLast4;
    return { parsed: [parsed], bankName: detectBankName(extracted.text) };
  } catch (e) {
    return { parsed: [], failure: { ...base, status: 'FAILED', message: e instanceof Error ? e.message : String(e) } };
  }
}

function missingFigures(p: ParsedStatement, depositsOnly: boolean): string[] {
  const missing: string[] = [];
  if (!p.last4) missing.push('account last 4');
  if (!p.month) missing.push('statement period');
  if (p.beginning === null && !depositsOnly) missing.push('beginning balance');
  if (p.deposits === null) missing.push('deposits');
  if (p.withdrawals === null) missing.push('withdrawals');
  if (p.ending === null && !depositsOnly) missing.push('ending balance');
  return missing;
}

/**
 * When sources disagree on an account-month's deposits, the bank connection wins and the others are
 * flagged. With no bank-connection figure, every disagreeing source is flagged and none is applied.
 */
function sourceConflicts(items: Array<{ doc: Doc; parsed: ParsedStatement | null }>): Map<ParsedStatement, string> {
  const groups = new Map<string, Array<{ doc: Doc; parsed: ParsedStatement }>>();
  for (const { doc, parsed } of items) {
    if (!parsed?.last4 || !parsed.month || parsed.deposits === null) continue;
    const key = `${parsed.last4}|${parsed.month}`;
    groups.set(key, [...(groups.get(key) ?? []), { doc, parsed }]);
  }
  const out = new Map<ParsedStatement, string>();
  for (const group of groups.values()) {
    if (new Set(group.map((g) => round2(g.parsed.deposits!))).size < 2) continue;
    const ranked = [...group].sort((a, b) => (SOURCE_PRIORITY[a.doc.statementSource || ''] ?? 9) - (SOURCE_PRIORITY[b.doc.statementSource || ''] ?? 9));
    const winner = (SOURCE_PRIORITY[ranked[0].doc.statementSource || ''] ?? 9) < 9 ? ranked[0] : null;
    const listing = group.map((g) => `${g.doc.originalFileName} ${fmt(g.parsed.deposits)}`).join('; ');
    for (const g of group) {
      if (g === winner || (winner && same(g.parsed.deposits, winner.parsed.deposits))) continue;
      out.set(
        g.parsed,
        winner
          ? `Deposits of ${fmt(g.parsed.deposits)} differ from the bank connection (${fmt(winner.parsed.deposits)}, ${winner.doc.originalFileName}); bank figures used.`
          : `Files disagree on deposits for this month (${listing}). Resolve before entering.`,
      );
    }
  }
  return out;
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
      select: {
        id: true,
        originalFileName: true,
        blobUrl: true,
        storageAccess: true,
        contentType: true,
        statementMonth: true,
        statementAccountLast4: true,
        statementInstitution: true,
        statementSource: true,
        bankActivity: true,
        reviewStatus: true,
      },
      orderBy: { originalFileName: 'asc' },
    })
  ).map((d) => ({ ...d, scanStatus: scanStatusById.get(d.id) || '' }));

  const reads = await mapLimit(docs, CONCURRENCY, readDocument);

  await Promise.all(
    docs.map((doc, i) => {
      if (ACTIVITY_SOURCES.has(doc.statementSource || '')) return null;
      const parsed = reads[i].parsed[0] ?? null;
      // A period read from the statement wins: bank connectors label statements by statement date.
      const month = (parsed?.periodLabel ? parsed.month : null) || doc.statementMonth || parsed?.month || null;
      const last4 = doc.statementAccountLast4 || parsed?.last4 || null;
      const institution = doc.statementInstitution || reads[i].bankName || null;
      if (month === doc.statementMonth && last4 === doc.statementAccountLast4 && institution === doc.statementInstitution) return null;
      doc.statementInstitution = institution;
      return prisma.dataRoomDocument.update({
        where: { id: doc.id },
        data: { statementMonth: month, statementAccountLast4: last4, statementInstitution: institution },
      });
    }),
  );

  const samples = new Map(engagement.samples.map((s) => [`${s.bankAccountId}|${s.month}`, s]));
  const deposits = new Map<string, (typeof engagement.bankAccounts)[number]['deposits'][number]>(
    engagement.bankAccounts.flatMap((a) => a.deposits.map((d) => [`${a.id}|${d.month}`, d] as [string, typeof d])),
  );
  const results: StatementScanResult[] = [];

  const items = docs.flatMap((doc, i) =>
    reads[i].failure ? [{ doc, parsed: null, failure: reads[i].failure }] : reads[i].parsed.map((parsed) => ({ doc, parsed, failure: undefined })),
  );
  const outvoted = sourceConflicts(items);
  for (const { doc, parsed, failure } of items) {
    if (failure || !parsed) {
      results.push(failure!);
      continue;
    }
    const result = (status: StatementScanStatus, message: string, bankAccountId: string | null = null) =>
      results.push({ documentId: doc.id, fileName: doc.originalFileName, status, message, bankAccountId, month: parsed.month, parsed });

    const conflict = outvoted.get(parsed);
    if (conflict) {
      result('CONFLICT', conflict);
      continue;
    }
    const depositsOnly = isDepositsOnly(doc);
    const missing = missingFigures(parsed, depositsOnly);
    if (missing.length > 0) {
      result('NEEDS_REVIEW', `Could not read ${missing.join(', ')}.`);
      continue;
    }
    if (!parsed.foots) {
      const off = round2(parsed.beginning! + parsed.deposits! - parsed.withdrawals! - parsed.ending!);
      result('NEEDS_REVIEW', `Figures read do not foot (off by ${fmt(off)}). Check the statement and enter it by hand.`);
      continue;
    }
    const { account, candidates } = matchStatementAccount(engagement.bankAccounts, parsed.last4, doc.statementInstitution);
    if (!account) {
      result(
        'UNMATCHED',
        candidates.length === 0
          ? `No included account has last 4 ${parsed.last4}. Link the statement account on the account in the balance grid.`
          : `More than one included account has last 4 ${parsed.last4}, and the bank name does not tell them apart.`,
      );
      continue;
    }
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
      const fields = (Object.keys(read) as Array<keyof typeof read>).filter((f) => read[f] !== null);
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
