import prisma from '@/lib/prisma';
import { extractTextFromArrayBuffer } from '@/lib/company-documents/extract-text';
import { DATAROOM_TAX_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { readDataRoomBlob } from '@/lib/dataroom/blob-storage';
import { monthRange } from './book-balances';
import { fiscalYearOf } from './revenue-reconciliation';
import { TAX_RETURN_FORMS, type TaxReturnEntry } from './tax-return';
import { parseTaxReturn, taxReturnPeriodKey, type ParsedTaxReturn } from './tax-return-parser';

export type TaxReturnScanStatus =
  | 'APPLIED'
  | 'VERIFIED'
  | 'CONFLICT'
  | 'NEEDS_REVIEW'
  | 'OUT_OF_PERIOD'
  | 'NOT_A_RETURN'
  | 'NO_TEXT'
  | 'FAILED'
  | 'PENDING_SCAN';

export type TaxReturnScanResult = {
  documentId: string;
  fileName: string;
  status: TaxReturnScanStatus;
  message: string;
  periodKey: string | null;
  parsed: ParsedTaxReturn | null;
};

export type TaxReturnScan = { scannedAt: string; results: TaxReturnScanResult[] };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));

/** Complete fiscal years in the review period; returns are only compared for whole years. */
export function completeFiscalYearKeys(periodStartMonth: string, periodEndMonth: string, fiscalYearEndMonth: number): Set<string> {
  const counts = new Map<number, number>();
  for (const month of monthRange(periodStartMonth, periodEndMonth)) {
    const fy = fiscalYearOf(month, fiscalYearEndMonth);
    counts.set(fy, (counts.get(fy) || 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n === 12).map(([fy]) => `FY${fy}`));
}

export async function listTaxFolderDocuments(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
  const index = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>).filter(
    (e) => String(e?.folderId || '') === DATAROOM_TAX_FOLDER_ID,
  );
  const scanStatusById = new Map(index.map((e) => [String(e.documentId || ''), String(e.scanStatus || '')]));
  if (scanStatusById.size === 0) return [];
  const docs = await prisma.dataRoomDocument.findMany({
    where: { companyId, id: { in: [...scanStatusById.keys()] } },
    select: { id: true, originalFileName: true, blobUrl: true, storageAccess: true, contentType: true, createdAt: true },
    orderBy: { originalFileName: 'asc' },
  });
  return docs.map((d) => ({ ...d, scanStatus: scanStatusById.get(d.id) || '' }));
}

/**
 * Reads every file in the Data Room Tax folder, finds business income tax returns,
 * and fills in each fiscal year's gross receipts where none are entered yet.
 * Entered figures are never overwritten; disagreements are reported.
 */
export async function scanTaxReturns(companyId: string, engagementId: string): Promise<TaxReturnScan> {
  const engagement = await prisma.cashProofEngagement.findUniqueOrThrow({ where: { id: engagementId } });
  const periodKeys = completeFiscalYearKeys(engagement.periodStartMonth, engagement.periodEndMonth, engagement.fiscalYearEndMonth);
  const entries = { ...((engagement.taxReturns as Record<string, TaxReturnEntry> | null) || {}) };
  const docs = await listTaxFolderDocuments(companyId);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const results: TaxReturnScanResult[] = [];

  for (const doc of docs) {
    const base = { documentId: doc.id, fileName: doc.originalFileName, periodKey: null, parsed: null };
    if (doc.scanStatus !== 'clean') {
      results.push({ ...base, status: 'PENDING_SCAN', message: 'Waiting for the Data Room virus scan to finish.' });
      continue;
    }
    let parsed: ParsedTaxReturn;
    try {
      const extracted = await extractTextFromArrayBuffer({
        arrayBuffer: await readDataRoomBlob(doc),
        contentType: doc.contentType,
        fileName: doc.originalFileName,
      });
      if (extracted.status === 'FAILED') throw new Error(extracted.error);
      if (extracted.status === 'NO_TEXT' || extracted.text.length < 40) {
        results.push({ ...base, status: 'NO_TEXT', message: 'No readable text. This looks like a scanned image; enter the figures by hand.' });
        continue;
      }
      parsed = parseTaxReturn(extracted.text, doc.originalFileName, company?.name || '');
    } catch (e) {
      results.push({ ...base, status: 'FAILED', message: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const periodKey = taxReturnPeriodKey(parsed, engagement.fiscalYearEndMonth);
    const result = (status: TaxReturnScanStatus, message: string) =>
      results.push({ documentId: doc.id, fileName: doc.originalFileName, status, message, periodKey, parsed });

    if (!parsed.form) {
      result('NOT_A_RETURN', 'Not a business income tax return (no Form 1120-S, 1120, 1065, or Schedule C found).');
      continue;
    }
    if (parsed.ambiguity) {
      result('NEEDS_REVIEW', `${parsed.ambiguity} Enter the figures by hand.`);
      continue;
    }
    const missing = [!periodKey && 'tax year', parsed.grossReceipts === null && 'gross receipts'].filter(Boolean);
    if (missing.length > 0) {
      result('NEEDS_REVIEW', `Could not read ${missing.join(' or ')}. Enter the figures by hand.`);
      continue;
    }
    if (parsed.endingMonth && parsed.endingMonth !== engagement.fiscalYearEndMonth) {
      result(
        'NEEDS_REVIEW',
        `The return's tax year ends in ${MONTH_NAMES[parsed.endingMonth - 1]}, but the cash proof's fiscal year ends in ${MONTH_NAMES[engagement.fiscalYearEndMonth - 1]}.`,
      );
      continue;
    }
    if (!periodKeys.has(periodKey!)) {
      result('OUT_OF_PERIOD', `${periodKey} is not a complete fiscal year in the review period.`);
      continue;
    }

    const existing = entries[periodKey!];
    if (existing && existing.grossReceipts !== null) {
      if (Math.abs(existing.grossReceipts - parsed.grossReceipts!) > 1) {
        result('CONFLICT', `Gross receipts already entered as ${fmt(existing.grossReceipts)}; the return shows ${fmt(parsed.grossReceipts)}.`);
        continue;
      }
      if (!existing.dataRoomDocumentId) entries[periodKey!] = { ...existing, dataRoomDocumentId: doc.id };
      result('VERIFIED', `Matches the gross receipts entered for ${periodKey}.`);
      continue;
    }
    entries[periodKey!] = {
      form: parsed.form,
      basis: existing?.basis ?? 'ACCRUAL',
      grossReceipts: parsed.grossReceipts,
      returnsAllowances: parsed.returnsAllowances,
      dataRoomDocumentId: doc.id,
      source: 'read',
      note: existing?.note ?? null,
      updatedAt: new Date().toISOString(),
    };
    result(
      'APPLIED',
      `Entered ${TAX_RETURN_FORMS[parsed.form].label} gross receipts of ${fmt(parsed.grossReceipts)}${
        parsed.returnsAllowances ? ` less returns and allowances of ${fmt(parsed.returnsAllowances)}` : ''
      } for ${periodKey}.`,
    );
  }

  const scan: TaxReturnScan = { scannedAt: new Date().toISOString(), results };
  await prisma.cashProofEngagement.update({ where: { id: engagementId }, data: { taxReturns: entries, taxReturnScan: scan } });
  return scan;
}
