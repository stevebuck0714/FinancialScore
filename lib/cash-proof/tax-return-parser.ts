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

// Form titles. A personal return mentions "Form 1120-S" in K-1 instructions, so titles win over mentions.
const FORM_TITLES: Array<[TaxReturnForm, RegExp]> = [
  ['1120S', /income\s+tax\s+return\s+for\s+an\s+s\s+corporation/i],
  ['1065', /return\s+of\s+partnership\s+income/i],
  ['1120', /u\.?s\.?\s+corporation\s+income\s+tax\s+return/i],
  ['SCHEDULE_C', /profit\s+or\s+loss\s+from\s+business/i],
  // Business income on a personal return is reported on Schedule C, even when that page's labels are unreadable.
  ['SCHEDULE_C', /u\.?s\.?\s+individual\s+income\s+tax\s+return/i],
];

// "(Form 1120-S)" is a cross-reference to another form, not the form itself.
const FORM_PATTERNS: Array<[TaxReturnForm, RegExp]> = [
  ['1120S', /(?<!\(\s*)form\s+1120-?\s?s\b/i],
  ['1065', /(?<!\(\s*)form\s+1065\b/i],
  ['1120', /(?<!\(\s*)form\s+1120\b(?!-?\s?s\b)/i],
  ['SCHEDULE_C', /schedule\s+c\s*\(form\s+1040\)|profit\s+or\s+loss\s+from\s+business/i],
];

// Tax returns are in whole dollars. A comma or five digits keeps years, line numbers, and ZIP+4 out.
const AMOUNT = /(?<![\d.,/$-])\(?-?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d{5,})(?:\.\d{2})?\)?(?![\d/%]|,\d)/;
const TAIL = 320;
// Some software (TurboTax) prints a page's labels first and every value in one block below them.
const SECTION = 5000;

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
  for (const [form, pattern] of FORM_TITLES) if (pattern.test(text)) return form;
  for (const [form, pattern] of FORM_PATTERNS) if (pattern.test(text)) return form;
  return null;
}

const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Reads gross receipts from a page whose values are printed apart from their labels: the largest amount
 * that the page splits into two other amounts (gross receipts − cost of goods sold = gross profit).
 * Returns and allowances cannot be told apart from cost of goods sold this way, so they are left blank.
 */
function detachedRevenue(section: string): { gross: number; returns: null } | null {
  const amounts = [...new Set([...section.matchAll(new RegExp(AMOUNT.source, 'g'))].map((m) => toAmount(m[0])).filter((n) => n > 0))];
  const has = (n: number) => amounts.some((a) => Math.abs(a - n) <= 1);
  const gross = [...amounts].sort((a, b) => b - a).find((g) => amounts.some((part) => part < g && has(g - part)));
  return gross === undefined ? null : { gross, returns: null };
}

type RevenueSection = { gross: number; returns: number | null; net: number | null; text: string };

/** One entry per page that carries a gross receipts line (one per business on a personal return). */
function revenueSections(text: string): RevenueSection[] {
  const starts = [...text.matchAll(GROSS_LABEL)].map((m) => m.index!);
  const sections: RevenueSection[] = [];
  starts.forEach((start, i) => {
    const section = text.slice(start, Math.min(starts[i + 1] ?? text.length, start + SECTION));
    const gross = amountsAfter(section, GROSS_LABEL, GROSS_STOP)[0];
    if (gross !== undefined) {
      const returns = amountsAfter(section, RETURNS_LABEL, RETURNS_STOP)[0] ?? null;
      const net = amountsAfter(section, NET_LABEL, NET_STOP)[0] ?? null;
      sections.push({ gross, returns, net, text: section });
      return;
    }
    const detached = detachedRevenue(section);
    if (detached) sections.push({ ...detached, net: null, text: section });
  });
  return sections;
}

const PAGE_FOOTER = /REV\s+\d{2}\/\d{2}\/\d{2}\s+Intuit|Intuit\.cg\./i;

/**
 * For pages whose labels the PDF's fonts leave unreadable: the business name sits at the top of
 * the page's value block, so read from it to the end of the page.
 */
function namedSections(text: string, name: string): RevenueSection[] {
  const pattern = new RegExp(name.split('').join('[^a-z]{0,3}'), 'gi');
  const sections: RevenueSection[] = [];
  for (const match of text.matchAll(pattern)) {
    let section = text.slice(match.index! + match[0].length, match.index! + match[0].length + SECTION);
    const end = section.search(PAGE_FOOTER);
    if (end >= 0) section = section.slice(0, end);
    const detached = detachedRevenue(section);
    if (detached) sections.push({ ...detached, net: null, text: match[0] + section });
  }
  return sections;
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

/**
 * Reads page 1 revenue lines from the text of a business income tax return.
 * When the file reports more than one business (several Schedule Cs), `businessName` picks the one that names it.
 */
export function parseTaxReturn(text: string, fileName = '', businessName = ''): ParsedTaxReturn {
  const form = detectForm(text);
  const years = detectYears(text, fileName);
  const name = lettersOnly(businessName.replace(/[_\s-]*\d+$/, ''));
  let sections = revenueSections(text);
  if (sections.length === 0 && name.length >= 4) sections = namedSections(text, name);
  const distinct = (list: RevenueSection[]) => [...new Set(list.map((s) => s.gross))];
  if (distinct(sections).length > 1 && name.length >= 4) {
    const named = sections.filter((s) => lettersOnly(s.text).includes(name));
    if (distinct(named).length === 1) sections = named;
  }
  const grossValues = distinct(sections);
  const chosen = grossValues.length === 1 ? sections[0] : null;

  const grossReceipts = chosen?.gross ?? null;
  let returnsAllowances = chosen?.returns ?? null;
  const netReceipts = chosen?.net ?? null;
  if (grossReceipts !== null && netReceipts !== null && returnsAllowances === null) {
    returnsAllowances = round2(grossReceipts - netReceipts);
  }

  let ambiguity: string | null = null;
  if (grossValues.length > 1) {
    ambiguity = `The file has ${grossValues.length} different gross receipts figures (${grossValues
      .map((n) => `$${n.toLocaleString('en-US')}`)
      .join(', ')}), so it holds more than one return or business.`;
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
