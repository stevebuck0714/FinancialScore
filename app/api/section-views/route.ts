import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';
import { isTrafficSectionKey, MAX_SECTION_SEGMENT_MS } from '@/lib/traffic/sections';

export const dynamic = 'force-dynamic';

const MAX_START_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Records time a client user spent in a sidebar section. Sent as a beacon when
 * the user leaves the section or hides the tab, so it always answers 204 and
 * never surfaces an error to the page.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await requireAuth();
    // Only client users count toward a client's traffic.
    if (context.role !== 'USER' || !context.companyId) return new NextResponse(null, { status: 204 });

    const body = await request.json().catch(() => null);
    if (!body || !isTrafficSectionKey(body.section)) return new NextResponse(null, { status: 204 });

    const now = Date.now();
    const durationMs = Math.min(MAX_SECTION_SEGMENT_MS, Math.max(0, Math.round(Number(body.durationMs) || 0)));
    const startedAtMs = Date.parse(String(body.startedAt || ''));
    const startedAt =
      Number.isFinite(startedAtMs) && startedAtMs <= now && now - startedAtMs <= MAX_START_AGE_MS
        ? new Date(startedAtMs)
        : new Date(now - durationMs);

    await prisma.sectionView.create({
      data: {
        companyId: context.companyId,
        userId: context.userId,
        section: body.section,
        isResume: body.isResume === true,
        durationMs,
        startedAt,
      },
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('Unauthorized'))) {
      console.warn('Failed to record section view:', error);
    }
  }
  return new NextResponse(null, { status: 204 });
}
