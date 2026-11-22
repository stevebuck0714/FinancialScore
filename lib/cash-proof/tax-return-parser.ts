import type { TaxReturnForm } from './tax-return';

export type ParsedTaxReturn = {
  form: TaxReturnForm | null;
  /** Year printed on the form: the year the tax year begins. */
  taxYear: number | null;
  /** Calendar year in which the tax year ends, when the return states its ending date. */
  endingYear: number | null;
  endingMonth: number | null;
  grossReceipts: number | null;
  returnsAllowances: number | null;
  netReceipts: number | null;
  /** Set when the file holds more than one different gross receipts figure. */
  ambiguity: string | null;
};

const FORM_PATTERNS: Array<[TaxReturnForm, RegExp]> = [
  ['1120S', /form\s+1120-?\s?s\b|income\s+tax\s+return\s+for\s+an\s+s\s+corporation/i],
  ['1065', /form\s+1065\b|return\s+of\s+partnership\s+income/i],
  ['1120', /form\s+1120\b(?!-?\s?s\b)|u\.?s\.?\s+corporation\s+income\s+tax\s+return/i],
  ['SCHEDULE_C', /schedule\s+c\s*\(form\s+1040\)|profit\s+or\s+loss\s+from\s+business/i],
];

// Tax returns are in whole dollars. A comma or five digits keeps years, line numbers, and ZIP+4 out.
const AMOUNT = /(?<![\d.,/$-])\(?-?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d{5,})(?:\.\d{2})?\)?(?![\d/%]|,\d)/;
const TAIL = 320;

const GROSS_LABEL = /gross\s+receipts\s+or\s+sales/gi;
const RETURNS_LABEL = /returns\s+and\s+allowances/gi;
const NET_LABEL = /subtract\s+line\s+(?:1b\s+from\s+line\s+1a|2\s+from\s+line\s+1\b)/gi;
const GROSS_STOP = /returns\s+and\s+allowances|balance\b|subtract\s+line|cost\s+of\s+goods/i;
const RETURNS_STOP = /balance\b|subtract\s+line|cost\s+of\s+goods|gross\s+profit/i;
const NET_STOP = /cost\s+of\s+goods|gross\s+profit|net\s+gain|other\s+income/i;

const round2 = (n: number) => Math.round(n * 100) / 100;

function toAmount(raw: string): number {
  const negative = /\(|-/.test(raw);
  const n = Number(raw.replace(/[^\d.]/g, ''));
  return round2(negative ? -n : n);
}

/** Every amount that follows a label before the next line's label starts. */
function amountsAfter(text: string, label: RegExp, stop: RegExp): number[] {
  const out: number[] = [];
  const re = new RegExp(label.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    let tail = text.slice(match.index + match[0].length, match.index + match[0].length + TAIL);
    const end = tail.search(stop);
    if (end >= 0) tail = tail.slice(0, end);
    const amount = tail.match(AMOUNT);
    if (amount) out.push(toAmount(amount[0]));
  }
  return out;
}

function detectForm(text: string): TaxReturnForm | null {
  for (const [form, pattern] of FORM_PATTERNS) if (pattern.test(text)) return form;
  return null;
}

function detectYears(text: string, fileName: string) {
  let taxYear: number | null = null;
  const calendar = text.match(/for\s+calendar\s+year\s+(20\d{2})/i);
  const scheduleC = text.match(/\(form\s+1040\)\s*(20\d{2})/i);
  const formYear = text.match(/form\s+(?:1120-?\s?s|1120|1065)\b[^\n]{0,60}?\b(20\d{2})\b/i);
  const named = fileName.match(/(?<!\d)(20\d{2})(?!\d)/);
  taxYear = Number((calendar || scheduleC || formYear || named)?.[1]) || null;

  const ending = text.match(/ending\s+(\d{1,2})\s*[/-]\s*\d{1,2}\s*[/-]\s*(20\d{2}|\d{2})\b/i);
  let endingYear: number | null = null;
  let endingMonth: number | null = null;
  if (ending) {
    const m = Number(ending[1]);
    const y = Number(ending[2].length === 2 ? `20${ending[2]}` : ending[2]);
    if (m >= 1 && m <= 12 && (!taxYear || y === taxYear || y === taxYear + 1)) {
      endingMonth = m;
      endingYear = y;
    }
  }
  return { taxYear, endingYear, endingMonth };
}

/** Reads page 1 revenue lines from the text of a business income tax return. */
export function parseTaxReturn(text: string, fileName = ''): ParsedTaxReturn {
  const form = detectForm(text);
  const years = detectYears(text, fileName);
  const grossValues = [...new Set(amountsAfter(text, GROSS_LABEL, GROSS_STOP))];
  const returnsValues = [...new Set(amountsAfter(text, RETURNS_LABEL, RETURNS_STOP))];
  const netValues = [...new Set(amountsAfter(text, NET_LABEL, NET_STOP))];

  const grossReceipts = grossValues.length === 1 ? grossValues[0] : null;
  let returnsAllowances = returnsValues.length === 1 ? returnsValues[0] : null;
  const netReceipts = netValues.length === 1 ? netValues[0] : null;
  if (grossReceipts !== null && netReceipts !== null && returnsAllowances === null) {
    returnsAllowances = round2(grossReceipts - netReceipts);
  }

  let ambiguity: string | null = null;
  if (grossValues.length > 1) {
    ambiguity = `The file has ${grossValues.length} different gross receipts figures (more than one return or business).`;
  } else if (
    grossReceipts !== null &&
    netReceipts !== null &&
    Math.abs(grossReceipts - (returnsAllowances ?? 0) - netReceipts) > 1
  ) {
    ambiguity = 'Gross receipts less returns and allowances does not equal the balance line.';
  }

  return { form, ...years, grossReceipts, returnsAllowances: returnsAllowances || null, netReceipts, ambiguity };
}

/** Period key (FY2024) of the fiscal year a return covers. */
export function taxReturnPeriodKey(parsed: ParsedTaxReturn, fiscalYearEndMonth: number): string | null {
  if (parsed.endingYear) return `FY${parsed.endingYear}`;
  if (!parsed.taxYear) return null;
  return `FY${fiscalYearEndMonth === 12 ? parsed.taxYear : parsed.taxYear + 1}`;
}
