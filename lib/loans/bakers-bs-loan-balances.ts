import prisma from '@/lib/prisma';
import {
  BAKERS_COMPANY_ID,
  BAKERS_HONEYCOMB_LOAN_ACCOUNT_IDS,
  BAKERS_HONEYCOMB_PRIMARY_ACCOUNT_ID,
  BAKERS_WALK_START,
  bakersLoanOpeningLtd,
  isBakersCompany,
  resolveBakersLocTarget,
} from '@/lib/financial/qbd-bakers-bs-pins';

const HONEYCOMB_IDS = new Set<string>(BAKERS_HONEYCOMB_LOAN_ACCOUNT_IDS);

export const BAKERS_LOAN_BALANCE_SOURCE = '5GB year-end PDF + 2026 GL';

type MappingRef = {
  accountId?: string | null;
  accountName?: string | null;
  targetField?: string | null;
};

function roundMoney(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function lookupKeys(value: unknown): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const keys = new Set<string>();
  const add = (candidate: string) => {
    const key = candidate.toLowerCase().replace(/\s+/g, ' ').trim();
    if (key) keys.add(key);
  };
  add(raw);
  const leadingCode = raw.match(/^\s*([0-9][0-9.\-]*)\s+(.+)$/);
  if (leadingCode) {
    add(leadingCode[1]);
    add(leadingCode[2]);
  }
  return [...keys];
}

function extraPdfNameKeys(accountId: string): string[] {
  if (accountId === '80000122-1750288253') return lookupKeys('Idea Financial LOC');
  if (accountId === '80000091-1401407413') return lookupKeys('LOC Huntington Bank');
  if (accountId === '800000C4-1453216646') return lookupKeys('N/P - Huntington Bank');
  if (accountId === BAKERS_HONEYCOMB_PRIMARY_ACCOUNT_ID) return lookupKeys('Honeycomb N/P');
  return [];
}

function colValue(row: Record<string, unknown>, titles: string[], ids: string[]): string {
  const cols = Array.isArray(row.colData) ? row.colData : [];
  for (const col of cols) {
    const rec = asRecord(col);
    const title = String(rec.title || rec.colTitle || '').toLowerCase();
    if (titles.some((item) => title === item.toLowerCase())) return String(rec.value || '');
  }
  for (const col of cols) {
    const rec = asRecord(col);
    if (ids.includes(String(rec.colID || ''))) return String(rec.value || '');
  }
  return '';
}

function qbdNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function dateKey(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(`${trimmed} UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return dateKey(value);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

export function bakersLoanRemaining(accountId: string, glNetThroughDate: number): number {
  return roundMoney(bakersLoanOpeningLtd(accountId) + Number(glNetThroughDate || 0));
}

function mappingLookup(mappings: MappingRef[]): Map<string, { id: string; name: string; target: string }> {
  const targetByKey = new Map<string, { id: string; name: string; target: string }>();
  for (const mapping of mappings) {
    const id = String(mapping.accountId || '').trim();
    const target = String(mapping.targetField || '').trim();
    const name = String(mapping.accountName || '').trim();
    if (!id) continue;
    for (const key of [...lookupKeys(id), ...lookupKeys(name), ...extraPdfNameKeys(id)]) {
      targetByKey.set(key, { id, name, target });
    }
  }
  return targetByKey;
}

/**
 * Last-batch-wins per day, same rule as the 5GB BS GL walk. Only 2026+ loc/ltd
 * movements are kept — YE 2025 PDF pins are the opening remaining.
 */
export async function loadBakersDebtGlNetByAccount(opts: {
  companyId: string;
  mappings: MappingRef[];
  throughDate: string;
  priorThroughDate?: string | null;
}): Promise<Map<string, { currentNet: number; priorNet: number; lastDate: string | null }>> {
  const out = new Map<string, { currentNet: number; priorNet: number; lastDate: string | null }>();
  if (!isBakersCompany(opts.companyId)) return out;

  const throughDate = String(opts.throughDate || '').slice(0, 10);
  const priorThroughDate = String(opts.priorThroughDate || '').slice(0, 10);
  const targetByKey = mappingLookup(opts.mappings);

  const batches = await prisma.$queryRaw<Array<{ batchId: string; lastSeen: Date }>>`
    SELECT "batchId", MAX("createdAt") AS "lastSeen"
    FROM "QuickBooksDesktopBackfillPage"
    WHERE "companyId" = ${BAKERS_COMPANY_ID}
      AND "requestName" = 'GeneralDetailReportQuery'
    GROUP BY "batchId"
    ORDER BY MAX("createdAt") ASC
  `;

  const rowsByDate = new Map<string, Record<string, unknown>[]>();
  for (const batch of batches) {
    const pages = await prisma.quickBooksDesktopBackfillPage.findMany({
      where: {
        companyId: BAKERS_COMPANY_ID,
        requestName: 'GeneralDetailReportQuery',
        batchId: batch.batchId,
      },
      select: { payload: true },
    });
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const page of pages) {
      const records = Array.isArray(page.payload) ? page.payload : [];
      for (const raw of records) {
        const row = asRecord(raw);
        if (String(row.rowKind || '') !== 'DataRow') continue;
        const key = dateKey(colValue(row, ['Txn Date', 'Date'], ['3']));
        if (!key || key < BAKERS_WALK_START || key < '2026-01-01' || key > throughDate) continue;
        const list = grouped.get(key) || [];
        list.push(row);
        grouped.set(key, list);
      }
    }
    for (const [day, rows] of grouped.entries()) {
      rowsByDate.set(day, rows);
    }
  }

  const add = (accountId: string, amount: number, day: string) => {
    const current = out.get(accountId) || { currentNet: 0, priorNet: 0, lastDate: null as string | null };
    current.currentNet += amount;
    if (priorThroughDate && day <= priorThroughDate) current.priorNet += amount;
    if (!current.lastDate || day > current.lastDate) current.lastDate = day;
    out.set(accountId, current);
  };

  for (const [day, rows] of rowsByDate.entries()) {
    for (const row of rows) {
      const accountName = String(
        row.accountName || row.rowValue || colValue(row, ['Account', 'Name'], ['1', '0']) || ''
      ).trim();
      let mapped = { id: '', name: accountName, target: '' };
      for (const key of lookupKeys(accountName)) {
        const hit = targetByKey.get(key);
        if (hit) {
          mapped = hit;
          break;
        }
      }
      const target = resolveBakersLocTarget({
        companyId: opts.companyId,
        dateKey: day,
        accountId: mapped.id,
        accountName,
        mappedTarget: mapped.target,
      });
      if (target !== 'ltd' && target !== 'loc') continue;
      const amount = qbdNumber(colValue(row, ['Amount'], ['8']));
      if (!amount || !mapped.id) continue;
      add(mapped.id, amount, day);
    }
  }

  for (const [accountId, nets] of out.entries()) {
    out.set(accountId, {
      currentNet: roundMoney(nets.currentNet),
      priorNet: roundMoney(nets.priorNet),
      lastDate: nets.lastDate,
    });
  }
  return out;
}

export function applyBakersBsLoanBalances<T extends {
  accountId?: string | null;
  displayName?: string | null;
  derivedCurrentBalance?: number | null;
  derivedCurrentBalanceSource?: string | null;
  derivedCurrentBalanceAsOf?: Date | string | null;
  priorMonthBalance?: number | null;
  principalChange?: number | null;
  lastDate?: Date | string | null;
  currentMonthInterestPaid?: number | null;
  instrumentStatus?: string | null;
  statusReason?: string | null;
}>(
  instruments: T[],
  glNets: Map<string, { currentNet: number; priorNet: number; lastDate: string | null }>,
  asOfDate: Date | string
): T[] {
  const asOf = isoDate(asOfDate);
  const applied = instruments.map((instrument) => {
    const accountId = String(instrument.accountId || '').trim();
    if (!accountId) return instrument;
    const nets = glNets.get(accountId) || { currentNet: 0, priorNet: 0, lastDate: null };
    const current = bakersLoanRemaining(accountId, nets.currentNet);
    const prior = bakersLoanRemaining(accountId, nets.priorNet);
    const hasBalance = Math.abs(current) > 0.005 || Math.abs(prior) > 0.005;
    return {
      ...instrument,
      derivedCurrentBalance: current,
      derivedCurrentBalanceSource: BAKERS_LOAN_BALANCE_SOURCE,
      derivedCurrentBalanceAsOf: asOf,
      priorMonthBalance: prior,
      principalChange: roundMoney(current - prior),
      lastDate: nets.lastDate || instrument.lastDate,
      instrumentStatus: hasBalance ? 'active' : 'inactive',
      statusReason: hasBalance
        ? 'Remaining balance follows the year-end PDF long-term debt line plus 2026 GL.'
        : 'Not in the year-end PDF long-term debt line and no 2026 GL remaining.',
    };
  });

  const honeycombMembers = applied.filter((instrument) => HONEYCOMB_IDS.has(String(instrument.accountId || '').trim()));
  let merged = applied;
  if (honeycombMembers.length > 1) {
    const primaryId =
      honeycombMembers.some((instrument) => String(instrument.accountId || '').trim() === BAKERS_HONEYCOMB_PRIMARY_ACCOUNT_ID)
        ? BAKERS_HONEYCOMB_PRIMARY_ACCOUNT_ID
        : String(honeycombMembers[0].accountId || '').trim();
    const current = roundMoney(
      honeycombMembers.reduce((sum, instrument) => sum + Number(instrument.derivedCurrentBalance || 0), 0)
    );
    const prior = roundMoney(
      honeycombMembers.reduce((sum, instrument) => sum + Number(instrument.priorMonthBalance || 0), 0)
    );
    const lastDate = honeycombMembers
      .map((instrument) => isoDate(instrument.lastDate))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) || null;
    const interest = roundMoney(
      honeycombMembers.reduce((sum, instrument) => sum + Number(instrument.currentMonthInterestPaid || 0), 0)
    );
    merged = applied
      .filter((instrument) => {
        const accountId = String(instrument.accountId || '').trim();
        return !HONEYCOMB_IDS.has(accountId) || accountId === primaryId;
      })
      .map((instrument) => {
        if (String(instrument.accountId || '').trim() !== primaryId) return instrument;
        return {
          ...instrument,
          displayName: 'Honeycomb N/P',
          derivedCurrentBalance: current,
          priorMonthBalance: prior,
          principalChange: roundMoney(current - prior),
          currentMonthInterestPaid: interest,
          lastDate,
          instrumentStatus: Math.abs(current) > 0.005 || Math.abs(prior) > 0.005 ? 'active' : 'inactive',
        };
      });
  }

  return merged
    .filter((instrument) => {
      const current = Number(instrument.derivedCurrentBalance || 0);
      const prior = Number(instrument.priorMonthBalance || 0);
      return Math.abs(current) > 0.005 || Math.abs(prior) > 0.005;
    })
    .sort((a, b) => Number(b.derivedCurrentBalance || 0) - Number(a.derivedCurrentBalance || 0));
}
