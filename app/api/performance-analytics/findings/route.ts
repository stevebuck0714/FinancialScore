import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

type FindingType = 'trend' | 'anomaly' | 'driver' | 'focus' | 'opportunity';

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PerformanceFinding" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "metric" TEXT,
      "severity" TEXT,
      "confidence" FLOAT,
      "payload" JSONB NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PerformanceFinding_companyId_idx" ON "PerformanceFinding"("companyId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PerformanceFinding_type_idx" ON "PerformanceFinding"("type")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PerformanceFinding_updatedAt_idx" ON "PerformanceFinding"("updatedAt")
  `);
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId') || '';
    const type = searchParams.get('type') as FindingType | null;
    const severity = searchParams.get('severity');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('PerformanceFinding', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    await ensureTable();

    const filters: string[] = ['"companyId" = $1'];
    const values: any[] = [companyId];

    if (type) {
      filters.push(`"type" = $${values.length + 1}`);
      values.push(type);
    }
    if (severity) {
      filters.push(`"severity" = $${values.length + 1}`);
      values.push(severity);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const query = `
      SELECT "id", "companyId", "type", "metric", "severity", "confidence", "payload", "createdAt", "updatedAt"
      FROM "PerformanceFinding"
      ${whereSql}
      ORDER BY "updatedAt" DESC
      LIMIT ${limit}
    `;

    const findings = await prisma.$queryRawUnsafe(query, ...values);
    return NextResponse.json({ findings });
  } catch (error) {
    console.error('Performance analytics findings error:', error);
    return NextResponse.json(
      { error: 'Failed to load performance analytics findings', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    await ensureTable();

    const body = await request.json();
    const { companyId, type, metric, severity, confidence, payload } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ error: 'Finding type is required' }, { status: 400 });
    }
    if (!payload) {
      return NextResponse.json({ error: 'Finding payload is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('PerformanceFinding', companyId, 'WRITE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const id = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();

    await prisma.$executeRawUnsafe(
      `INSERT INTO "PerformanceFinding" ("id", "companyId", "type", "metric", "severity", "confidence", "payload", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamp, $9::timestamp)`,
      id,
      companyId,
      type,
      metric || null,
      severity || null,
      typeof confidence === 'number' ? confidence : null,
      JSON.stringify(payload),
      now,
      now
    );

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Performance analytics findings save error:', error);
    return NextResponse.json(
      { error: 'Failed to save performance analytics finding', details: String(error) },
      { status: 500 }
    );
  }
}
