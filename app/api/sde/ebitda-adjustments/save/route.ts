import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import { isValidBucket, isValidLineItem, type SdeBucket } from '@/lib/sde/adjustment-line-items';

export const dynamic = 'force-dynamic';

type SaveItem = {
  mappingId: string;
  ownerPercent: number | null;
  // null clears the bucket assignment; omit to leave unchanged
  sdeAdjustmentBucket?: SdeBucket | null;
  // null clears the line-item assignment; omit to leave unchanged
  sdeAdjustmentLineItem?: string | null;
};

function clampOwnerPct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function normalizeBucket(raw: unknown): SdeBucket | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const v = String(raw).trim().toUpperCase();
  return isValidBucket(v) ? (v as SdeBucket) : null;
}

function normalizeLineItem(raw: unknown, bucket: SdeBucket | null | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (!bucket) return null;
  const v = String(raw).trim();
  return isValidLineItem(bucket, v) ? v : null;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const companyId = String((body as Record<string, unknown>).companyId || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('SdeEbitdaAdjustments', companyId, 'WRITE');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const itemsRaw = (body as Record<string, unknown>).items;
    if (!Array.isArray(itemsRaw)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
    }

    const items: SaveItem[] = [];
    for (const raw of itemsRaw) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const mappingId = String(r.mappingId || '').trim();
      if (!mappingId) continue;
      const bucket = normalizeBucket(r.sdeAdjustmentBucket);
      // The line item must be valid for the (current or incoming) bucket.
      // If the bucket is being cleared, also clear the line item.
      const lineItem =
        bucket === null ? null : normalizeLineItem(r.sdeAdjustmentLineItem, bucket as SdeBucket | undefined);
      items.push({
        mappingId,
        ownerPercent: clampOwnerPct(r.ownerPercent),
        sdeAdjustmentBucket: bucket,
        sdeAdjustmentLineItem: lineItem,
      });
    }

    if (items.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0 });
    }

    let updated = 0;
    let skipped = 0;
    await withPrismaReconnectRetry(
      () =>
        prisma.$transaction(async (tx) => {
          for (const item of items) {
            // Confirm ownership of this mapping by companyId before update.
            const owns = await tx.$queryRaw<Array<{ id: string; bucket: string | null }>>`
              SELECT id, "sdeAdjustmentBucket" AS bucket FROM "AccountMapping"
              WHERE id = ${item.mappingId} AND "companyId" = ${companyId}
              LIMIT 1
            `;
            if (owns.length === 0) {
              skipped += 1;
              continue;
            }
            const currentBucket = owns[0].bucket as SdeBucket | null;

            // Decide what bucket / line-item to write. The line item is only
            // valid in the context of a bucket; if the line item is being
            // changed but the bucket isn't, validate against the existing one.
            let nextLineItem: string | null | undefined = item.sdeAdjustmentLineItem;
            if (nextLineItem !== undefined && nextLineItem !== null) {
              const targetBucket =
                item.sdeAdjustmentBucket === undefined
                  ? currentBucket
                  : (item.sdeAdjustmentBucket as SdeBucket | null);
              if (!targetBucket || !isValidLineItem(targetBucket, nextLineItem)) {
                nextLineItem = null;
              }
            }

            if (item.sdeAdjustmentBucket === undefined && nextLineItem === undefined) {
              await tx.$executeRaw`
                UPDATE "AccountMapping"
                SET "ownerPercent" = ${item.ownerPercent},
                    "updatedAt" = NOW()
                WHERE id = ${item.mappingId} AND "companyId" = ${companyId}
              `;
            } else if (item.sdeAdjustmentBucket === undefined) {
              await tx.$executeRaw`
                UPDATE "AccountMapping"
                SET "ownerPercent" = ${item.ownerPercent},
                    "sdeAdjustmentLineItem" = ${nextLineItem},
                    "updatedAt" = NOW()
                WHERE id = ${item.mappingId} AND "companyId" = ${companyId}
              `;
            } else if (nextLineItem === undefined) {
              await tx.$executeRaw`
                UPDATE "AccountMapping"
                SET "ownerPercent" = ${item.ownerPercent},
                    "sdeAdjustmentBucket" = ${item.sdeAdjustmentBucket},
                    "updatedAt" = NOW()
                WHERE id = ${item.mappingId} AND "companyId" = ${companyId}
              `;
            } else {
              await tx.$executeRaw`
                UPDATE "AccountMapping"
                SET "ownerPercent" = ${item.ownerPercent},
                    "sdeAdjustmentBucket" = ${item.sdeAdjustmentBucket},
                    "sdeAdjustmentLineItem" = ${nextLineItem},
                    "updatedAt" = NOW()
                WHERE id = ${item.mappingId} AND "companyId" = ${companyId}
              `;
            }
            updated += 1;
          }
        }),
      'sde-ebitda-adjustments.save.transaction',
    );

    return NextResponse.json({ updated, skipped });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('SDE EBITDA adjustments POST Prisma error:', error.code, error.message);
    } else {
      console.error('SDE EBITDA adjustments POST failed:', error);
    }
    return NextResponse.json(
      { error: 'Failed to save EBITDA adjustments', detail: String(error?.message || error) },
      { status: 500 },
    );
  }
}
