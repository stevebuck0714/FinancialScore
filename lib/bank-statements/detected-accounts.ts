import prisma from '@/lib/prisma';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { normalizeBankName, type DetectedStatementAccount } from './account-match';
import { parseBankActivity } from './providers';

type Entry = { bankName: string | null; last4: string; accountName: string | null; months: Set<string>; files: Set<string> };

/**
 * Every bank account the Bank Statements folder has statements for: bank connection files,
 * read PDFs, and accepted transaction files. Files without a bank name join the one account
 * with the same last 4 when there is exactly one.
 */
export async function loadDetectedStatementAccounts(companyId: string): Promise<DetectedStatementAccount[]> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
  const ids = (getDataRoomState(company?.userDefinedAllocations).documentIndex as Array<Record<string, unknown>>)
    .filter((e) => String(e?.folderId || '') === DATAROOM_BANK_STATEMENTS_FOLDER_ID)
    .map((e) => String(e?.documentId || ''))
    .filter(Boolean);
  if (ids.length === 0) return [];
  const [docs, names] = await Promise.all([
    prisma.dataRoomDocument.findMany({
      where: { companyId, id: { in: ids } },
      select: {
        id: true,
        statementSource: true,
        statementInstitution: true,
        statementAccountLast4: true,
        statementMonth: true,
        bankActivity: true,
        reviewStatus: true,
      },
    }),
    prisma.bankTransaction.groupBy({
      by: ['institution', 'accountLast4', 'accountName'],
      where: { companyId, dataRoomDocumentId: { in: ids }, accountLast4: { not: null } },
    }),
  ]);

  const entries = new Map<string, Entry>();
  const add = (bankName: string | null, last4: string | null, accountName: string | null, month: string | null, docId: string | null) => {
    if (!last4 || !/^\d{4}$/.test(last4)) return;
    const key = `${normalizeBankName(bankName)}|${last4}`;
    const entry = entries.get(key) ?? { bankName: bankName || null, last4, accountName: null, months: new Set(), files: new Set() };
    if (!entry.accountName && accountName) entry.accountName = accountName;
    if (month) entry.months.add(month);
    if (docId) entry.files.add(docId);
    entries.set(key, entry);
  };

  for (const doc of docs) {
    if (doc.statementSource === 'UPLOAD_EXPORT' && doc.reviewStatus !== 'ACCEPTED') continue;
    const activity = parseBankActivity(doc.bankActivity);
    if (activity.length > 0) {
      for (const a of activity) add(doc.statementInstitution, a.last4, a.accountName, a.month, doc.id);
    } else {
      add(doc.statementInstitution, doc.statementAccountLast4, null, doc.statementMonth, doc.id);
    }
  }
  for (const n of names) {
    const key = `${normalizeBankName(n.institution)}|${n.accountLast4}`;
    const entry = entries.get(key);
    if (entry && !entry.accountName && n.accountName) entry.accountName = n.accountName;
  }

  for (const [key, entry] of entries) {
    if (entry.bankName) continue;
    const named = [...entries.values()].filter((e) => e.bankName && e.last4 === entry.last4);
    if (named.length !== 1) continue;
    for (const m of entry.months) named[0].months.add(m);
    for (const f of entry.files) named[0].files.add(f);
    if (!named[0].accountName) named[0].accountName = entry.accountName;
    entries.delete(key);
  }

  return [...entries.entries()]
    .map(([key, e]) => ({ key, bankName: e.bankName, last4: e.last4, accountName: e.accountName, months: e.months.size, files: e.files.size }))
    .sort((a, b) => (a.bankName || '~').localeCompare(b.bankName || '~') || a.last4.localeCompare(b.last4));
}
