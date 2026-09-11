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
// Voucher coverage begins 2023-01-01 in both SLVchHdrs and SLAptrxps Type=V;
// the Type=P payment feed reaches back to 2017. The floor tracks the voucher
// side because a voucher with no header cannot be aged, while payments
// arriving before it are dropped by the orphan guard below.
const AP_MIN_BILL_DATE = new Date('2023-01-01T00:00:00.000Z');

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
    'Usage: tsx scripts/repair-infor-ap-ledger.ts <companyId> --start-date=YYYY-MM-DD --end-date=YYYY-MM-DD --confirm\n' +
    '       tsx scripts/repair-infor-ap-ledger.ts <companyId> --explain=YYYY-MM-DD   (read-only diagnosis)'
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
  // Historical syncs persist the same CSI page on many business dates, so this
  // table runs to tens of millions of rows. InforRawRecord_dedup_by_itemid_uniq
  // already guarantees one row per (companyId, platform, miProgram,
  // sourceRecordId), so restricting to identified rows both deduplicates and
  // keeps this on an index scan. Sorting replay copies instead read the whole
  // table and blew the interactive transaction limit.
  return prisma.$queryRawUnsafe<RawApRecord[]>(
    `SELECT id, platform, "miProgram", "sourceRecordId", "sourceRecordHash", payload
     FROM "InforRawRecord"
     WHERE "companyId" = $1
       AND platform IN ('INFOR_M3', 'INFOR_CSI')
       AND "sourceRecordId" IS NOT NULL
       AND UPPER(COALESCE("miProgram", '')) ~ 'SL(VCHHDRS|APPMTS|APTRXPS|APTRXP|APTRXS|APTRX)'`,
    companyId
  );
}

function buildFactRows(companyId: string, rawRows: RawApRecord[]) {
  const transactionByKey = new Map<string, ApTransactionRow>();
  const paymentByKey = new Map<string, ApPaymentRow>();
  const paymentVoucherByKey = new Map<string, string>();
  const voucherHeaders = new Set<string>();
  // SLAptrx carries rows dated as far out as 2417. Nothing downstream bounds
  // an event date, so a single corrupt row would sit in the ledger forever.
  const maxEventDate = new Date(Date.now() + 366 * 86_400_000);

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
    // SLVchHdrs is the canonical voucher-header source. SLAptrx* repeats
    // Type=V rows beside its payment activity; replaying those as invoices
    // creates phantom open AP.
    if (program !== 'SLVCHHDRS' && type === 'V') continue;

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
    if (!eventDate || eventDate.getTime() < AP_MIN_BILL_DATE.getTime()) continue;
    if (eventDate.getTime() > maxEventDate.getTime()) continue;

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
      sourcePlatform: 'INFOR_CSI', sourceItemId, sourceProgram: program,
    };
    const transactionKey = `${voucher}|${vouchSeq}|${type}|${sourceItemId || ''}`;
    const existing = transactionByKey.get(transactionKey);
    // Do not allow the AP activity feed to replace a canonical voucher header.
    if (!existing || (existing.sourceProgram !== 'SLVCHHDRS' && program === 'SLVCHHDRS')) {
      transactionByKey.set(transactionKey, transaction);
    }
    if (type === 'V') voucherHeaders.add(voucher);

    // Payment facts are supplemental reporting facts only; Type=A belongs only
    // in APTransactionFact and must never be double-booked here.
    if (type !== 'P' || paidAmount === null || paidAmount === 0) continue;
    const paymentSourceId = stableSourceId(raw, record, type);
    paymentVoucherByKey.set(paymentSourceId, voucher);
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
  // Payments settling a voucher whose header predates the coverage floor have
  // nothing to reduce. Booking them anyway drives the ledger below books --
  // the orphan-payment leakage that made the anchor roll-forward go negative.
  const transactions = [...transactionByKey.values()].filter(
    (row) => row.transType === 'V' || voucherHeaders.has(row.voucher)
  );
  const payments = [...paymentByKey.entries()]
    .filter(([key]) => voucherHeaders.has(paymentVoucherByKey.get(key) || ''))
    .map(([, row]) => row);
  const orphanTransactions = transactionByKey.size - transactions.length;
  const orphanPayments = paymentByKey.size - payments.length;
  if (orphanTransactions || orphanPayments) {
    console.warn('[ap-repair] dropped orphan AP activity', { orphanTransactions, orphanPayments });
  }
  return { transactions, payments };
}

async function validateDailyAp(
  tx: any,
  companyId: string,
  startDate: Date,
  endDate: Date,
): Promise<Array<Record<string, unknown>>> {
  const rows = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    -- Set-based equivalent of the production voucher aging-rule total. The
    -- former per-day LATERAL query rescanned the complete ledger and exceeded
    -- Prisma's interactive transaction limit before it could validate/commit.
    WITH days AS (
      SELECT generate_series($2::date - 1, $3::date + 1, interval '1 day')::date AS day
    ),
    -- CSI only stamps ApAcct on voucher headers synced from 2026-01-30 on:
    -- 4,473 of 5,050 headers carry no account at all. Requiring '30100' here
    -- discarded every older voucher, which is why the reconstruction read
    -- zero before 2026 and sat a constant $41,157.55 short after it. Untagged
    -- vouchers belong to the AP control account; only an explicitly different
    -- account is excluded.
    vouchers AS (
      SELECT "voucher", MIN("eventDate")::date AS created_at
      FROM "APTransactionFact"
      WHERE "companyId" = $1
        AND COALESCE(NULLIF(TRIM("apAcct"), ''), '30100') = '30100'
        AND "transType" = 'V'
        AND "eventDate" <= $3::date + 1
      GROUP BY "voucher"
    ),
    voucher_meta AS (
      SELECT DISTINCT ON (t."voucher")
        t."voucher", NULLIF(TRIM(t."invoiceNum"), '') AS invoice_num
      FROM "APTransactionFact" t
      JOIN vouchers v ON v."voucher" = t."voucher"
      WHERE t."companyId" = $1
        AND COALESCE(NULLIF(TRIM(t."apAcct"), ''), '30100') = '30100'
        AND t."transType" = 'V'
      ORDER BY t."voucher", t."eventDate" ASC
    ),
    event_daily AS (
      SELECT
        t."voucher",
        t."eventDate"::date AS day,
        SUM(t."normalizedAmount")::double precision AS event_amount,
        SUM(CASE WHEN t."transType" = 'P' THEN ABS(t."normalizedAmount") ELSE 0 END)::double precision
          AS type_p_paid
      FROM "APTransactionFact" t
      JOIN vouchers v ON v."voucher" = t."voucher"
      WHERE t."companyId" = $1 AND t."eventDate" <= $3::date + 1
      GROUP BY t."voucher", t."eventDate"::date
    ),
    payment_daily AS (
      SELECT vm."voucher", p."paymentDate"::date AS day, SUM(p."paidAmountHome")::double precision AS paid_amount
      FROM voucher_meta vm
      JOIN "APPaymentFact" p
        ON p."companyId" = $1
       AND p."paymentDate" <= $3::date + 1
       AND (
         UPPER(TRIM(p."billNo")) = UPPER(TRIM(vm."voucher"))
         OR (vm.invoice_num IS NOT NULL AND UPPER(TRIM(p."billNo")) = UPPER(TRIM(vm.invoice_num)))
       )
      GROUP BY vm."voucher", p."paymentDate"::date
    ),
    activity_daily AS (
      SELECT
        activity."voucher",
        activity.day,
        SUM(activity.event_amount)::double precision AS event_amount,
        SUM(activity.type_p_paid)::double precision AS type_p_paid,
        SUM(activity.paid_amount)::double precision AS paid_amount
      FROM (
        SELECT "voucher", day, event_amount, type_p_paid, 0::double precision AS paid_amount
        FROM event_daily
        UNION ALL
        SELECT "voucher", day, 0::double precision, 0::double precision, paid_amount
        FROM payment_daily
      ) activity
      GROUP BY activity."voucher", activity.day
    ),
    opening_events AS (
      SELECT
        "voucher",
        SUM(event_amount)::double precision AS event_amount,
        SUM(type_p_paid)::double precision AS type_p_paid
      FROM event_daily
      WHERE day < $2::date - 1
      GROUP BY "voucher"
    ),
    opening_payments AS (
      SELECT "voucher", SUM(paid_amount)::double precision AS paid_amount
      FROM payment_daily
      WHERE day < $2::date - 1
      GROUP BY "voucher"
    ),
    voucher_days AS (
      SELECT d.day, v."voucher"
      FROM days d
      JOIN vouchers v ON v.created_at <= d.day
    ),
    running AS (
      SELECT
        vd.day,
        vd."voucher",
        COALESCE(oe.event_amount, 0) + SUM(COALESCE(ad.event_amount, 0)) OVER (
          PARTITION BY vd."voucher" ORDER BY vd.day ROWS UNBOUNDED PRECEDING
        )::double precision AS event_net,
        COALESCE(oe.type_p_paid, 0) + SUM(COALESCE(ad.type_p_paid, 0)) OVER (
          PARTITION BY vd."voucher" ORDER BY vd.day ROWS UNBOUNDED PRECEDING
        )::double precision AS type_p_paid,
        COALESCE(op.paid_amount, 0) + SUM(COALESCE(ad.paid_amount, 0)) OVER (
          PARTITION BY vd."voucher" ORDER BY vd.day ROWS UNBOUNDED PRECEDING
        )::double precision AS payment_paid
      FROM voucher_days vd
      LEFT JOIN opening_events oe ON oe."voucher" = vd."voucher"
      LEFT JOIN opening_payments op ON op."voucher" = vd."voucher"
      LEFT JOIN activity_daily ad ON ad."voucher" = vd."voucher" AND ad.day = vd.day
    ),
    comparison AS (
      SELECT
        d.day,
        dfs.ap AS snapshot_ap,
        COALESCE(
          SUM(
            GREATEST(
              r.event_net - GREATEST(r.payment_paid - r.type_p_paid, 0),
              0
            )
          ),
          0
        )::double precision AS ledger_ap
      FROM days d
      LEFT JOIN "DailyFinancialSnapshot" dfs
        ON dfs."companyId" = $1 AND dfs.frequency = 'daily' AND dfs."snapshotDate" = d.day
      LEFT JOIN running r ON r.day = d.day
      GROUP BY d.day, dfs.ap
    )
    SELECT
      c.day::text AS day,
      c.snapshot_ap AS "snapshotAp",
      c.ledger_ap AS "ledgerAp",
      (c.ledger_ap - c.snapshot_ap)::double precision AS "ledgerVsSnapshot",
      (COALESCE(prev.ledger_ap, 0) - c.snapshot_ap)::double precision AS "ledgerMinusOneVsSnapshot",
      (COALESCE(next.ledger_ap, 0) - c.snapshot_ap)::double precision AS "ledgerPlusOneVsSnapshot"
    FROM comparison c
    LEFT JOIN comparison prev ON prev.day = c.day - 1
    LEFT JOIN comparison next ON next.day = c.day + 1
    WHERE c.day BETWEEN $2::date AND $3::date
    ORDER BY c.day
  `, companyId, startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10));

  return rows.filter((row) => {
    // Weekends, holidays and pre-coverage days have no books balance, so there
    // is nothing for the ledger to disagree with. Only a day that carries a
    // books AP balance can be a reconciliation failure.
    if (row.snapshotAp === null || row.snapshotAp === undefined) return false;
    if (row.ledgerAp === null || row.ledgerAp === undefined) return true;
    // The neighbour-day figures stay in the payload to expose a date shift,
    // but they cannot decide pass/fail: on a flat or zero balance every
    // neighbour ties too, which flagged days that reconcile exactly.
    return Math.abs(Number(row.ledgerVsSnapshot)) > TOLERANCE;
  });
}

const AP_ACCT_MATCH = `COALESCE(NULLIF(TRIM(t."apAcct"), ''), '30100') = '30100'`;

/**
 * Read-only view of the ledger the repair would produce, as of one date.
 * Reports open AP by age and the vouchers carrying it, so a variance can be
 * attributed to specific invoices instead of inferred from a daily total.
 */
async function explainOpenVouchers(tx: any, companyId: string, asOf: string) {
  const shared = `
    WITH vouchers AS (
      SELECT t."voucher", MIN(t."eventDate")::date AS created_at
      FROM "APTransactionFact" t
      WHERE t."companyId" = $1 AND ${AP_ACCT_MATCH}
        AND t."transType" = 'V' AND t."eventDate" <= $2::date
      GROUP BY t."voucher"
    ),
    voucher_meta AS (
      SELECT DISTINCT ON (t."voucher")
        t."voucher",
        NULLIF(TRIM(t."invoiceNum"), '') AS invoice_num,
        t."vendorName"
      FROM "APTransactionFact" t
      JOIN vouchers v ON v."voucher" = t."voucher"
      WHERE t."companyId" = $1 AND ${AP_ACCT_MATCH} AND t."transType" = 'V'
      ORDER BY t."voucher", t."eventDate" ASC
    ),
    events AS (
      SELECT
        t."voucher",
        SUM(t."normalizedAmount")::double precision AS event_net,
        SUM(CASE WHEN t."transType" = 'P' THEN ABS(t."normalizedAmount") ELSE 0 END)::double precision
          AS type_p_paid
      FROM "APTransactionFact" t
      JOIN vouchers v ON v."voucher" = t."voucher"
      WHERE t."companyId" = $1 AND t."eventDate" <= $2::date
      GROUP BY t."voucher"
    ),
    pays AS (
      SELECT vm."voucher", SUM(p."paidAmountHome")::double precision AS paid
      FROM voucher_meta vm
      JOIN "APPaymentFact" p
        ON p."companyId" = $1 AND p."paymentDate" <= $2::date
       AND (
         UPPER(TRIM(p."billNo")) = UPPER(TRIM(vm."voucher"))
         OR (vm.invoice_num IS NOT NULL AND UPPER(TRIM(p."billNo")) = UPPER(TRIM(vm.invoice_num)))
       )
      GROUP BY vm."voucher"
    ),
    open_items AS (
      SELECT
        v."voucher", v.created_at, vm."vendorName",
        COALESCE(e.event_net, 0) AS event_net,
        COALESCE(e.type_p_paid, 0) AS type_p_paid,
        COALESCE(pp.paid, 0) AS payment_paid,
        GREATEST(
          COALESCE(e.event_net, 0)
            - GREATEST(COALESCE(pp.paid, 0) - COALESCE(e.type_p_paid, 0), 0),
          0
        )::double precision AS open_amt,
        ($2::date - v.created_at) AS days_open
      FROM vouchers v
      LEFT JOIN voucher_meta vm ON vm."voucher" = v."voucher"
      LEFT JOIN events e ON e."voucher" = v."voucher"
      LEFT JOIN pays pp ON pp."voucher" = v."voucher"
    )`;

  const [buckets, top, books] = await Promise.all([
    tx.$queryRawUnsafe(
      `${shared}
       SELECT
         CASE
           WHEN days_open <= 30 THEN '1: 0-30'
           WHEN days_open <= 60 THEN '2: 31-60'
           WHEN days_open <= 90 THEN '3: 61-90'
           WHEN days_open <= 150 THEN '4: 91-150'
           ELSE '5: 151+'
         END AS age_bucket,
         COUNT(*) AS open_vouchers,
         ROUND(SUM(open_amt)::numeric, 2) AS open_ap
       FROM open_items WHERE open_amt > 0.005
       GROUP BY 1 ORDER BY 1`,
      companyId, asOf
    ),
    tx.$queryRawUnsafe(
      `${shared}
       SELECT
         "voucher", created_at::text AS created_at, "vendorName", days_open,
         ROUND(event_net::numeric, 2) AS event_net,
         ROUND(type_p_paid::numeric, 2) AS type_p_paid,
         ROUND(payment_paid::numeric, 2) AS payment_paid,
         ROUND(open_amt::numeric, 2) AS open_amt
       FROM open_items WHERE open_amt > 0.005
       ORDER BY open_amt DESC LIMIT 25`,
      companyId, asOf
    ),
    tx.$queryRawUnsafe(
      `SELECT ap FROM "DailyFinancialSnapshot"
       WHERE "companyId" = $1 AND frequency = 'daily' AND "snapshotDate" = $2::date`,
      companyId, asOf
    ),
  ]);

  return { asOf, booksAp: books?.[0]?.ap ?? null, buckets, topOpenVouchers: top };
}

/** Every rebuilt event on one voucher, to attribute a variance to its source rows. */
async function explainVoucher(tx: any, companyId: string, voucher: string) {
  const [events, payments] = await Promise.all([
    tx.$queryRawUnsafe(
      `SELECT
         "eventDate"::text AS event_date, "transType", "vouchSeq", "invoiceNum",
         ROUND("invoiceAmount"::numeric, 2) AS invoice_amount,
         ROUND("normalizedAmount"::numeric, 2) AS normalized_amount,
         "apAcct", "sourceProgram", "sourceItemId"
       FROM "APTransactionFact"
       WHERE "companyId" = $1 AND "voucher" = $2
       ORDER BY "eventDate", "transType", "vouchSeq"`,
      companyId, voucher
    ),
    tx.$queryRawUnsafe(
      `SELECT
         p."paymentDate"::text AS payment_date, p."billNo",
         ROUND(p."paidAmountHome"::numeric, 2) AS paid_amount,
         p."sourceProgram", p."sourceItemId"
       FROM "APPaymentFact" p
       WHERE p."companyId" = $1
         AND UPPER(TRIM(p."billNo")) IN (
           SELECT UPPER(TRIM($2))
           UNION
           SELECT UPPER(TRIM(t."invoiceNum")) FROM "APTransactionFact" t
           WHERE t."companyId" = $1 AND t."voucher" = $2 AND NULLIF(TRIM(t."invoiceNum"), '') IS NOT NULL
         )
       ORDER BY p."paymentDate"`,
      companyId, voucher
    ),
  ]);
  return { voucher, events, payments };
}

const EXPLAIN_ROLLBACK = 'AP_EXPLAIN_ROLLBACK';

async function main() {
  const args = process.argv.slice(2);
  const companyId = args.find((arg) => !arg.startsWith('--'))?.trim();
  if (!companyId) usage();

  // Diagnosis has to see the rebuilt ledger, not the stale one, so it runs the
  // same rebuild and then forces a rollback. Nothing is ever committed here.
  const explainArg = args.find((arg) => arg.startsWith('--explain='))?.slice(10);
  if (explainArg) {
    const asOf = parseDateArg(explainArg, '--explain').toISOString().slice(0, 10);
    const explainRaw = await loadRawApRecords(companyId);
    const explainFacts = buildFactRows(companyId, explainRaw);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.aPTransactionFact.deleteMany({
          where: { companyId, sourcePlatform: { in: ['INFOR_M3', 'INFOR_CSI'] } },
        });
        await tx.aPPaymentFact.deleteMany({
          where: { companyId, sourcePlatform: { in: ['INFOR_M3', 'INFOR_CSI'] } },
        });
        for (const batch of chunks(explainFacts.transactions)) {
          await tx.aPTransactionFact.createMany({ data: batch });
        }
        for (const batch of chunks(explainFacts.payments)) {
          await tx.aPPaymentFact.createMany({ data: batch });
        }
        const voucherArg = args.find((arg) => arg.startsWith('--voucher='))?.slice(10);
        const report = voucherArg
          ? await explainVoucher(tx, companyId, voucherArg)
          : await explainOpenVouchers(tx, companyId, asOf);
        console.log(JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
        throw new Error(EXPLAIN_ROLLBACK);
      }, { timeout: 300_000 });
    } catch (error) {
      if ((error as Error)?.message !== EXPLAIN_ROLLBACK) throw error;
    }
    return;
  }

  const startDate = parseDateArg(args.find((arg) => arg.startsWith('--start-date='))?.slice(13), '--start-date');
  const endDate = parseDateArg(args.find((arg) => arg.startsWith('--end-date='))?.slice(11), '--end-date');
  if (!args.includes('--confirm')) usage();
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
      // Chronological order buries the signal under the oldest quiet days.
      // Lead with the largest variances and the range they span.
      const worst = [...failures].sort(
        (a, b) => Math.abs(Number(b.ledgerVsSnapshot)) - Math.abs(Number(a.ledgerVsSnapshot))
      );
      throw new Error(
        `AP repair rolled back: ${failures.length} daily reconciliation failure(s) ` +
        `between ${failures[0].day} and ${failures[failures.length - 1].day}. ` +
        `Worst variances: ${JSON.stringify(worst.slice(0, 10))}`
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
