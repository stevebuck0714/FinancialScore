/**
 * LOC vs long-term debt classification for the Loans page.
 *
 * Account mapping is the source of truth. After a loc → ltd remap, saved loan
 * terms often still say "Line of Credit" and the Loans page may still show an
 * old display name. Those stale labels must not keep the instrument in LOC.
 * Name / saved-term heuristics are only used when targetField is unset.
 */
export function isLocByMappingAndName(input: {
  targetField?: string | null;
  accountId?: string | null;
  displayName?: string | null;
  loanType?: string | null;
  lender?: string | null;
}): boolean {
  const target = String(input.targetField || '').trim().toLowerCase();
  if (target === 'ltd') return false;
  if (target === 'loc') return true;
  const haystack = [
    input.accountId,
    input.displayName,
    input.loanType,
    input.lender,
  ]
    .join(' ')
    .toLowerCase();
  return /\bloc\b|line of credit|revolver/.test(haystack);
}
