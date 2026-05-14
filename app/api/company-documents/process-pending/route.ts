import { NextRequest, NextResponse } from 'next/server';
import { processPendingCompanyDocuments } from '@/lib/company-documents/process-pending';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export const dynamic = 'force-dynamic';

function hasCronAccess(request: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  try {
    const cronAccess = hasCronAccess(request);
    let companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    const limit = Number(request.nextUrl.searchParams.get('limit') || 3);

    if (!cronAccess) {
      await requireAuth();
      if (!companyId) {
        return NextResponse.json({ error: 'companyId is required unless called by cron' }, { status: 400 });
      }
      const hasAccess = await validateCompanyAccess(companyId);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (!companyId) companyId = '';
    const result = await processPendingCompanyDocuments({
      ...(companyId ? { companyId } : {}),
      limit,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Company document pending processor failed:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process pending company documents' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
