import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

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
  'acct',
  'Acct',
  'account',
  'Account',
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
  'acct',
  'Acct',
  'account',
  'Account',
  'ACNO',
  'GLAccount',
  'glAccount',
];

const NAME_KEYS = [
  'accountName',
  'name',
  'description',
  'Description',
  'ChaDescription',
  'FRDerDescription',
  'accountDescription',
  'accountDesc',
  'ACNM',
  'text',
];

const CLASS_KEYS = [
  'classification',
  'accountClassification',
  'accountType',
  'AcctType',
  'AccountType',
  'type',
  'Type',
  'normalBalance',
  'category',
];

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

function normalizeIdentityToken(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function buildAccountIdentityKey(account: {
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
}): string {
  const idOrCode = normalizeIdentityToken(account.accountId) || normalizeIdentityToken(account.accountCode);
  const name = normalizeIdentityToken(account.accountName);
  if (idOrCode && name) return `${idOrCode}|${name}`;
  return idOrCode || name;
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

  // Second-pass dedupe by account identity (account number/id + name),
  // not name alone. Two distinct IDs can legitimately share a label.
  const dedupedByIdentity = new Map<string, SourceAccount>();
  for (const account of deduped.values()) {
    const identityKey = buildAccountIdentityKey(account);
    if (!identityKey) continue;
    const existing = dedupedByIdentity.get(identityKey);
    if (!existing) {
      dedupedByIdentity.set(identityKey, account);
      continue;
    }
    if (!existing.accountCode && account.accountCode) existing.accountCode = account.accountCode;
    if (!existing.classification && account.classification) existing.classification = account.classification;
    // Prefer a more explicit ID token over a fallback name-derived ID.
    if (
      existing.accountId.trim().toLowerCase() === existing.accountName.trim().toLowerCase() &&
      account.accountId.trim().toLowerCase() !== account.accountName.trim().toLowerCase()
    ) {
      existing.accountId = account.accountId;
    }
  }

  return Array.from(dedupedByIdentity.values());
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
      accountName: true,
      accountId: true,
      accountCode: true,
      accountClassification: true,
    },
  });

  const byId = new Map<string, (typeof existing)[number]>();
  const byCode = new Map<string, (typeof existing)[number]>();
  const byIdentity = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    const idKey = normalizeIdentityToken(row.accountId);
    const codeKey = normalizeIdentityToken(row.accountCode);
    const identityKey = buildAccountIdentityKey({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
    });
    if (idKey) byId.set(idKey, row);
    if (codeKey) byCode.set(codeKey, row);
    if (identityKey) byIdentity.set(identityKey, row);
  }

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const newAccounts: string[] = [];
  const changedAccounts: string[] = [];
  const rowsToCreate: Array<{
    companyId: string;
    accountName: string;
    accountId: string;
    accountCode: string | null;
    accountClassification: string | null;
    targetField: string;
    allocationMethod: string;
    confidence: string;
  }> = [];
  const rowsToUpdate: Array<{
    id: string;
    data: {
      accountName: string;
      accountId: string;
      accountCode: string | null;
      accountClassification: string | null;
    };
  }> = [];
  const sourceIdSet = new Set(sourceAccounts.map((a) => a.accountId.trim().toLowerCase()));
  const sourceIdentitySet = new Set(sourceAccounts.map((a) => buildAccountIdentityKey(a)).filter(Boolean));
  const pendingCreateIdentitySet = new Set<string>();

  for (const source of sourceAccounts) {
    const idKey = source.accountId.trim().toLowerCase();
    const codeKey = normalizeIdentityToken(source.accountCode);
    const identityKey = buildAccountIdentityKey(source);
    const existingById = byId.get(idKey);
    const existingByCode = codeKey ? byCode.get(codeKey) : undefined;
    const existingByIdentity = identityKey ? byIdentity.get(identityKey) : undefined;
    const existingRow = existingById || existingByCode || existingByIdentity;

    if (!existingRow) {
      if (identityKey && pendingCreateIdentitySet.has(identityKey)) {
        unchanged += 1;
        continue;
      }
      rowsToCreate.push({
        companyId,
        accountName: source.accountName,
        accountId: source.accountId,
        accountCode: source.accountCode,
        accountClassification: source.classification,
        targetField: 'unmapped',
        allocationMethod: 'manual',
        confidence: 'low',
      });
      if (identityKey) pendingCreateIdentitySet.add(identityKey);
      created += 1;
      newAccounts.push(source.accountName);
      continue;
    }

    const next = {
      accountName: source.accountName,
      accountId: source.accountId,
      accountCode: source.accountCode,
      accountClassification: isManualClassification(existingRow.accountClassification)
        ? existingRow.accountClassification
        : source.classification,
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

    rowsToUpdate.push({
      id: existingRow.id,
      data: next,
    });
    updated += 1;
    changedAccounts.push(source.accountName);
  }

  if (rowsToCreate.length > 0) {
    await prisma.accountMapping.createMany({ data: rowsToCreate });
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
      const idKey = row.accountId ? row.accountId.trim().toLowerCase() : '';
      const identityKey = buildAccountIdentityKey({
        accountId: row.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
      });
      if (idKey && sourceIdSet.has(idKey)) return false;
      if (identityKey && sourceIdentitySet.has(identityKey)) return false;
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

export type DiscoveredInforAccount = {
  accountId: string;
  accountName?: string | null;
  classification?: string | null;
};

export function classifyInforGlAccountType(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === 'A' || /asset/i.test(value)) return 'Asset';
  if (upper === 'L' || /liab/i.test(value)) return 'Liability';
  if (upper === 'E' || /expens/i.test(value)) return 'Expense';
  if (upper === 'R' || upper === 'I' || /revenue|income|sales/i.test(value)) return 'Income';
  if (upper === 'Q' || /equity|capital/i.test(value)) return 'Equity';
  return inferClassification(value);
}

export function mergeAccountSnapshotRows(
  existing: Array<{
    accountId: string;
    accountName: string;
    accountCode?: string | null;
    classification?: string | null;
  }>,
  incoming: Array<{
    accountId: string;
    accountName: string;
    accountCode?: string | null;
    classification?: string | null;
  }>,
): Array<{
  accountId: string;
  accountName: string;
  accountCode: string | null;
  classification: string | null;
}> {
  const byId = new Map<
    string,
    {
      accountId: string;
      accountName: string;
      accountCode: string | null;
      classification: string | null;
    }
  >();
  for (const row of existing) {
    const key = normalizeIdentityToken(row.accountId);
    if (!key) continue;
    byId.set(key, {
      accountId: String(row.accountId || '').trim(),
      accountName: String(row.accountName || '').trim(),
      accountCode: row.accountCode ? String(row.accountCode).trim() : null,
      classification: row.classification ? String(row.classification).trim() : null,
    });
  }
  for (const row of incoming) {
    const key = normalizeIdentityToken(row.accountId);
    if (!key || byId.has(key)) continue;
    const accountName = String(row.accountName || '').trim();
    if (!accountName) continue;
    byId.set(key, {
      accountId: String(row.accountId || '').trim(),
      accountName,
      accountCode: row.accountCode ? String(row.accountCode).trim() : null,
      classification: row.classification ? String(row.classification).trim() : null,
    });
  }
  return Array.from(byId.values());
}

/**
 * Create unmapped AccountMapping rows for CSI/M3 accounts that already posted
 * to GL (or arrived on the chart master) but were never seeded by a COA pull.
 * Data Mapping only listed the last COA snapshot, so new accounts were
 * ingested, skipped by P&L rebuilds, and never shown in the mapping table.
 */
export async function ensureUnmappedInforAccountMappings(
  companyId: string,
  discovered: DiscoveredInforAccount[] = [],
): Promise<{ created: number; createdAccountIds: string[] }> {
  const trimmedCompanyId = String(companyId || '').trim();
  if (!trimmedCompanyId) return { created: 0, createdAccountIds: [] };

  const existing = await prisma.accountMapping.findMany({
    where: { companyId: trimmedCompanyId },
    select: { accountId: true },
  });
  const existingIds = new Set(
    existing.map((row) => normalizeIdentityToken(row.accountId)).filter(Boolean),
  );

  const missingFromGl = await prisma.$queryRaw<
    Array<{ accountId: string; accountName: string | null }>
  >`
    SELECT
      g."accountId",
      MAX(NULLIF(BTRIM(COALESCE(g."accountName", '')), '')) AS "accountName"
    FROM "GLTransactionFact" g
    WHERE g."companyId" = ${trimmedCompanyId}
      AND NULLIF(BTRIM(g."accountId"), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "AccountMapping" am
        WHERE am."companyId" = g."companyId"
          AND am."accountId" = g."accountId"
      )
    GROUP BY g."accountId"
  `;

  const pending = new Map<string, DiscoveredInforAccount>();
  for (const row of [...discovered, ...missingFromGl]) {
    const accountId = String(row.accountId || '').trim();
    const key = normalizeIdentityToken(accountId);
    if (!key || existingIds.has(key) || pending.has(key)) continue;
    pending.set(key, {
      accountId,
      accountName: String(row.accountName || '').trim() || `Account ${accountId}`,
      classification: 'classification' in row ? classifyInforGlAccountType(row.classification) : null,
    });
  }

  const rowsToCreate = Array.from(pending.values()).map((row) => ({
    companyId: trimmedCompanyId,
    accountName: String(row.accountName || `Account ${row.accountId}`).trim(),
    accountId: row.accountId,
    accountCode: null as string | null,
    accountClassification: row.classification || null,
    targetField: 'unmapped',
    allocationMethod: 'manual',
    confidence: 'low',
  }));

  if (rowsToCreate.length > 0) {
    await prisma.accountMapping.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    });
    await mergeNewAccountsIntoCoaSnapshot(
      trimmedCompanyId,
      rowsToCreate.map((row) => ({
        accountId: row.accountId,
        accountName: row.accountName,
        accountCode: row.accountCode,
        classification: row.accountClassification,
      })),
    );
  }

  return {
    created: rowsToCreate.length,
    createdAccountIds: rowsToCreate.map((row) => row.accountId),
  };
}

async function mergeNewAccountsIntoCoaSnapshot(
  companyId: string,
  incoming: Array<{
    accountId: string;
    accountName: string;
    accountCode: string | null;
    classification: string | null;
  }>,
): Promise<void> {
  if (incoming.length === 0) return;
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    select: { connectionMetadata: true },
  });
  if (!connection) return;
  const metadata =
    connection.connectionMetadata && typeof connection.connectionMetadata === 'object'
      ? ({ ...(connection.connectionMetadata as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const snapshotKeys = ['inforCsiAccountSeedSnapshot', 'inforM3AccountSeedSnapshot'] as const;
  let changed = false;
  for (const key of snapshotKeys) {
    const current = Array.isArray(metadata[key])
      ? (metadata[key] as Array<{
          accountId: string;
          accountName: string;
          accountCode?: string | null;
          classification?: string | null;
        }>)
      : [];
    if (current.length === 0 && key === 'inforM3AccountSeedSnapshot') continue;
    const merged = mergeAccountSnapshotRows(current, incoming);
    if (merged.length !== current.length) {
      metadata[key] = merged;
      changed = true;
    }
  }
  if (!changed) return;
  await prisma.accountingConnection.update({
    where: {
      companyId_platform: {
        companyId,
        platform: 'INFOR_M3',
      },
    },
    data: { connectionMetadata: metadata as Prisma.InputJsonValue },
  });
}
