import { SDE_BUCKETS, SDE_BUCKET_LABELS, SDE_LINE_ITEMS, type SdeBucket } from '@/lib/sde/adjustment-line-items';

export type QoeSummaryAccountInput = {
  mappingId: string;
  accountCode: string | null;
  accountName: string;
  /** LTM magnitude of the whole account. */
  ltm: number;
  ownerAmount: number;
  ownerPercent: number;
  ownerMode: 'PERCENT' | 'AMOUNT';
  note: string | null;
};

export type QoeSummaryAccount = QoeSummaryAccountInput & {
  /** Portion of the account that stays in reported results. */
  remaining: number;
};

export type QoeSummaryOtherEntry = {
  amount: number;
  /** 'manual' = typed on the line; 'detected' = found from account names. */
  source: 'manual' | 'detected';
  month: string | null;
  note: string | null;
};

export type QoeSummaryLine = {
  key: string;
  label: string;
  /** 'add' raises earnings; 'deduct' lowers them. */
  effect: 'add' | 'deduct';
  total: number;
  accounts: QoeSummaryAccount[];
  other: QoeSummaryOtherEntry | null;
};

export type QoeSummaryBucket = {
  bucket: SdeBucket;
  title: string;
  lines: QoeSummaryLine[];
};

export type QoeSummaryManualInputs = {
  manualEntryMonths?: Record<string, string>;
  manualEntryNotes?: Record<string, string>;
} & Record<string, unknown>;

const MIN_AMOUNT = 0.5;

function lineEffect(bucket: SdeBucket, key: string): 'add' | 'deduct' {
  if (bucket === 'ONE_TIME_REVENUE') return 'deduct';
  if (bucket === 'OWNER_COMP' && key === 'marketReplacementSalary') return 'deduct';
  return 'add';
}

/**
 * Groups every Quality of Earnings adjustment by bucket and line item, with
 * each assigned account's share of its LTM total and any amount on the line
 * that isn't tied to an account (manual entry or name-detected).
 *
 * `lineValues` are the effective line totals the valuation uses, so the
 * summary always reconciles to the adjustment cards.
 */
export function buildQoeAdjustmentSummary(params: {
  accountsByLine: Partial<Record<SdeBucket, Record<string, QoeSummaryAccountInput[]>>>;
  lineValues: Partial<Record<SdeBucket, Record<string, number>>>;
  manualInputs: QoeSummaryManualInputs;
}): QoeSummaryBucket[] {
  const { accountsByLine, lineValues, manualInputs } = params;
  const months = manualInputs.manualEntryMonths || {};
  const notes = manualInputs.manualEntryNotes || {};
  const result: QoeSummaryBucket[] = [];

  for (const bucket of SDE_BUCKETS) {
    const lines: QoeSummaryLine[] = [];
    for (const item of SDE_LINE_ITEMS[bucket]) {
      const accounts = (accountsByLine[bucket]?.[item.key] || [])
        .filter((a) => Math.abs(a.ownerAmount) >= MIN_AMOUNT)
        .map((a) => ({ ...a, remaining: Math.max(0, a.ltm - a.ownerAmount) }));
      const assigned = accounts.reduce((s, a) => s + a.ownerAmount, 0);
      const total = Number(lineValues[bucket]?.[item.key]) || 0;
      const otherAmount = total - assigned;
      const manualValue = manualInputs[item.key];
      const other: QoeSummaryOtherEntry | null =
        Math.abs(otherAmount) >= MIN_AMOUNT
          ? {
              amount: otherAmount,
              source: manualValue !== undefined && manualValue !== null ? 'manual' : 'detected',
              month: months[item.key] || null,
              note: notes[item.key]?.trim() || null,
            }
          : null;
      if (accounts.length === 0 && !other) continue;
      lines.push({
        key: item.key,
        label: item.label,
        effect: lineEffect(bucket, item.key),
        total,
        accounts,
        other,
      });
    }
    if (lines.length > 0) result.push({ bucket, title: SDE_BUCKET_LABELS[bucket], lines });
  }
  return result;
}

type ApiAccount = {
  mappingId: string;
  accountCode: string | null;
  accountName: string;
  ltm: number;
  ownerAmount: number;
  ownerPercent: number;
  ownerMode?: 'PERCENT' | 'AMOUNT';
  note?: string | null;
  lineItem?: string | null;
};

/** Saved accounts per (bucket, line item) from the /api/sde/ebitda-adjustments response. */
export function accountsByLineFromApi(
  buckets: Array<{ bucket: string; accounts: ApiAccount[] }> | undefined,
): Partial<Record<SdeBucket, Record<string, QoeSummaryAccountInput[]>>> {
  const out: Partial<Record<SdeBucket, Record<string, QoeSummaryAccountInput[]>>> = {};
  for (const b of buckets || []) {
    if (!(SDE_BUCKETS as string[]).includes(b.bucket)) continue;
    const bucket = b.bucket as SdeBucket;
    for (const a of b.accounts || []) {
      if (!a.lineItem) continue;
      ((out[bucket] ||= {})[a.lineItem] ||= []).push({
        mappingId: a.mappingId,
        accountCode: a.accountCode,
        accountName: a.accountName,
        ltm: Number(a.ltm) || 0,
        ownerAmount: Number(a.ownerAmount) || 0,
        ownerPercent: Number(a.ownerPercent) || 0,
        ownerMode: a.ownerMode === 'AMOUNT' ? 'AMOUNT' : 'PERCENT',
        note: a.note ?? null,
      });
    }
  }
  return out;
}
