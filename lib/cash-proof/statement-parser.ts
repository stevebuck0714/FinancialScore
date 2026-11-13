export type ParsedStatement = {
  last4: string | null;
  month: string | null;
  periodLabel: string | null;
  beginning: number | null;
  deposits: number | null;
  withdrawals: number | null;
  ending: number | null;
  /** beginning + deposits − withdrawals = ending, when all four were found. */
  foots: boolean | null;
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_NAME = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
// Amounts must carry cents so dates, counts, and page numbers are never read as money.
const AMOUNT = '(\\(?-?\\s?\\$?\\s?\\d{1,3}(?:,\\d{3})*\\.\\d{2}\\)?-?|\\(?-?\\s?\\$?\\s?\\d+\\.\\d{2}\\)?-?)';
const LABEL_GAP = 120;

const BEGINNING_LABELS = [
  /(?:beginning|opening|starting|previous)\s+(?:statement\s+)?balance/i,
  /balance\s+(?:forward|brought\s+forward|last\s+statement)/i,
];
const DEPOSIT_LABELS = [
  /total\s+deposits(?:\s*(?:and|&)\s*(?:other\s+)?(?:credits|additions))?/i,
  /deposits\s*(?:and|&)\s*(?:other\s+)?(?:credits|additions)/i,
  /deposits\s*\/\s*credits/i,
  /total\s+(?:credits|additions)/i,
  /\bdeposits\b/i,
];
const WITHDRAWAL_LABELS = [
  /total\s+withdrawals(?:\s*(?:and|&)\s*(?:other\s+)?(?:debits|subtractions))?/i,
  /withdrawals\s*(?:and|&)\s*(?:other\s+)?(?:debits|subtractions)/i,
  /withdrawals\s*\/\s*debits/i,
  /total\s+(?:debits|subtractions)/i,
  /checks\s*(?:and|&)\s*(?:other\s+)?debits/i,
  /\bwithdrawals\b/i,
];
const ENDING_LABELS = [/(?:ending|closing|new)\s+(?:statement\s+)?balance/i, /balance\s+(?:this|end\s+of)\s+statement/i];

function toAmount(raw: string): number {
  const negative = /\(|-/.test(raw);
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return Math.round((negative ? -n : n) * 100) / 100;
}

/** First amount that follows any of the labels, trying the most specific label first. */
function amountAfter(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const re = new RegExp(label.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const tail = text.slice(match.index + match[0].length, match.index + match[0].length + LABEL_GAP);
      // Skip "on 09/30/2024" style dates and "(12)" counts that sit between label and amount.
      const amount = tail.match(new RegExp(AMOUNT));
      if (amount && isFiller(tail.slice(0, amount.index))) return toAmount(amount[1]);
    }
  }
  return null;
}

/** Text between a label and its amount may only be dates, counts, and words like "on". */
function isFiller(between: string): boolean {
  const stripped = between
    .replace(new RegExp(MONTH_NAME, 'gi'), '')
    .replace(/\b(?:on|as\s+of|items?|thru|through)\b/gi, '');
  return !/[a-z]{4,}/i.test(stripped);
}

// Banks that split debits across lines (Chase, Bank of America) are summed and
// only accepted when the result makes the statement foot.
const WITHDRAWAL_COMPONENT_LABELS = [
  /withdrawals\s*(?:and|&)\s*(?:other\s+)?(?:debits|subtractions)/i,
  /electronic\s+withdrawals/i,
  /other\s+withdrawals/i,
  /atm\s*(?:&|and)?\s*debit\s+card\s+withdrawals/i,
  /checks\s+paid/i,
  /\bchecks\b(?!\s*(?:and|&|paid))/i,
  /service\s+(?:fees?|charges?)/i,
  /\bfees\b(?!\s*(?:and|&))/i,
  /card\s+purchases/i,
];

function summedWithdrawals(summary: string): number | null {
  const seen = new Set<number>();
  let total = 0;
  for (const label of WITHDRAWAL_COMPONENT_LABELS) {
    const match = label.exec(summary);
    if (!match) continue;
    const start = match.index + match[0].length;
    const tail = summary.slice(start, start + LABEL_GAP);
    const amount = tail.match(new RegExp(AMOUNT));
    if (!amount || !isFiller(tail.slice(0, amount.index))) continue;
    const position = start + (amount.index ?? 0);
    if (seen.has(position)) continue;
    seen.add(position);
    total += Math.abs(toAmount(amount[1]));
  }
  return seen.size > 1 ? Math.round(total * 100) / 100 : null;
}

function findLast4(text: string, fileName: string): string | null {
  const patterns = [
    /(?:account|acct)[^\n]{0,40}?(?:[x*•#]{2,}|ending\s+in\s+|ends\s+in\s+)\s*(\d{4})\b/i,
    /\b(?:account|acct)\b[^\n\d]{0,20}(\d[\d -]{4,}\d)/i,
    /[x*•]{3,}\s?(\d{4})\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const digits = m[1].replace(/\D/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
  }
  const fromName = fileName.match(/(?:x|\*|ending\s*|acct\s*|#)(\d{4})\b/i);
  return fromName ? fromName[1] : null;
}

function toDate(y: number, m: number, d: number): Date | null {
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) || date.getUTCMonth() !== m - 1 ? null : date;
}

function monthIndex(name: string): number {
  const key = name.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(key)) + 1;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** The statement month is the month holding most of the period, so 09/03–10/02 is September. */
function findPeriod(text: string, fileName: string): { month: string | null; label: string | null } {
  const sep = '\\s*(?:-|–|—|to|through|thru)\\s*';
  const numeric = text.match(new RegExp(`(\\d{1,2})/(\\d{1,2})/(\\d{2,4})${sep}(\\d{1,2})/(\\d{1,2})/(\\d{2,4})`, 'i'));
  const named = text.match(
    new RegExp(`${MONTH_NAME}\\s+(\\d{1,2}),?\\s+(\\d{4})${sep}${MONTH_NAME}\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'),
  );
  let start: Date | null = null;
  let end: Date | null = null;
  let label: string | null = null;
  if (numeric) {
    start = toDate(Number(numeric[3]), Number(numeric[1]), Number(numeric[2]));
    end = toDate(Number(numeric[6]), Number(numeric[4]), Number(numeric[5]));
    label = numeric[0];
  } else if (named) {
    start = toDate(Number(named[3]), monthIndex(named[1]), Number(named[2]));
    end = toDate(Number(named[6]), monthIndex(named[4]), Number(named[5]));
    label = named[0];
  }
  if (start && end && end >= start) {
    return { month: monthKey(new Date((start.getTime() + end.getTime()) / 2)), label };
  }
  const single = text.match(/statement\s+(?:date|ending|closing\s+date)\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (single) {
    const d = toDate(Number(single[3]), Number(single[1]), Number(single[2]));
    if (d) {
      if (d.getUTCDate() <= 5) d.setUTCMonth(d.getUTCMonth() - 1);
      return { month: monthKey(d), label: single[0] };
    }
  }
  const fromName = fileName.match(/(20\d{2})[-_ .](0[1-9]|1[0-2])(?!\d)/);
  return { month: fromName ? `${fromName[1]}-${fromName[2]}` : null, label: null };
}

export function parseBankStatement(rawText: string, fileName = ''): ParsedStatement {
  const text = rawText.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  // Summary figures sit near the top; transaction lines below reuse words like "deposit".
  const summaryWindow = text.slice(0, 6000);
  const { month, label } = findPeriod(text, fileName);
  const beginning = amountAfter(summaryWindow, BEGINNING_LABELS);
  const deposits = amountAfter(summaryWindow, DEPOSIT_LABELS);
  const withdrawalsRaw = amountAfter(summaryWindow, WITHDRAWAL_LABELS);
  let withdrawals = withdrawalsRaw === null ? null : Math.abs(withdrawalsRaw);
  const ending = amountAfter(summaryWindow, ENDING_LABELS);
  const footsWith = (w: number | null) =>
    beginning !== null && deposits !== null && w !== null && ending !== null
      ? Math.abs(beginning + Math.abs(deposits) - w - ending) <= 0.01
      : null;
  let foots = footsWith(withdrawals);
  if (foots === false || (withdrawals === null && beginning !== null && deposits !== null && ending !== null)) {
    const endingAt = summaryWindow.search(ENDING_LABELS[0]);
    const summed = summedWithdrawals(endingAt > 0 ? summaryWindow.slice(0, endingAt) : summaryWindow);
    if (footsWith(summed)) {
      withdrawals = summed;
      foots = true;
    }
  }
  return {
    last4: findLast4(text, fileName),
    month,
    periodLabel: label,
    beginning,
    deposits: deposits === null ? null : Math.abs(deposits),
    withdrawals,
    ending,
    foots,
  };
}
