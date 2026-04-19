import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/admin/rebuild-aging-snapshots
 *
 * Body: {
 *   secret: string                       // CRON_SECRET (or x-cron-secret header)
 *   companyId: string
 *   startDate?: string                   // YYYY-MM-DD (inclusive). Default: earliest open snapshot.
 *   endDate?: string                     // YYYY-MM-DD (inclusive). Default: latest open snapshot.
 *   frequency?: 'daily'|'weekly'|'monthly'   (default 'daily')
 *   sides?: ('ar'|'ap')[]                (default ['ar','ap'])
 *   dryRun?: boolean                     (default false)
 * }
 *
 * Recomputes ARAgingSnapshot + APAgingSnapshot rows from
 * AROpenInvoiceSnapshot / APOpenBillSnapshot using the standard 5-bucket
 * scheme:
 *   Days Past Due = snapshotDate - COALESCE(dueDate, invoice/billDate)
 *     DPD < 0       -> Current (Not Yet Due)
 *     0 <= DPD <= 30 -> 1-30
 *     31-60         -> 31-60
 *     61-90         -> 61-90
 *     > 90 or NULL  -> 90+
 *
 * The "as of" date for aging is the row's own snapshotDate (NOT today). That's
 * what makes the historical aging trend valid: a December 2024 snapshot ages
 * its open invoices to 12/31/2024, not to today.
 *
 * Each (companyId, frequency, snapshotDate) gets one upserted aging row. Dates
 * for which no open invoices exist on that side are left untouched.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      secret?: string;
      companyId?: string;
      startDate?: string;
      endDate?: string;
      frequency?: string;
      sides?: string[];
      dryRun?: boolean;
    };

    const expectedSecret = process.env.CRON_SECRET || 'dev-secret-change-me';
    const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
    const providedSecret = (body.secret && String(body.secret).trim()) || headerSecret;
    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const companyId = String(body.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }

    const frequency = (() => {
      const raw = String(body.frequency || 'daily').toLowerCase().trim();
      if (raw === 'weekly' || raw === 'monthly' || raw === 'daily') return raw;
      return 'daily';
    })();

    const sides = (() => {
      const raw = Array.isArray(body.sides) && body.sides.length > 0
        ? body.sides.map((s) => String(s).toLowerCase().trim())
        : ['ar', 'ap'];
      return raw.filter((s) => s === 'ar' || s === 'ap') as ('ar' | 'ap')[];
    })();

    const startStr = String(body.startDate || '').trim();
    const endStr = String(body.endDate || '').trim();
    const hasStart = /^\d{4}-\d{2}-\d{2}$/.test(startStr);
    const hasEnd = /^\d{4}-\d{2}-\d{2}$/.test(endStr);
    const startDate = hasStart ? new Date(`${startStr}T00:00:00.000Z`) : null;
    const endDate = hasEnd ? new Date(`${endStr}T23:59:59.999Z`) : null;

    const dryRun = Boolean(body.dryRun);

    const result: {
      side: 'ar' | 'ap';
      datesProcessed: number;
      sample: Array<{
        snapshotDate: string;
        total: number;
        current: number;
        days1to30: number;
        days31to60: number;
        days61to90: number;
        days90plus: number;
      }>;
    }[] = [];

    for (const side of sides) {
      const isAr = side === 'ar';
      const sourceTable = isAr ? '"AROpenInvoiceSnapshot"' : '"APOpenBillSnapshot"';
      const fallbackDateCol = isAr ? '"invoiceDate"' : '"billDate"';

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          snapshotDate: Date;
          total: number;
          current: number;
          days1to30: number;
          days31to60: number;
          days61to90: number;
          days90plus: number;
        }>
      >(
        `
        SELECT
          "snapshotDate",
          SUM(COALESCE("amountDueHome", 0))::float AS "total",
          SUM(
            CASE
              WHEN COALESCE("dueDate", ${fallbackDateCol}) IS NULL THEN 0
              WHEN ("snapshotDate"::date - COALESCE("dueDate", ${fallbackDateCol})::date) < 0
                THEN COALESCE("amountDueHome", 0)
              ELSE 0
            END
          )::float AS "current",
          SUM(
            CASE
              WHEN COALESCE("dueDate", ${fallbackDateCol}) IS NULL THEN 0
              WHEN ("snapshotDate"::date - COALESCE("dueDate", ${fallbackDateCol})::date) BETWEEN 0 AND 30
                THEN COALESCE("amountDueHome", 0)
              ELSE 0
            END
          )::float AS "days1to30",
          SUM(
            CASE
              WHEN COALESCE("dueDate", ${fallbackDateCol}) IS NULL THEN 0
              WHEN ("snapshotDate"::date - COALESCE("dueDate", ${fallbackDateCol})::date) BETWEEN 31 AND 60
                THEN COALESCE("amountDueHome", 0)
              ELSE 0
            END
          )::float AS "days31to60",
          SUM(
            CASE
              WHEN COALESCE("dueDate", ${fallbackDateCol}) IS NULL THEN 0
              WHEN ("snapshotDate"::date - COALESCE("dueDate", ${fallbackDateCol})::date) BETWEEN 61 AND 90
                THEN COALESCE("amountDueHome", 0)
              ELSE 0
            END
          )::float AS "days61to90",
          SUM(
            CASE
              WHEN COALESCE("dueDate", ${fallbackDateCol}) IS NULL
                OR ("snapshotDate"::date - COALESCE("dueDate", ${fallbackDateCol})::date) > 90
                THEN COALESCE("amountDueHome", 0)
              ELSE 0
            END
          )::float AS "days90plus"
        FROM ${sourceTable}
        WHERE "companyId" = $1
          AND "frequency" = $2
          AND ($3::timestamptz IS NULL OR "snapshotDate" >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR "snapshotDate" <= $4::timestamptz)
        GROUP BY "snapshotDate"
        ORDER BY "snapshotDate"
        `,
        companyId,
        frequency,
        startDate,
        endDate
      );

      if (!dryRun) {
        for (const row of rows) {
          if (isAr) {
            await prisma.aRAgingSnapshot.upsert({
              where: {
                companyId_snapshotDate_frequency: {
                  companyId,
                  snapshotDate: row.snapshotDate,
                  frequency,
                },
              },
              update: {
                totalAR: Number(row.total || 0),
                current: Number(row.current || 0),
                days1to30: Number(row.days1to30 || 0),
                days31to60: Number(row.days31to60 || 0),
                days61to90: Number(row.days61to90 || 0),
                days90plus: Number(row.days90plus || 0),
              },
              create: {
                companyId,
                snapshotDate: row.snapshotDate,
                frequency,
                totalAR: Number(row.total || 0),
                current: Number(row.current || 0),
                days1to30: Number(row.days1to30 || 0),
                days31to60: Number(row.days31to60 || 0),
                days61to90: Number(row.days61to90 || 0),
                days90plus: Number(row.days90plus || 0),
              },
            });
          } else {
            await prisma.aPAgingSnapshot.upsert({
              where: {
                companyId_snapshotDate_frequency: {
                  companyId,
                  snapshotDate: row.snapshotDate,
                  frequency,
                },
              },
              update: {
                totalAP: Number(row.total || 0),
                current: Number(row.current || 0),
                days1to30: Number(row.days1to30 || 0),
                days31to60: Number(row.days31to60 || 0),
                days61to90: Number(row.days61to90 || 0),
                days90plus: Number(row.days90plus || 0),
              },
              create: {
                companyId,
                snapshotDate: row.snapshotDate,
                frequency,
                totalAP: Number(row.total || 0),
                current: Number(row.current || 0),
                days1to30: Number(row.days1to30 || 0),
                days31to60: Number(row.days31to60 || 0),
                days61to90: Number(row.days61to90 || 0),
                days90plus: Number(row.days90plus || 0),
              },
            });
          }
        }
      }

      result.push({
        side,
        datesProcessed: rows.length,
        sample: rows.slice(-5).map((r) => ({
          snapshotDate: r.snapshotDate.toISOString().slice(0, 10),
          total: Number(r.total || 0),
          current: Number(r.current || 0),
          days1to30: Number(r.days1to30 || 0),
          days31to60: Number(r.days31to60 || 0),
          days61to90: Number(r.days61to90 || 0),
          days90plus: Number(r.days90plus || 0),
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      companyId,
      frequency,
      sides,
      dryRun,
      startDate: startStr || null,
      endDate: endStr || null,
      result,
    });
  } catch (e: any) {
    console.error('[rebuild-aging-snapshots] error', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
