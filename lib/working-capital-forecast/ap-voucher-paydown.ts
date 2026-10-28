import prisma from '@/lib/prisma';
import { getApBalanceSheetAnchorConfig } from '@/lib/financial/ap-balance-sheet-anchor';

type BucketKey = 'current' | 'bucket30to60' | 'bucket60to90' | 'bucket90plus';

export type ApVoucherPaydownProfile = {
  /** Last day with AP payment events; rates and opening mix are measured through it. */
  asOfDate: string;
  /** Share of each bucket's open voucher balance paid within the following week. */
  weeklyPaydownRateByBucket: Record<BucketKey, number>;
  /** Opening AP age mix at asOfDate, as shares of open voucher balance. */
  openingBucketShares: Record<BucketKey, number>;
  /**
   * Share of opening AP paid in each forecast week. Open vouchers age a week at
   * a time and pay at the rate of the bucket they are in that week.
   */
  shareOfOpeningPaidByWeek: number[];
};

const HISTORY_WEEKS = 13;
const FORECAST_WEEKS = 13;

function bucketForDaysPastDue(daysPastDue: number): BucketKey {
  if (daysPastDue < 0) return 'current';
  if (daysPastDue <= 30) return 'bucket30to60';
  if (daysPastDue <= 60) return 'bucket60to90';
  return 'bucket90plus';
}

/**
 * Weekly paydown % by aging bucket, measured on the same voucher reconstruction
 * the AP Aging Trend uses (APTransactionFact V/P events plus unmatched
 * APPaymentFact, due dates from voucher → vendor → N30 terms). For each of the
 * last 13 weeks, vouchers open at the week start are bucketed by days past due
 * and compared with their open balance seven days later.
 *
 * Bucket keys follow the forecast engine: bucket30to60 holds 0–30 days past
 * due, bucket60to90 31–60, bucket90plus 61+.
 */
export async function loadApVoucherPaydownProfile(companyId: string): Promise<ApVoucherPaydownProfile | null> {
  const apAcct = getApBalanceSheetAnchorConfig(companyId)?.accounts[0]?.accountId;
  if (!apAcct) return null;

  const ledger = await prisma.$queryRawUnsafe<Array<{ max_p: Date | null }>>(
    `SELECT MAX("eventDate")::date AS max_p
     FROM "APTransactionFact"
     WHERE "companyId" = $1 AND "apAcct" = $2 AND "transType" = 'P'`,
    companyId,
    apAcct,
  );
  const maxPayment = ledger[0]?.max_p ? new Date(ledger[0].max_p) : null;
  if (!maxPayment) return null;
  const asOfDate = maxPayment.toISOString().slice(0, 10);

  const rows = await prisma.$queryRawUnsafe<Array<{ kind: string; bucket: string; dpd: number | null; start_amt: number; paid_amt: number }>>(
    `WITH voucher_creates AS (
       SELECT voucher, MIN("eventDate")::date AS created_at
       FROM "APTransactionFact"
       WHERE "companyId" = $1
         AND COALESCE(NULLIF(TRIM("apAcct"), ''), $2) = $2
         AND "transType" = 'V'
         AND "eventDate" <= $3::date
       GROUP BY voucher
     ),
     voucher_meta AS (
       SELECT DISTINCT ON (t.voucher)
         t.voucher,
         t."vendorId" AS vendor_id,
         t."invoiceDate"::date AS invoice_date,
         NULLIF(TRIM(t."invoiceNum"), '') AS invoice_num,
         NULLIF(TRIM(t."termsCode"), '') AS voucher_terms_code
       FROM "APTransactionFact" t
       JOIN voucher_creates vc ON vc.voucher = t.voucher
       WHERE t."companyId" = $1
         AND COALESCE(NULLIF(TRIM(t."apAcct"), ''), $2) = $2
         AND t."transType" = 'V'
       ORDER BY t.voucher, t."eventDate" ASC
     ),
     vendor_terms AS (
       SELECT DISTINCT ON ("vendorId")
         "vendorId",
         NULLIF(TRIM("termsCode"), '') AS vendor_terms_code
       FROM "VendorSnapshot"
       WHERE "companyId" = $1
         AND "vendorId" IS NOT NULL
         AND "termsCode" IS NOT NULL
         AND TRIM("termsCode") <> ''
       ORDER BY "vendorId", "snapshotDate" DESC
     ),
     voucher_due AS (
       SELECT
         vm.voucher,
         (COALESCE(vm.invoice_date, vc.created_at) + (CASE
           WHEN vm.voucher_terms_code = 'N5'  THEN 5
           WHEN vm.voucher_terms_code = 'N30' THEN 30
           WHEN vm.voucher_terms_code = 'N45' THEN 45
           WHEN vm.voucher_terms_code = 'N60' THEN 60
           WHEN vm.voucher_terms_code = 'N80' THEN 80
           WHEN vm.voucher_terms_code = 'N90' THEN 90
           WHEN vm.voucher_terms_code = 'DUR' THEN 0
           WHEN vt.vendor_terms_code  = 'N5'  THEN 5
           WHEN vt.vendor_terms_code  = 'N30' THEN 30
           WHEN vt.vendor_terms_code  = 'N45' THEN 45
           WHEN vt.vendor_terms_code  = 'N60' THEN 60
           WHEN vt.vendor_terms_code  = 'N80' THEN 80
           WHEN vt.vendor_terms_code  = 'N90' THEN 90
           WHEN vt.vendor_terms_code  = 'DUR' THEN 0
           ELSE 30
         END || ' days')::interval)::date AS due_date
       FROM voucher_meta vm
       JOIN voucher_creates vc ON vc.voucher = vm.voucher
       LEFT JOIN vendor_terms vt ON vt."vendorId" = vm.vendor_id
     ),
     event_daily AS (
       SELECT t.voucher, t."eventDate"::date AS dt, SUM(t."normalizedAmount")::float8 AS amt
       FROM "APTransactionFact" t
       JOIN voucher_creates vc ON vc.voucher = t.voucher
       WHERE t."companyId" = $1
         AND t."eventDate" <= $3::date
       GROUP BY t.voucher, t."eventDate"::date
     ),
     type_p_daily AS (
       SELECT t.voucher, t."eventDate"::date AS dt, SUM(ABS(t."normalizedAmount"))::float8 AS amt
       FROM "APTransactionFact" t
       JOIN voucher_creates vc ON vc.voucher = t.voucher
       WHERE t."companyId" = $1 AND t."transType" = 'P'
         AND t."eventDate" <= $3::date
       GROUP BY t.voucher, t."eventDate"::date
     ),
     payment_facts AS (
       SELECT UPPER(TRIM("billNo")) AS bill_key, "paymentDate"::date AS dt, SUM("paidAmountHome")::float8 AS paid_amt
       FROM (
         SELECT "billNo", "paymentDate", "vendorName", "paidAmountHome"
         FROM "APPaymentFact"
         WHERE "companyId" = $1
           AND "paidAmountHome" <> 0
           AND "billNo" IS NOT NULL
           AND TRIM("billNo") <> ''
           AND "paymentDate" <= $3::date
         GROUP BY "billNo", "paymentDate", "vendorName", "paidAmountHome"
       ) d
       GROUP BY 1, 2
     ),
     payment_by_voucher_day AS (
       SELECT voucher, dt, SUM(paid_amt)::float8 AS amt
       FROM (
         SELECT vm.voucher, pf.dt, pf.paid_amt
         FROM voucher_meta vm
         JOIN payment_facts pf ON pf.bill_key = UPPER(TRIM(vm.voucher))
         UNION ALL
         SELECT vm.voucher, pf.dt, pf.paid_amt
         FROM voucher_meta vm
         JOIN payment_facts pf ON vm.invoice_num IS NOT NULL AND pf.bill_key = UPPER(TRIM(vm.invoice_num))
       ) matched
       GROUP BY voucher, dt
     ),
     voucher_changes AS (
       SELECT voucher, dt, SUM(event_amt)::float8 AS event_amt, SUM(paid_amt)::float8 AS paid_amt, SUM(tp_amt)::float8 AS tp_amt
       FROM (
         SELECT voucher, dt, amt AS event_amt, 0::float8 AS paid_amt, 0::float8 AS tp_amt FROM event_daily
         UNION ALL
         SELECT voucher, dt, 0, amt, 0 FROM payment_by_voucher_day
         UNION ALL
         SELECT voucher, dt, 0, 0, amt FROM type_p_daily
       ) c
       GROUP BY voucher, dt
     ),
     voucher_running AS (
       SELECT
         voucher,
         dt,
         LEAD(dt) OVER w AS next_dt,
         SUM(event_amt) OVER w AS event_net,
         SUM(paid_amt) OVER w AS paid_amt,
         SUM(tp_amt) OVER w AS paid_in_events
       FROM voucher_changes
       WINDOW w AS (PARTITION BY voucher ORDER BY dt)
     ),
     voucher_segments AS (
       SELECT
         vr.voucher,
         GREATEST(vr.dt, vc.created_at) AS from_dt,
         vr.next_dt AS to_dt,
         GREATEST(vr.event_net - GREATEST(vr.paid_amt - vr.paid_in_events, 0), 0) AS open_amt
       FROM voucher_running vr
       JOIN voucher_creates vc ON vc.voucher = vr.voucher
       WHERE vr.next_dt IS NULL OR vr.next_dt > vc.created_at
     ),
     sample_dates AS (
       SELECT ($3::date - (k * 7))::date AS start_d, 'roll'::text AS kind
       FROM generate_series(1, ${HISTORY_WEEKS}) k
       UNION ALL
       SELECT $3::date, 'mix'
     ),
     open_at_start AS (
       SELECT sd.kind, sd.start_d, vs.voucher, vs.open_amt,
              (sd.start_d - vd.due_date)::int AS dpd,
              CASE
                WHEN sd.start_d - vd.due_date < 0 THEN 'current'
                WHEN sd.start_d - vd.due_date <= 30 THEN 'bucket30to60'
                WHEN sd.start_d - vd.due_date <= 60 THEN 'bucket60to90'
                ELSE 'bucket90plus'
              END AS bucket
       FROM sample_dates sd
       JOIN voucher_segments vs ON sd.start_d >= vs.from_dt AND (vs.to_dt IS NULL OR sd.start_d < vs.to_dt)
       JOIN voucher_due vd ON vd.voucher = vs.voucher
       WHERE vs.open_amt > 0
     ),
     open_a_week_later AS (
       SELECT s.start_d, s.voucher, vs.open_amt
       FROM open_at_start s
       JOIN voucher_segments vs
         ON vs.voucher = s.voucher
        AND (s.start_d + 7) >= vs.from_dt
        AND (vs.to_dt IS NULL OR (s.start_d + 7) < vs.to_dt)
       WHERE s.kind = 'roll'
     )
     SELECT s.kind, s.bucket,
            CASE WHEN s.kind = 'mix' THEN s.dpd END AS dpd,
            SUM(s.open_amt)::float8 AS start_amt,
            SUM(CASE WHEN s.kind = 'roll' THEN GREATEST(0, s.open_amt - COALESCE(w.open_amt, 0)) ELSE 0 END)::float8 AS paid_amt
     FROM open_at_start s
     LEFT JOIN open_a_week_later w ON s.kind = 'roll' AND w.start_d = s.start_d AND w.voucher = s.voucher
     GROUP BY 1, 2, 3`,
    companyId,
    apAcct,
    asOfDate,
  );

  const keys: BucketKey[] = ['current', 'bucket30to60', 'bucket60to90', 'bucket90plus'];
  const roll = new Map<string, { start: number; paid: number }>();
  const mix = new Map<string, number>();
  const openingByDaysPastDue: Array<{ dpd: number; amount: number }> = [];
  for (const row of rows) {
    if (row.kind === 'roll') {
      roll.set(row.bucket, { start: Number(row.start_amt || 0), paid: Number(row.paid_amt || 0) });
    } else {
      const amount = Number(row.start_amt || 0);
      mix.set(row.bucket, (mix.get(row.bucket) || 0) + amount);
      openingByDaysPastDue.push({ dpd: Number(row.dpd || 0), amount });
    }
  }

  const totalStart = keys.reduce((sum, key) => sum + (roll.get(key)?.start || 0), 0);
  const totalPaid = keys.reduce((sum, key) => sum + (roll.get(key)?.paid || 0), 0);
  if (totalStart <= 0) return null;
  const overallRate = Math.min(1, totalPaid / totalStart);
  const weeklyPaydownRateByBucket = {} as Record<BucketKey, number>;
  for (const key of keys) {
    const bucket = roll.get(key);
    weeklyPaydownRateByBucket[key] = bucket && bucket.start > 0 ? Math.min(1, bucket.paid / bucket.start) : overallRate;
  }

  const openingTotal = keys.reduce((sum, key) => sum + (mix.get(key) || 0), 0);
  const openingBucketShares = {} as Record<BucketKey, number>;
  for (const key of keys) {
    openingBucketShares[key] = openingTotal > 0 ? (mix.get(key) || 0) / openingTotal : 0;
  }

  const shareOfOpeningPaidByWeek = new Array<number>(FORECAST_WEEKS).fill(0);
  if (openingTotal > 0) {
    for (const cohort of openingByDaysPastDue) {
      let remaining = cohort.amount / openingTotal;
      for (let week = 0; week < FORECAST_WEEKS && remaining > 0; week += 1) {
        const paid = remaining * weeklyPaydownRateByBucket[bucketForDaysPastDue(cohort.dpd + week * 7)];
        shareOfOpeningPaidByWeek[week] += paid;
        remaining -= paid;
      }
    }
  }

  return { asOfDate, weeklyPaydownRateByBucket, openingBucketShares, shareOfOpeningPaidByWeek };
}
