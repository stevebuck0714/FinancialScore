import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

// Records that the signed-in user opened this company's Team Assessment.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string };
    const companyId = String(body.companyId || '').trim();
    if (!companyId) return new NextResponse(null, { status: 204 });

    const context = await requireCompanyAccess(companyId);
    await prisma.userCompanyAccess.updateMany({
      where: { userId: context.userId, companyId },
      data: { assessmentLastOpenedAt: new Date() },
    });
  } catch (error) {
    if (!(error instanceof Error && /^(Unauthorized|Forbidden)/.test(error.message))) {
      console.warn('Failed to record Team Assessment visit:', error);
    }
  }
  return new NextResponse(null, { status: 204 });
}
