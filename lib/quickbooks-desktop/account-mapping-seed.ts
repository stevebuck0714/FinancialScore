import prisma from '@/lib/prisma';

type SourceAccount = {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  classification: string | null;
};

type SeedSummary = {
  extracted: number;
  created: number;
  updated: number;
  unchanged: number;
  inactive: number;
  newAccounts: string[];
  changedAccounts: string[];
  inactiveAccounts: string[];
  activeAccountIds: string[];
  accountSnapshot: Array<{
    accountId: string;
    accountName: string;
    accountCode: string | null;
    classification: string | null;
  }>;
};

const ID_KEYS = ['ListID', 'listId', 'listID', 'accountId', 'id'];
const NAME_KEYS = ['FullName', 'fullName', 'Name', 'name', 'accountName'];
const CODE_KEYS = ['AccountNumber', 'accountNumber', 'AccountNo', 'accountCode', 'AcctNum'];
const CLASS_KEYS = ['AccountType', 'accountType', 'SpecialAccountType', 'classification', 'type'];

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

function readValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeText(record[key]);
    if (value) return value;
  }
  const lower = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) {
    lower.set(k.toLowerCase(), v);
  }
  for (const key of keys) {
    const value = normalizeText(lower.get(key.toLowerCase()));
    if (value) return value;
  }
  return '';
}

function inferClassification(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const lc = value.toLowerCase();
  if (lc.includes('income') || lc.includes('revenue') || lc.includes('sales')) return 'Income';
  if (lc.includes('cogs') || lc.includes('cost of goods')) return 'Cost of Goods Sold';
  if (lc.includes('expense')) return 'Expense';
  if (lc.includes('asset')) return 'Asset';
  if (lc.includes('liabil')) return 'Liability';
  if (lc.includes('equity')) return 'Equity';
  return value;
}

function maybeFromRecord(record: Record<string, unknown>): SourceAccount | null {
  const accountId = readValue(record, ID_KEYS);
  const accountName = readValue(record, NAME_KEYS);
  const accountCode = readValue(record, CODE_KEYS) || null;
  const classRaw = readValue(record, CLASS_KEYS);
  const classification = inferClassification(classRaw);
  const identity = accountId || accountCode || accountName;
  if (!identity || !accountName) return null;
  return {
    accountId: accountId || accountCode || accountName,
    accountName,
    accountCode,
    classification,
  };
}

function extractAccounts(payload: unknown): SourceAccount[] {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const accountQuery = root.AccountQuery || root.accountQuery;
  const queue: unknown[] = [accountQuery ?? root];
  const accounts: SourceAccount[] = [];
  let guard = 0;

  while (queue.length > 0 && guard < 100000) {
    guard += 1;
    const node = queue.shift();
    if (!node) continue;

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }
    if (typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;

    if (
      record.AccountRet ||
      record.accountRet ||
      record.ListID ||
      record.listId ||
      record.FullName ||
      record.Name
    ) {
      if (Array.isArray(record.AccountRet)) {
        for (const item of record.AccountRet) queue.push(item);
      } else if (record.AccountRet && typeof record.AccountRet === 'object') {
        queue.push(record.AccountRet);
      }
      if (Array.isArray(record.accountRet)) {
        for (const item of record.accountRet) queue.push(item);
      } else if (record.accountRet && typeof record.accountRet === 'object') {
        queue.push(record.accountRet);
      }
      const parsed = maybeFromRecord(record);
      if (parsed) accounts.push(parsed);
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  const deduped = new Map<string, SourceAccount>();
  for (const account of accounts) {
    const key = account.accountId.trim().toLowerCase();
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, account);
      continue;
    }
    const existing = deduped.get(key)!;
    if (!existing.accountCode && account.accountCode) existing.accountCode = account.accountCode;
    if ((!existing.accountName || existing.accountName.length < 4) && account.accountName) {
      existing.accountName = account.accountName;
    }
    if (!existing.classification && account.classification) existing.classification = account.classification;
  }

  return Array.from(deduped.values());
}

export async function seedQuickBooksDesktopAccountMappings(
  companyId: string,
  payload: unknown,
): Promise<SeedSummary> {
  const sourceAccounts = extractAccounts(payload);
  if (sourceAccounts.length === 0) {
    return {
      extracted: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      inactive: 0,
      newAccounts: [],
      changedAccounts: [],
      inactiveAccounts: [],
      activeAccountIds: [],
      accountSnapshot: [],
    };
  }

  const existing = await prisma.accountMapping.findMany({
    where: { companyId },
    select: {
      id: true,
      accountName: true,
      accountId: true,
      accountCode: true,
      accountClassification: true,
    },
  });

  const byId = new Map<string, (typeof existing)[number]>();
  const byName = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    if (row.accountId) byId.set(row.accountId.trim().toLowerCase(), row);
    byName.set(row.accountName.trim().toLowerCase(), row);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const newAccounts: string[] = [];
  const changedAccounts: string[] = [];
  const sourceIdSet = new Set(sourceAccounts.map((a) => a.accountId.trim().toLowerCase()));
  const sourceNameSet = new Set(sourceAccounts.map((a) => a.accountName.trim().toLowerCase()));

  for (const source of sourceAccounts) {
    const existingRow =
      byId.get(source.accountId.trim().toLowerCase()) ||
      byName.get(source.accountName.trim().toLowerCase());

    if (!existingRow) {
      await prisma.accountMapping.create({
        data: {
          companyId,
          accountName: source.accountName,
          accountId: source.accountId,
          accountCode: source.accountCode,
          accountClassification: source.classification,
          targetField: 'unmapped',
          allocationMethod: 'manual',
          confidence: 'low',
        },
      });
      created += 1;
      newAccounts.push(source.accountName);
      continue;
    }

    const next = {
      accountName: source.accountName,
      accountId: source.accountId,
      accountCode: source.accountCode,
      accountClassification: source.classification,
    };
    const changed =
      (existingRow.accountName || '') !== (next.accountName || '') ||
      (existingRow.accountId || '') !== (next.accountId || '') ||
      (existingRow.accountCode || '') !== (next.accountCode || '') ||
      (existingRow.accountClassification || '') !== (next.accountClassification || '');
    if (!changed) {
      unchanged += 1;
      continue;
    }

    await prisma.accountMapping.update({
      where: { id: existingRow.id },
      data: next,
    });
    updated += 1;
    changedAccounts.push(source.accountName);
  }

  const inactiveAccounts = existing
    .filter((row) => {
      const idKey = row.accountId ? row.accountId.trim().toLowerCase() : '';
      const nameKey = row.accountName.trim().toLowerCase();
      if (idKey && sourceIdSet.has(idKey)) return false;
      if (sourceNameSet.has(nameKey)) return false;
      return true;
    })
    .map((row) => row.accountName);

  return {
    extracted: sourceAccounts.length,
    created,
    updated,
    unchanged,
    inactive: inactiveAccounts.length,
    newAccounts: newAccounts.slice(0, 100),
    changedAccounts: changedAccounts.slice(0, 100),
    inactiveAccounts: inactiveAccounts.slice(0, 100),
    activeAccountIds: sourceAccounts.map((a) => a.accountId),
    accountSnapshot: sourceAccounts.map((a) => ({
      accountId: a.accountId,
      accountName: a.accountName,
      accountCode: a.accountCode,
      classification: a.classification,
    })),
  };
}
