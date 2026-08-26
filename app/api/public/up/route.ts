import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { enforceDatabaseSecurity } from '@/lib/db-security';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(ok: boolean, startedAt: number, status: number) {
  return NextResponse.json(
    { ok, ts: new Date().toISOString(), ms: Date.now() - startedAt },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  const startedAt = Date.now();
  try {
    enforceDatabaseSecurity();
    await prisma.$queryRaw`SELECT 1`;
    return json(true, startedAt, 200);
  } catch {
    return json(false, startedAt, 503);
  }
}
