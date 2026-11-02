/** Parses the BGAH monthly "Cash Flow" report (pasted from Excel) and matches payees to members. */

export type CashFlowReportLine = { label: string; amount: number };

export type ParsedCashFlowReport = {
  periodLabel: string | null;
  effectiveDate: string | null;
  received: CashFlowReportLine[];
  totalReceived: number | null;
  expenses: CashFlowReportLine[];
  totalExpenses: number | null;
  distributions: CashFlowReportLine[];
  totalDistributions: number | null;
  remainingAfterDistributions: number | null;
  issues: string[];
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const round2 = (value: number) => Math.round(value * 100) / 100;

function splitLine(raw: string): { label: string; amount: number | null } {
  const line = raw.replace(/\u00a0/g, ' ').trim();
  const match = line.match(/^(.*?)[\t ]+(\(?-?\s*\$?\s*-?[\d,]+(?:\.\d+)?\)?)\s*$/);
  if (!match) return { label: line.replace(/\t+/g, ' ').trim(), amount: null };
  const text = match[2];
  const negative = /^\(.*\)$/.test(text) || text.includes('-');
  const value = Number(text.replace(/[^0-9.]/g, ''));
  return { label: match[1].replace(/\t+/g, ' ').trim(), amount: Number.isFinite(value) ? (negative ? -value : value) : null };
}

export function parseCashFlowReport(text: string): ParsedCashFlowReport {
  const result: ParsedCashFlowReport = {
    periodLabel: null, effectiveDate: null, received: [], totalReceived: null, expenses: [], totalExpenses: null,
    distributions: [], totalDistributions: null, remainingAfterDistributions: null, issues: [],
  };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines.find((line) => new RegExp(`(${MONTHS.join('|')})\\s+\\d{4}`, 'i').test(line));
  if (header) {
    const match = header.match(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{4})`, 'i'))!;
    const monthIndex = MONTHS.indexOf(match[1].toLowerCase());
    const year = Number(match[2]);
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    result.periodLabel = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${year}`;
    result.effectiveDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    result.issues.push('Could not find the report month (for example "September 2026 Cash Flow"). Enter the distribution date.');
  }

  let section: 'received' | 'expenses' | 'distributions' | null = null;
  for (const raw of lines) {
    const { label, amount } = splitLine(raw);
    const key = label.toLowerCase();
    if (/^\*+.*\*+$/.test(label) || key === header?.toLowerCase()) continue;
    if (amount === null) {
      if (key.startsWith('net cash flow')) section = 'received';
      else if (key === 'expenses') section = 'expenses';
      else if (key === 'distributions') section = 'distributions';
      continue;
    }
    if (key.startsWith('total cash received')) { result.totalReceived = amount; section = null; continue; }
    if (key.startsWith('total expenses')) { result.totalExpenses = amount; section = null; continue; }
    if (key.startsWith('total distributions')) { result.totalDistributions = amount; section = null; continue; }
    if (/^net cash rem/.test(key)) { result.remainingAfterDistributions = amount; continue; }
    if (key.startsWith('net cash after')) continue;
    if (section) result[section].push({ label, amount });
  }

  if (!result.distributions.length) result.issues.push('No distribution lines were found between "Distributions" and "TOTAL DISTRIBUTIONS".');
  const distributed = round2(result.distributions.reduce((sum, line) => sum + line.amount, 0));
  if (result.totalDistributions !== null && Math.abs(distributed - result.totalDistributions) >= 0.01) {
    result.issues.push(`Distribution lines add to ${distributed.toFixed(2)} but TOTAL DISTRIBUTIONS is ${result.totalDistributions.toFixed(2)}.`);
  }
  return result;
}

const STOP_WORDS = new Set(['llc', 'l', 'inc', 'the', 'and', 'of', 'trust', 'rev', 'revocable', 'ii', 'iii', 'jr', 'sr', 'lp', 'ltd', 'co', 'corp']);
export const normalizeName = (name: string) => name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (name: string) => normalizeName(name).split(' ').filter((token) => token.length > 1 && !STOP_WORDS.has(token));

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

const tokenMatches = (a: string, b: string) => a === b
  || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)))
  || (a.length >= 5 && b.length >= 5 && editDistance(a, b) <= 1);

export type NameMatch = { investorId: string | null; confidence: 'saved' | 'exact' | 'likely' | 'none' };

/** Matches a report payee to a member: saved alias, then exact normalized name, then token similarity. */
export function matchMember(
  payee: string,
  investors: Array<{ id: string; legalName: string }>,
  aliases: Array<{ alias: string; investorId: string }>,
): NameMatch {
  const normalized = normalizeName(payee);
  const saved = aliases.find((alias) => normalizeName(alias.alias) === normalized && investors.some((investor) => investor.id === alias.investorId));
  if (saved) return { investorId: saved.investorId, confidence: 'saved' };
  const exact = investors.find((investor) => normalizeName(investor.legalName) === normalized);
  if (exact) return { investorId: exact.id, confidence: 'exact' };
  const payeeTokens = tokens(payee);
  let best: { id: string; score: number } | null = null;
  let tied = false;
  for (const investor of investors) {
    const legalTokens = tokens(investor.legalName);
    if (!payeeTokens.length || !legalTokens.length) continue;
    const payeeHits = payeeTokens.filter((token) => legalTokens.some((legal) => tokenMatches(token, legal))).length;
    const legalHits = legalTokens.filter((legal) => payeeTokens.some((token) => tokenMatches(token, legal))).length;
    const score = payeeHits / payeeTokens.length + legalHits / legalTokens.length;
    if (!best || score > best.score + 1e-9) { best = { id: investor.id, score }; tied = false; }
    else if (Math.abs(score - best.score) <= 1e-9) tied = true;
  }
  if (best && !tied && best.score >= 1) return { investorId: best.id, confidence: 'likely' };
  return { investorId: null, confidence: 'none' };
}
