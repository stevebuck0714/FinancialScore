/** Matching statement accounts (bank + last 4) to Cash Proof bank accounts. Shared by server and client. */

const FILLER_WORDS = new Set(['the', 'bank', 'na', 'online', 'business', 'jpmorgan', 'and', 'trust', 'company', 'co']);

/**
 * Compares bank names the way people and providers write them differently:
 * "JPMorgan Chase Bank, N.A." and "Chase", "Citibank Online" and "Citi" compare equal.
 */
export const normalizeBankName = (name: string | null | undefined) =>
  String(name || '')
    .toLowerCase()
    .replace(/n\.\s?a\.?|national association/g, ' ')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .map((w) => (w.length > 4 && w.endsWith('bank') ? w.slice(0, -4) : w))
    .filter((w) => w && !FILLER_WORDS.has(w))
    .join('');

/** Statement accounts in the Data Room, grouped by bank and last 4. */
export type DetectedStatementAccount = {
  key: string;
  bankName: string | null;
  last4: string;
  accountName: string | null;
  months: number;
  files: number;
};

type MatchableAccount = { id: string; bankName: string | null; accountLast4: string | null };

/**
 * Finds the one account a statement belongs to. Last 4 decides; when several accounts share
 * a last 4, the bank name breaks the tie. Returns null when there is no single match.
 */
export function matchStatementAccount<T extends MatchableAccount>(
  accounts: T[],
  last4: string | null | undefined,
  bankName: string | null | undefined,
): { account: T | null; candidates: T[] } {
  if (!last4) return { account: null, candidates: [] };
  const candidates = accounts.filter((a) => a.accountLast4 === last4);
  if (candidates.length === 1) return { account: candidates[0], candidates };
  const bank = normalizeBankName(bankName);
  if (candidates.length > 1 && bank) {
    const byBank = candidates.filter((a) => normalizeBankName(a.bankName) === bank);
    if (byBank.length === 1) return { account: byBank[0], candidates };
  }
  return { account: null, candidates };
}

/** The detected statement account a Cash Proof account is linked to, if any. */
export function linkedStatementAccount(account: MatchableAccount, detected: DetectedStatementAccount[]) {
  if (!account.accountLast4) return null;
  const sameLast4 = detected.filter((d) => d.last4 === account.accountLast4);
  if (sameLast4.length <= 1) return sameLast4[0] ?? null;
  const bank = normalizeBankName(account.bankName);
  return sameLast4.find((d) => normalizeBankName(d.bankName) === bank) ?? null;
}

export function statementAccountLabel(d: Pick<DetectedStatementAccount, 'bankName' | 'last4' | 'accountName'>) {
  return [d.bankName || 'Bank not identified', d.accountName, `x${d.last4}`].filter(Boolean).join(' · ');
}
