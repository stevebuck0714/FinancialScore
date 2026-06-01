import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/set-bs-anchor
 *
 * Body: {
 *   secret: string                 // CRON_SECRET
 *   companyId: string
 *   anchorDate: string             // YYYY-MM-DD (EOD balance-sheet date)
 *   balances: {
 *     cash?, ar?, retainageReceivables?, contractAssets?, inventory?, otherCA?,
 *     fixedAssets?, constructionEquipment?, officeEquipment?, shopEquipment?,
 *     investments?, rightOfUseLeases?, otherAssets?,
 *     ap?, loc?, contractLiabilities?, otherCL?, ltd?,
 *     ownersCapital?, ownersDraw?, commonStock?, preferredStock?,
 *     retainedEarnings?, additionalPaidInCapital?, treasuryStock?
 *   }
 *   source?: string                // free-form provenance label
 *   notes?: string
 * }
 *
 * Upserts a `BalanceSheetAnchor` row keyed on (companyId, anchorDate).
 * Used as the trusted starting point for the daily-bs-from-gl rebuilder so
 * `DailyFinancialSnapshot` rows for snapshotDate >= anchorDate are computed
 * as `anchor[field] + GL_delta` instead of summing GL from time zero.
 *
 * GET /api/admin/set-bs-anchor?companyId=...&secret=...
 *   Returns all anchors for the company (debugging convenience).
 */

const ANCHOR_FIELDS = [
  'cash',
  'ar',
  'retainageReceivables',
  'contractAssets',
  'inventory',
  'otherCA',
  'fixedAssets',
  'constructionEquipment',
  'officeEquipment',
  'shopEquipment',
  'investments',
  'rightOfUseLeases',
  'otherAssets',
  'ap',
  'loc',
  'contractLiabilities',
  'otherCL',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
] as const;

type AnchorField = (typeof ANCHOR_FIELDS)[number];

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      secret?: string;
      companyId?: string;
      anchorDate?: string;
      balances?: Partial<Record<AnchorField, number | string>>;
      source?: string;
      notes?: string;
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

    const balances = body.balances || {};
    const data: Record<AnchorField, number> = {} as Record<AnchorField, number>;
    for (const field of ANCHOR_FIELDS) {
      data[field] = coerceFiniteNumber(balances[field]);
    }

    // Sanity: report whether the supplied balance sheet balances. This is
    // informational only; we still persist whatever the caller gave us.
    const totalAssets =
      data.cash + data.ar + data.retainageReceivables + data.contractAssets +
      data.inventory + data.otherCA + data.fixedAssets +
      data.constructionEquipment + data.officeEquipment + data.shopEquipment +
      data.investments + data.rightOfUseLeases + data.otherAssets;
    const totalLiab = data.ap + data.loc + data.contractLiabilities + data.otherCL + data.ltd;
    const totalEquity =
      data.ownersCapital + data.ownersDraw + data.commonStock +
      data.preferredStock + data.retainedEarnings +
      data.additionalPaidInCapital + data.treasuryStock;
    const totalLAndE = totalLiab + totalEquity;
    const drift = totalAssets - totalLAndE;

    const anchor = await prisma.balanceSheetAnchor.upsert({
      where: {
        companyId_anchorDate: { companyId, anchorDate },
      },
      update: {
        ...data,
        source: body.source ?? null,
        notes: body.notes ?? null,
      },
      create: {
        companyId,
        anchorDate,
        ...data,
        source: body.source ?? null,
        notes: body.notes ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      companyName: company.name,
      anchorId: anchor.id,
      anchorDate: anchorStr,
      balances: data,
      totals: {
        totalAssets,
        totalLiab,
        totalEquity,
        totalLAndE,
        drift,
        balanced: Math.abs(drift) < 0.01,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('set-bs-anchor failed', error);
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
    const anchors = await prisma.balanceSheetAnchor.findMany({
      where: { companyId },
      orderBy: { anchorDate: 'desc' },
    });
    return NextResponse.json({ ok: true, companyId, count: anchors.length, anchors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('set-bs-anchor GET failed', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
