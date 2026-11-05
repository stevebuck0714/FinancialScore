function lookupString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

export function qbdLookupKey(value: unknown): string {
  return lookupString(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function qbdAccountLookupKeys(value: unknown): string[] {
  const raw = lookupString(value);
  if (!raw) return [];
  const keys = new Set<string>();
  const add = (candidate: unknown) => {
    const key = qbdLookupKey(candidate);
    if (key) keys.add(key);
  };
  add(raw);

  // QBD reports prefix every hierarchy segment with its account number
  // ("BGAHLLC Equity Accounts:Amy Shu Inc:Contributions:30101 · Member
  // Contributions"), while mappings store the bare FullName and the number
  // separately. Try the row's own name and number before the looser keys
  // below, which can otherwise resolve a child row to its parent's code.
  const segments = raw.split(':').map((part) => part.trim()).filter(Boolean);
  const parsedSegments = segments.map((segment) => {
    const match = segment.match(/^([0-9A-Za-z][0-9A-Za-z.\-]*)\s+(?:&#183;|·)\s+(.+)$/);
    return match ? { code: match[1], name: match[2].trim() } : { code: '', name: segment };
  });
  if (parsedSegments.some((segment) => segment.code)) {
    add(parsedSegments.map((segment) => segment.name).join(':'));
    add(parsedSegments[parsedSegments.length - 1].code);
  }

  // Balance Sheet report labels often include account numbers while stored
  // mappings may carry only the account name, or vice versa.
  const leadingCode = raw.match(/^\s*([0-9][0-9.\-]*)\s+(.+)$/);
  if (leadingCode) {
    add(leadingCode[1]);
    add(leadingCode[2]);
  }
  const parenCode = raw.match(/^(.+?)\s+\(([0-9][0-9.\-]*)\)\s*$/);
  if (parenCode) {
    add(parenCode[1]);
    add(parenCode[2]);
  }
  const colonParts = raw.split(':').map((part) => part.trim()).filter(Boolean);
  if (colonParts.length > 1) {
    add(colonParts[colonParts.length - 1]);
  }

  return Array.from(keys);
}

/** Resolves an account (by ListID, name, or unique account code) to its mapped target field. */
export function qbdBuildMappingTargetLookup(
  mappings: Array<{ accountId?: string | null; accountName?: string | null; accountCode?: string | null; targetField?: string | null }>,
) {
  const targetByKey = new Map<string, string>();
  const accountCodeCounts = new Map<string, number>();
  for (const mapping of mappings) {
    const code = lookupString(mapping.accountCode).toLowerCase();
    if (code) accountCodeCounts.set(code, Number(accountCodeCounts.get(code) || 0) + 1);
  }
  for (const mapping of mappings) {
    const target = lookupString(mapping.targetField);
    const keyValues = [mapping.accountId, mapping.accountName].map(lookupString).filter(Boolean);
    const accountCode = lookupString(mapping.accountCode);
    if (accountCode && accountCodeCounts.get(accountCode.toLowerCase()) === 1) keyValues.push(accountCode);
    for (const key of keyValues) {
      for (const normalized of qbdAccountLookupKeys(key)) {
        targetByKey.set(normalized, target);
      }
    }
  }
  return (ref: { id?: string; name?: unknown }) => {
    for (const candidate of [ref.id, ref.name]) {
      for (const key of qbdAccountLookupKeys(candidate)) {
        const target = targetByKey.get(key);
        if (target) return target;
      }
    }
    return '';
  };
}

export const QBD_DEBIT_NORMAL_ACCOUNT_TYPES = new Set(['bank', 'accountsreceivable', 'othercurrentasset', 'fixedasset', 'otherasset']);
export const QBD_CREDIT_NORMAL_ACCOUNT_TYPES = new Set(['accountspayable', 'creditcard', 'othercurrentliability', 'longtermliability', 'equity']);
export const QBD_CREDIT_NORMAL_TARGET_FIELDS = new Set([
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
]);

export type QbdAccountSide = 'debit' | 'credit' | '';

export function qbdAccountSideForType(accountType: unknown): QbdAccountSide {
  const type = lookupString(accountType).toLowerCase();
  if (QBD_DEBIT_NORMAL_ACCOUNT_TYPES.has(type)) return 'debit';
  if (QBD_CREDIT_NORMAL_ACCOUNT_TYPES.has(type)) return 'credit';
  return '';
}

export function qbdBuildAccountSideLookup(accounts: Record<string, unknown>[]): (accountName: string) => QbdAccountSide {
  const sideByKey = new Map<string, QbdAccountSide>();
  for (const account of accounts) {
    const side = qbdAccountSideForType(account.AccountType);
    if (!side) continue;
    for (const key of qbdAccountLookupKeys(account.FullName || account.Name)) sideByKey.set(key, side);
  }
  return (accountName: string) => {
    for (const key of qbdAccountLookupKeys(accountName)) {
      const side = sideByKey.get(key);
      if (side) return side;
    }
    return '';
  };
}

// QBD balance sheet amounts are positive on the account's normal side. An asset
// mapped into a liability/equity field (or the reverse) must offset that field.
export function qbdSignedBalanceForTarget(balance: number, accountSide: QbdAccountSide, targetField: string): number {
  if (!accountSide) return balance;
  const targetIsCreditNormal = QBD_CREDIT_NORMAL_TARGET_FIELDS.has(targetField);
  if (accountSide === 'debit' && targetIsCreditNormal) return -balance;
  if (accountSide === 'credit' && !targetIsCreditNormal) return -balance;
  return balance;
}
