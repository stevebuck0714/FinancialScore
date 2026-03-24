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

const ID_KEYS = [
  'accountId',
  'accountID',
  'account_id',
  'acctId',
  'acctID',
  'ACID',
  'Ait1',
  'Ait2',
  'Ait3',
  'Ait4',
  'Ait5',
  'Ait6',
  'Ait7',
  'Ait8',
  'Ait9',
  'Ait0',
];

const CODE_KEYS = [
  'accountCode',
  'account_code',
  'accountNumber',
  'accountNo',
  'acctNo',
  'ACNO',
  'GLAccount',
  'glAccount',
];

const NAME_KEYS = [
  'accountName',
  'name',
  'description',
  'accountDescription',
  'accountDesc',
  'ACNM',
  'text',
];

const CLASS_KEYS = [
  'classification',
  'accountClassification',
  'accountType',
  'type',
  'normalBalance',
  'category',
];

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

function getCaseInsensitiveValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const exact = normalizeText(record[key]);
    if (exact) return exact;
  }
  const lower = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lower.set(key.toLowerCase(), value);
  }
  for (const key of keys) {
    const value = normalizeText(lower.get(key.toLowerCase()));
    if (value) return value;
  }
  return '';
}

function inferClassification(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('revenue') || value.includes('income') || value.includes('sales')) return 'Income';
  if (value.includes('cogs') || value.includes('cost of goods')) return 'Cost of Goods Sold';
  if (value.includes('expense')) return 'Expense';
  if (value.includes('asset')) return 'Asset';
  if (value.includes('liabil')) return 'Liability';
  if (value.includes('equity') || value.includes('capital')) return 'Equity';
  return raw;
}

function getInforCoaRoots(payload: unknown): unknown[] {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
  if (!root) return [payload];

  const glResponses = Array.isArray(root.glResponses) ? root.glResponses : [];
  const chartRoots: unknown[] = [];
  for (const entry of glResponses) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const program = String(row.miProgram || row.program || '').trim().toUpperCase();
    if (program === 'SLCHARTS') {
      chartRoots.push(row.response ?? row);
    }
  }
  if (chartRoots.length > 0) return chartRoots;
  return [payload];
}

function tryExtractAccount(record: Record<string, unknown>): SourceAccount | null {
  const accountId = getCaseInsensitiveValue(record, ID_KEYS);
  const accountCode = getCaseInsensitiveValue(record, CODE_KEYS) || null;
  const accountName = getCaseInsensitiveValue(record, NAME_KEYS);
  const classRaw = getCaseInsensitiveValue(record, CLASS_KEYS);
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

function extractAccountsFromPayload(payload: unknown): SourceAccount[] {
  const queue: unknown[] = getInforCoaRoots(payload);
  const extracted: SourceAccount[] = [];
  let guard = 0;

  while (queue.length > 0 && guard < 25000) {
    guard += 1;
    const node = queue.shift();
    if (!node) continue;

    if (Array.isArray(node)) {
      for (const item of node) queue.push(item);
      continue;
    }

    if (typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;

    const maybeAccount = tryExtractAccount(record);
    if (maybeAccount) extracted.push(maybeAccount);

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') queue.push(value);
    }
  }

  const deduped = new Map<string, SourceAccount>();
  for (const account of extracted) {
    const key = account.accountId.trim().toLowerCase();
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, account);
      continue;
    }
    const existing = deduped.get(key)!;
    // Prefer richer values when duplicates collide.
    if (!existing.accountCode && account.accountCode) existing.accountCode = account.accountCode;
    if ((!existing.accountName || existing.accountName.length < 4) && account.accountName) {
      existing.accountName = account.accountName;
    }
    if (!existing.classification && account.classification) existing.classification = account.classification;
  }

  return Array.from(deduped.values());
}

function isManualClassification(value: unknown): boolean {
  return String(value || '').trim().toLowerCase().startsWith('manual:');
}

async function runInChunks<T>(items: T[], chunkSize: number, worker: (item: T) => Promise<void>): Promise<void> {
  const safeChunkSize = Math.max(1, Math.floor(chunkSize));
  for (let i = 0; i < items.length; i += safeChunkSize) {
    const chunk = items.slice(i, i + safeChunkSize);
    await Promise.all(chunk.map(worker));
  }
}

export async function seedInforAccountMappings(companyId: string, payload: unknown): Promise<SeedSummary> {
  const sourceAccounts = extractAccountsFromPayload(payload);

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
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
      qbAccountClassification: true,
    },
  });

  const byId = new Map<string, (typeof existing)[number]>();
  const byName = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    if (row.qbAccountId) byId.set(row.qbAccountId.trim().toLowerCase(), row);
    byName.set(row.qbAccount.trim().toLowerCase(), row);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const newAccounts: string[] = [];
  const changedAccounts: string[] = [];
  const rowsToCreate: Array<{
    companyId: string;
    qbAccount: string;
    qbAccountId: string;
    qbAccountCode: string | null;
    qbAccountClassification: string | null;
    targetField: string;
    allocationMethod: string;
    confidence: string;
  }> = [];
  const rowsToUpdate: Array<{
    id: string;
    data: {
      qbAccount: string;
      qbAccountId: string;
      qbAccountCode: string | null;
      qbAccountClassification: string | null;
    };
  }> = [];
  const sourceIdSet = new Set(sourceAccounts.map((a) => a.accountId.trim().toLowerCase()));
  const sourceNameSet = new Set(sourceAccounts.map((a) => a.accountName.trim().toLowerCase()));

  for (const source of sourceAccounts) {
    const idKey = source.accountId.trim().toLowerCase();
    const nameKey = source.accountName.trim().toLowerCase();
    const existingById = byId.get(idKey);
    const existingByName = byName.get(nameKey);
    const existingRow = existingById || existingByName;

    if (!existingRow) {
      rowsToCreate.push({
        companyId,
        qbAccount: source.accountName,
        qbAccountId: source.accountId,
        qbAccountCode: source.accountCode,
        qbAccountClassification: source.classification,
        targetField: 'unmapped',
        allocationMethod: 'manual',
        confidence: 'low',
      });
      created += 1;
      newAccounts.push(source.accountName);
      continue;
    }

    const next = {
      qbAccount: source.accountName,
      qbAccountId: source.accountId,
      qbAccountCode: source.accountCode,
      qbAccountClassification: isManualClassification(existingRow.qbAccountClassification)
        ? existingRow.qbAccountClassification
        : source.classification,
    };
    const changed =
      (existingRow.qbAccount || '') !== (next.qbAccount || '') ||
      (existingRow.qbAccountId || '') !== (next.qbAccountId || '') ||
      (existingRow.qbAccountCode || '') !== (next.qbAccountCode || '') ||
      (existingRow.qbAccountClassification || '') !== (next.qbAccountClassification || '');

    if (!changed) {
      unchanged += 1;
      continue;
    }

    rowsToUpdate.push({
      id: existingRow.id,
      data: next,
    });
    updated += 1;
    changedAccounts.push(source.accountName);
  }

  if (rowsToCreate.length > 0) {
    await prisma.accountMapping.createMany({ data: rowsToCreate as any });
  }
  if (rowsToUpdate.length > 0) {
    await runInChunks(rowsToUpdate, 25, async (row) => {
      await prisma.accountMapping.update({
        where: { id: row.id },
        data: row.data,
      });
    });
  }

  const inactiveAccounts = existing
    .filter((row) => {
      const idKey = row.qbAccountId ? row.qbAccountId.trim().toLowerCase() : '';
      const nameKey = row.qbAccount.trim().toLowerCase();
      if (idKey && sourceIdSet.has(idKey)) return false;
      if (sourceNameSet.has(nameKey)) return false;
      return true;
    })
    .map((row) => row.qbAccount);

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
