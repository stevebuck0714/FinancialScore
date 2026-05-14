import { NextRequest, NextResponse } from 'next/server';
import { processPendingCompanyDocuments } from '@/lib/company-documents/process-pending';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authHeader = String(request.headers.get('authorization') || '').trim();
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const limit = Number(request.nextUrl.searchParams.get('limit') || 5);
    const result = await processPendingCompanyDocuments({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Company document cron processor failed:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to process company documents' },
      { status: 500 }
    );
  }
}
