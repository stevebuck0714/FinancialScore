import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/set-account-anchors
 *
 * Body: {
 *   secret: string                       // CRON_SECRET
 *   companyId: string
 *   anchorDate: string                   // YYYY-MM-DD (EOD anchor date)
 *   source?: string                      // free-form provenance label
 *   notes?: string
 *   replaceExisting?: boolean            // if true, deletes ALL anchors for
 *                                        // (companyId, anchorDate) before
 *                                        // inserting; otherwise upserts in place
 *   accounts: Array<{
 *     accountId: string                  // must match GLTransactionFact.accountId
 *     accountName?: string
 *     accountCode?: string
 *     openingBalance: number | string    // GL-signed: debits +, credits -
 *   }>
 * }
 *
 * Upserts BalanceSheetAccountAnchor rows keyed on
 * (companyId, anchorDate, accountId).
 *
 * GET /api/admin/set-account-anchors?companyId=...&anchorDate=YYYY-MM-DD&secret=...
 *   Returns all anchors for the company (anchorDate optional filter).
 */

function checkSecret(request: NextRequest, bodySecret?: string): boolean {
  const expectedSecret = process.env.CRON_SECRET || 'dev-secret-change-me';
  const headerSecret = String(request.headers.get('x-cron-secret') || '').trim();
  const provided = (bodySecret && String(bodySecret).trim()) || headerSecret;
  return Boolean(provided && provided === expectedSecret);
}

function coerceFiniteNumber(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(/[, _$]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

type AccountAnchorInput = {
  accountId?: unknown;
  accountName?: unknown;
  accountCode?: unknown;
  openingBalance?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      secret?: string;
      companyId?: string;
      anchorDate?: string;
      source?: string;
      notes?: string;
      replaceExisting?: boolean;
      accounts?: AccountAnchorInput[];
    };

    if (!checkSecret(request, body.secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const companyId = String(body.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }

    const anchorStr = String(body.anchorDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorStr)) {
      return NextResponse.json(
        { error: 'anchorDate required as YYYY-MM-DD' },
        { status: 400 }
      );
    }
    const anchorDate = new Date(`${anchorStr}T00:00:00.000Z`);
    if (Number.isNaN(anchorDate.getTime())) {
      return NextResponse.json({ error: 'invalid anchorDate' }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'company not found' }, { status: 404 });
    }

    if (!Array.isArray(body.accounts) || body.accounts.length === 0) {
      return NextResponse.json(
        { error: 'accounts array required (at least one entry)' },
        { status: 400 }
      );
    }

    const seen = new Set<string>();
    const cleaned: Array<{
      accountId: string;
      accountName: string | null;
      accountCode: string | null;
      openingBalance: number;
    }> = [];
    const skipped: Array<{ index: number; reason: string }> = [];

    body.accounts.forEach((row, idx) => {
      const acctId = String(row?.accountId ?? '').trim();
      if (!acctId) {
        skipped.push({ index: idx, reason: 'missing accountId' });
        return;
      }
      if (seen.has(acctId)) {
        skipped.push({ index: idx, reason: `duplicate accountId ${acctId}` });
        return;
      }
      seen.add(acctId);
      const opening = coerceFiniteNumber(row?.openingBalance);
      const name = row?.accountName ? String(row.accountName).trim() : '';
      const code = row?.accountCode ? String(row.accountCode).trim() : '';
      cleaned.push({
        accountId: acctId,
        accountName: name || null,
        accountCode: code || null,
        openingBalance: opening,
      });
    });

    if (cleaned.length === 0) {
      return NextResponse.json(
        { error: 'no valid accounts in payload', skipped },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    if (body.replaceExisting === true) {
      const result = await prisma.balanceSheetAccountAnchor.deleteMany({
        where: { companyId, anchorDate },
      });
      deletedCount = result.count;
    }

    const upsertResults = await prisma.$transaction(
      cleaned.map((row) =>
        prisma.balanceSheetAccountAnchor.upsert({
          where: {
            companyId_anchorDate_accountId: {
              companyId,
              anchorDate,
              accountId: row.accountId,
            },
          },
          update: {
            accountName: row.accountName,
            accountCode: row.accountCode,
            openingBalance: row.openingBalance,
            source: body.source ?? null,
            notes: body.notes ?? null,
          },
          create: {
            companyId,
            anchorDate,
            accountId: row.accountId,
            accountName: row.accountName,
            accountCode: row.accountCode,
            openingBalance: row.openingBalance,
            source: body.source ?? null,
            notes: body.notes ?? null,
          },
        })
      )
    );

    const totalSigned = cleaned.reduce((sum, row) => sum + row.openingBalance, 0);

    return NextResponse.json({
      ok: true,
      companyId,
      companyName: company.name,
      anchorDate: anchorStr,
      requested: body.accounts.length,
      written: upsertResults.length,
      skipped,
      deletedBeforeWrite: deletedCount,
      totals: {
        sumOfOpeningBalances: totalSigned,
        // GL-signed totals should net to ~0 if the supplied accounts represent
        // a balanced trial balance. Non-zero just means the input was a
        // partial set (e.g. only BS-side accounts).
        balancedHint: Math.abs(totalSigned) < 0.01,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('set-account-anchors failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret') || undefined;
    if (!checkSecret(request, secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = String(url.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 });
    }
    const anchorDateStr = String(url.searchParams.get('anchorDate') || '').trim();
    let anchorDate: Date | undefined;
    if (anchorDateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)) {
        return NextResponse.json(
          { error: 'anchorDate must be YYYY-MM-DD if provided' },
          { status: 400 }
        );
      }
      anchorDate = new Date(`${anchorDateStr}T00:00:00.000Z`);
    }

    const anchors = await prisma.balanceSheetAccountAnchor.findMany({
      where: {
        companyId,
        ...(anchorDate ? { anchorDate } : {}),
      },
      orderBy: [{ anchorDate: 'desc' }, { accountId: 'asc' }],
    });

    return NextResponse.json({
      ok: true,
      companyId,
      anchorDate: anchorDateStr || null,
      count: anchors.length,
      anchors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('set-account-anchors GET failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
