import { createHash } from 'node:crypto';

import prisma from '@/lib/prisma';

const AP_PROGRAMS = new Set([
  'SLVCHHDRS',
  'SLAPPMTS',
  'SLAPTRXP',
  'SLAPTRXPS',
  'SLAPTRX',
  'SLAPTRXS',
]);
const PAYMENT_PROGRAMS = new Set(['SLAPPMTS', 'SLAPTRXP', 'SLAPTRXPS', 'SLAPTRX', 'SLAPTRXS']);
const TOLERANCE = 0.005;
const BATCH_SIZE = 1_000;

type RawApRecord = {
  id: string;
  platform: string;
  miProgram: string | null;
  sourceRecordId: string | null;
  sourceRecordHash: string | null;
  payload: unknown;
};

type ApTransactionRow = {
  companyId: string;
  eventDate: Date;
  recordDate: Date | null;
  apAcct: string | null;
  vendorId: string | null;
  vendorName: string | null;
  voucher: string;
  vouchSeq: string;
  invoiceNum: string | null;
  invoiceDate: Date | null;
  distDate: Date | null;
  transType: string;
  invoiceAmount: number;
  normalizedAmount: number;
  exchangeRate: number | null;
  termsCode: string | null;
  sourcePlatform: string;
  sourceItemId: string | null;
  sourceProgram: string;
};

type ApPaymentRow = {
  companyId: string;
  paymentDate: Date;
  vendorId: string | null;
  vendorName: string;
  billNo: string | null;
  currencyCode: string | null;
  paidAmountCurrency: number | null;
  paidAmountHome: number;
  sourcePlatform: string;
  sourceItemId: string;
  sourceProgram: string;
  sourceTransaction: string;
};

function usage(): never {
  throw new Error(
    'Usage: tsx scripts/repair-infor-ap-ledger.ts <companyId> --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD --confirm'
  );
}

function parseDateArg(value: string | undefined, label: string): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return date;
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Date-only CSI values are calendar dates, not browser-local timestamps.
 * Parsing them as UTC is what prevents the prior one-day aging offset.
 */
function parseSourceDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return utcDay(value);
  const token = String(value ?? '').trim();
  if (!token) return null;
  // CSI commonly serializes date fields as `YYYYMMDD HH:mm:ss.sss`, which
  // Date.parse does not reliably recognize. These are accounting calendar
  // dates, so preserve the stated day at UTC midnight.
  const csiCompact = token.match(/^(\d{4})(\d{2})(\d{2})(?:\s+\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/);
  if (csiCompact) {
    const year = Number(csiCompact[1]);
    const month = Number(csiCompact[2]);
    const day = Number(csiCompact[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? date
      : null;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(token)
    ? new Date(`${token}T00:00:00.000Z`)
    : new Date(token);
  return Number.isNaN(date.getTime()) ? null : utcDay(date);
}

function payloadObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function text(record: Record<string, unknown>, keys: string[]): string | null {
  const index = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = index.get(key.toLowerCase());
    const value = actual ? record[actual] : undefined;
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function number(record: Record<string, unknown>, keys: string[]): number | null {
  const value = text(record, keys);
  if (value === null) return null;
  const parsed = Number(value.replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function stableSourceId(raw: RawApRecord, record: Record<string, unknown>, type: string): string {
  const sourceId = text(record, ['_ItemId', 'ItemId', 'RowPointer', '_RowPointer']);
  if (sourceId) return sourceId;
  if (raw.sourceRecordId) return raw.sourceRecordId;
  if (raw.sourceRecordHash) return raw.sourceRecordHash;
  return createHash('sha256')
    .update(
      [
        raw.miProgram,
        type,
        text(record, ['Voucher']),
        text(record, ['VouchSeq']),
        text(record, ['CheckNum']),
        text(record, ['DistDate']),
        text(record, ['RecordDate']),
        text(record, ['AmtPaid']),
        text(record, ['InvAmt']),
      ].join('|')
    )
    .digest('hex');
}

function normalizeApProgram(value: string | null | undefined): string {
  const source = String(value || '').trim();
  const match = source.match(/SL(?:VCHHDRS|APPMTS|APTRXPS|APTRXP|APTRXS|APTRX)/i);
  return match ? match[0].toUpperCase() : source.toUpperCase();
}

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += BATCH_SIZE) out.push(rows.slice(index, index + BATCH_SIZE));
  return out;
}

async function loadRawApRecords(companyId: string): Promise<RawApRecord[]> {
  // Historical syncs persist the same CSI page on many business dates. Pick
  // one current copy per source program + source identity inside Postgres,
  // rather than loading every replay copy into Node before deduplicating.
  return prisma.$queryRawUnsafe<RawApRecord[]>(
    `SELECT DISTINCT ON (
       UPPER(COALESCE("miProgram", '')),
       COALESCE(NULLIF("sourceRecordId", ''), NULLIF("sourceRecordHash", ''), id)
     )
       id, platform, "miProgram", "sourceRecordId", "sourceRecordHash", payload
     FROM "InforRawRecord"
     WHERE "companyId" = $1
       AND platform IN ('INFOR_M3', 'INFOR_CSI')
       AND (
         UPPER(COALESCE(module, '')) = 'AP'
         OR UPPER(COALESCE("miProgram", '')) ~ 'SL(VCHHDRS|APPMTS|APTRXP|APTRXPS|APTRX|APTRXS)'
       )
     ORDER BY
       UPPER(COALESCE("miProgram", '')),
       COALESCE(NULLIF("sourceRecordId", ''), NULLIF("sourceRecordHash", ''), id),
       "fetchedAt" DESC,
       id DESC`,
    companyId
  );
}

function buildFactRows(companyId: string, rawRows: RawApRecord[]) {
  const transactionByKey = new Map<string, ApTransactionRow>();
  const paymentByKey = new Map<string, ApPaymentRow>();

  for (const raw of rawRows) {
    // Some historical CSI raw rows retain the endpoint path instead of the
    // plain IDO name. Normalize the embedded program token before deciding
    // whether this is a supported AP source.
    const program = normalizeApProgram(raw.miProgram);
    if (!AP_PROGRAMS.has(program)) continue;
    const record = payloadObject(raw.payload);
    if (!record || text(record, ['InWorkflow']) === '1') continue;
    const type = String(text(record, ['Type']) || 'V').toUpperCase();
    if (!['V', 'D', 'C', 'P', 'A'].includes(type)) continue;
    // SLVchHdrs emits historical adjustment headers as well as the actual
    // adjustment transaction feed. Never recreate those known Type=A duplicates.
    if (program === 'SLVCHHDRS' && type === 'A') continue;
    // Header source is authoritative for voucher events; payment rows must
    // originate from the AP transaction/payment source.
    if (program === 'SLVCHHDRS' && type === 'P') continue;

    const voucher = text(record, ['Voucher', 'billNo', 'InvNum']);
    if (!voucher) continue;
    const vouchSeq = text(record, ['VouchSeq']) || '0';
    const distDate = parseSourceDate(text(record, ['DistDate']));
    const recordDate = parseSourceDate(text(record, ['RecordDate']));
    const invoiceDate = parseSourceDate(text(record, ['InvDate']));
    // Payments are accounting-date events. Do not fall back to InvDate, which
    // is commonly the original invoice date and produces an aging date shift.
    const eventDate = type === 'P'
      ? distDate || recordDate
      : distDate || invoiceDate || recordDate;
    if (!eventDate) continue;

    const paidAmount = number(record, ['AmtPaid']);
    const invoiceAmount = number(record, ['InvAmt', 'InvoiceAmount']);
    const sourceItemId = ['P', 'A'].includes(type) ? stableSourceId(raw, record, type) : null;
    // Type=P must always use the actual applied amount. InvAmt on this row is
    // frequently the original voucher face amount and would overstate each
    // installment if used as a fallback.
    if (type === 'P' && (paidAmount === null || paidAmount === 0)) continue;
    const amount = type === 'P' ? paidAmount : invoiceAmount ?? (type === 'A' ? paidAmount : null);
    if (amount === null || amount === 0) continue;
    const normalizedAmount = type === 'P' || type === 'C' ? -Math.abs(amount) : amount;
    const transaction: ApTransactionRow = {
      companyId, eventDate, recordDate, apAcct: text(record, ['ApAcct']),
      vendorId: text(record, ['VendNum', 'vendorId']),
      vendorName: text(record, ['VadName', 'VendaddrName', 'UbVendName', 'VendorName']),
      voucher, vouchSeq, invoiceNum: text(record, ['InvNum']),
      invoiceDate, distDate, transType: type, invoiceAmount: Math.abs(amount), normalizedAmount,
      exchangeRate: number(record, ['ExchRate']), termsCode: text(record, ['TermsCode']),
      sourcePlatform: raw.platform, sourceItemId, sourceProgram: program,
    };
    const transactionKey = `${voucher}|${vouchSeq}|${type}|${sourceItemId || ''}`;
    const existing = transactionByKey.get(transactionKey);
    // Do not allow the AP activity feed to replace a canonical voucher header.
    if (!existing || (existing.sourceProgram !== 'SLVCHHDRS' && program === 'SLVCHHDRS')) {
      transactionByKey.set(transactionKey, transaction);
    }

    // Payment facts are supplemental reporting facts only; Type=A belongs only
    // in APTransactionFact and must never be double-booked here.
    if (type !== 'P' || paidAmount === null || paidAmount === 0) continue;
    const paymentSourceId = stableSourceId(raw, record, type);
    paymentByKey.set(paymentSourceId, {
      companyId, paymentDate: eventDate,
      vendorId: text(record, ['VendNum', 'vendorId']),
      vendorName: text(record, ['VadName', 'VendaddrName', 'UbVendName', 'VendorName']) || 'Unknown Vendor',
      billNo: text(record, ['InvNum', 'Voucher']), currencyCode: text(record, ['CurrCode', 'currencyCode', 'CUCD']),
      paidAmountCurrency: number(record, ['paidAmountCurrency', 'CUAM']),
      paidAmountHome: Math.abs(paidAmount), sourcePlatform: raw.platform,
      sourceItemId: paymentSourceId, sourceProgram: program, sourceTransaction: 'DB_AP_LEDGER_REPAIR',
    });
  }
  return { transactions: [...transactionByKey.values()], payments: [...paymentByKey.values()] };
}

async function validateDailyAp(
  tx: any,
  companyId: string,
  startDate: Date,
  endDate: Date,
): Promise<Array<Record<string, unknown>>> {
  const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    WITH days AS (
      -- Include the bounding days so every target date gets a real -1/+1
      -- offset test, including the first and last requested date.
      SELECT generate_series($2::date - 1, $3::date + 1, interval '1 day')::date AS day
    ),
    comparison AS (
      SELECT
        d.day,
        dfs.ap AS snapshot_ap,
        COALESCE(ledger.open_ap, 0)::double precision AS ledger_ap,
        CASE WHEN anchor."openingBalance" IS NULL THEN NULL
          ELSE -(anchor."openingBalance" + COALESCE(gl.gl_delta, 0)) END::double precision AS account_30100_ap
      FROM days d
      LEFT JOIN "DailyFinancialSnapshot" dfs
        ON dfs."companyId" = $1 AND dfs.frequency = 'daily' AND dfs."snapshotDate" = d.day
      LEFT JOIN LATERAL (
        SELECT SUM(GREATEST(voucher_net.net, 0))::double precision AS open_ap
        FROM (
          SELECT "voucher", COALESCE("vouchSeq", ''), COALESCE("vendorId", ''),
                 SUM("normalizedAmount") AS net
          FROM "APTransactionFact"
          WHERE "companyId" = $1 AND "eventDate" <= d.day
          GROUP BY "voucher", COALESCE("vouchSeq", ''), COALESCE("vendorId", '')
        ) voucher_net
      ) ledger ON true
      LEFT JOIN LATERAL (
        SELECT "anchorDate", "openingBalance"
        FROM "BalanceSheetAccountAnchor"
        WHERE "companyId" = $1 AND "accountId" = '30100' AND "anchorDate" <= d.day
        ORDER BY "anchorDate" DESC
        LIMIT 1
      ) anchor ON true
      LEFT JOIN LATERAL (
        SELECT SUM("signedAmount")::double precision AS gl_delta
        FROM "GLTransactionFact"
        WHERE "companyId" = $1 AND "accountId" = '30100'
          AND "transDate" > anchor."anchorDate" AND "transDate" <= d.day
      ) gl ON true
    )
    SELECT
      day::text AS day,
      snapshot_ap AS "snapshotAp",
      ledger_ap AS "ledgerAp",
      account_30100_ap AS "account30100Ap",
      (ledger_ap - account_30100_ap)::double precision AS "ledgerVsAccount",
      (snapshot_ap - account_30100_ap)::double precision AS "snapshotVsAccount",
      (ledger_ap - snapshot_ap)::double precision AS "ledgerVsSnapshot",
      (COALESCE(prev.ledger_ap, 0) - account_30100_ap)::double precision AS "ledgerMinusOneVsAccount",
      (COALESCE(next.ledger_ap, 0) - account_30100_ap)::double precision AS "ledgerPlusOneVsAccount"
    FROM comparison
    LEFT JOIN comparison prev ON prev.day = comparison.day - 1
    LEFT JOIN comparison next ON next.day = comparison.day + 1
    WHERE comparison.day BETWEEN $2::date AND $3::date
    ORDER BY day
  `, companyId, startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10));

  return rows.filter((row) => {
    const required = [row.snapshotAp, row.ledgerAp, row.account30100Ap];
    if (required.some((value) => value === null || value === undefined)) return true;
    return Math.abs(Number(row.ledgerVsAccount)) > TOLERANCE ||
      Math.abs(Number(row.snapshotVsAccount)) > TOLERANCE ||
      Math.abs(Number(row.ledgerVsSnapshot)) > TOLERANCE ||
      Math.abs(Number(row.ledgerMinusOneVsAccount)) <= TOLERANCE ||
      Math.abs(Number(row.ledgerPlusOneVsAccount)) <= TOLERANCE;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const companyId = args.find((arg) => !arg.startsWith('--'))?.trim();
  const startDate = parseDateArg(args.find((arg) => arg.startsWith('--start-date='))?.slice(13), '--start-date');
  const endDate = parseDateArg(args.find((arg) => arg.startsWith('--end-date='))?.slice(11), '--end-date');
  if (!companyId || !args.includes('--confirm')) usage();
  if (startDate > endDate) throw new Error('--start-date must be on or before --end-date.');

  const rawRows = await loadRawApRecords(companyId);
  const facts = buildFactRows(companyId, rawRows);
  if (!facts.transactions.length) {
    throw new Error('No usable AP transaction rows were found in existing InforRawRecord data; no changes made.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const [deletedTransactions, deletedPayments] = await Promise.all([
      tx.aPTransactionFact.deleteMany({
        where: { companyId, sourcePlatform: { in: ['INFOR_M3', 'INFOR_CSI'] } },
      }),
      tx.aPPaymentFact.deleteMany({
        where: { companyId, sourcePlatform: { in: ['INFOR_M3', 'INFOR_CSI'] } },
      }),
    ]);
    for (const batch of chunks(facts.transactions)) await tx.aPTransactionFact.createMany({ data: batch });
    for (const batch of chunks(facts.payments)) await tx.aPPaymentFact.createMany({ data: batch });

    const failures = await validateDailyAp(tx, companyId, startDate, endDate);
    if (failures.length) {
      throw new Error(
        `AP repair rolled back: ${failures.length} daily reconciliation failure(s). ` +
        JSON.stringify(failures.slice(0, 10))
      );
    }
    return {
      rawRecordsRead: rawRows.length,
      transactionsWritten: facts.transactions.length,
      paymentsWritten: facts.payments.length,
      deletedTransactions: deletedTransactions.count,
      deletedPayments: deletedPayments.count,
    };
  }, { timeout: 300_000 });

  console.log(JSON.stringify({
    ok: true, companyId, startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10), tolerance: TOLERANCE, ...result,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
