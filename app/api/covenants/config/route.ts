import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

async function ensureCovenantThresholdColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Covenant"
      ADD COLUMN IF NOT EXISTS "warningThreshold" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "breachThreshold" DOUBLE PRECISION
  `);
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const updates = Array.isArray(body?.updates) ? body.updates : [];

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }
    if (!updates.length) {
      return NextResponse.json({ error: 'No covenant updates provided' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('CovenantConfig', companyId, 'UPDATE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    await ensureCovenantThresholdColumns();

    const results: Array<{ id: string; ok: boolean }> = [];

    for (const update of updates) {
      const covenantId = String(update?.id || '').trim();
      if (!covenantId) continue;

      const threshold = update.threshold != null ? Number(update.threshold) : null;
      const warningThreshold = update.warningThreshold != null ? Number(update.warningThreshold) : null;
      const breachThreshold = update.breachThreshold != null ? Number(update.breachThreshold) : null;
      const applicable = update.isApplicable ?? update.applicable;

      try {
        await prisma.$executeRawUnsafe(
          `
          UPDATE "Covenant"
          SET
            "threshold" = $1,
            "warningThreshold" = $2,
            "breachThreshold" = $3,
            "isApplicable" = COALESCE($4, "isApplicable"),
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = $5
          `,
          threshold,
          warningThreshold,
          breachThreshold,
          applicable ?? null,
          covenantId
        );
        results.push({ id: covenantId, ok: true });
        continue;
      } catch (error) {
        // Fallback to legacy column name "applicable" when "isApplicable" doesn't exist
      }

      try {
        await prisma.$executeRawUnsafe(
          `
          UPDATE "Covenant"
          SET
            "threshold" = $1,
            "warningThreshold" = $2,
            "breachThreshold" = $3,
            "applicable" = COALESCE($4, "applicable"),
            "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = $5
          `,
          threshold,
          warningThreshold,
          breachThreshold,
          applicable ?? null,
          covenantId
        );
        results.push({ id: covenantId, ok: true });
      } catch (error) {
        console.warn('Failed to update covenant config', { covenantId, error });
        results.push({ id: covenantId, ok: false });
      }
    }

    return NextResponse.json({ updated: results });
  } catch (error) {
    console.error('Covenant config update error:', error);
    return NextResponse.json(
      { error: 'Failed to update covenant configuration', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const loanId = String(body?.loanId || '').trim();
    const covenants = Array.isArray(body?.covenants) ? body.covenants : [];

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }
    if (!loanId) {
      return NextResponse.json({ error: 'Loan ID is required' }, { status: 400 });
    }
    if (!covenants.length) {
      return NextResponse.json({ error: 'No covenants provided' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('CovenantConfig', companyId, 'CREATE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    await ensureCovenantThresholdColumns();

    const results: Array<{ name: string; ok: boolean }> = [];

    for (const covenant of covenants) {
      const covenantId = crypto.randomUUID();
      const name = String(covenant?.covenantName || covenant?.name || 'Covenant');
      const covenantType = String(covenant?.covenantType || 'MINIMUM').toUpperCase();
      const threshold = covenant?.threshold != null ? Number(covenant.threshold) : null;
      const warningThreshold = covenant?.warningThreshold != null ? Number(covenant.warningThreshold) : null;
      const breachThreshold = covenant?.breachThreshold != null ? Number(covenant.breachThreshold) : null;
      const currentValue = covenant?.currentValue != null ? Number(covenant.currentValue) : null;
      const status = String(covenant?.status || 'COMPLIANT').toUpperCase();
      const isApplicable = covenant?.isApplicable ?? covenant?.applicable ?? true;
      const description = covenant?.description || covenant?.notes || null;

      try {
        await prisma.$executeRawUnsafe(
          `
          INSERT INTO "Covenant"
            ("id", "loanId", "covenantName", "covenantType", "threshold", "warningThreshold", "breachThreshold", "currentValue", "status", "isApplicable", "description", "updatedAt")
          VALUES
            ($1, $2, $3, $4::"CovenantType", $5, $6, $7, $8, $9::"CovenantStatus", $10, $11, CURRENT_TIMESTAMP)
          `,
          covenantId,
          loanId,
          name,
          covenantType,
          threshold,
          warningThreshold,
          breachThreshold,
          currentValue,
          status,
          isApplicable,
          description
        );
        results.push({ name, ok: true });
        continue;
      } catch (error: any) {
        // Fallback to legacy schema
      }

      try {
        const legacyType =
          covenantType === 'AFFIRMATIVE' || covenantType === 'NEGATIVE' || covenantType === 'INCURRENCE'
            ? covenantType
            : 'FINANCIAL';
        const legacyStatus = status === 'BREACHED' ? 'BREACH' : status;
        await prisma.$executeRawUnsafe(
          `
          INSERT INTO "Covenant"
            ("id", "loanId", "covenantName", "covenantType", "threshold", "alertLevel", "applicable", "notes", "updatedAt")
          VALUES
            ($1, $2, $3, $4::"CovenantType", $5, $6::"CovenantStatus", $7, $8, CURRENT_TIMESTAMP)
          `,
          covenantId,
          loanId,
          name,
          legacyType,
          threshold,
          legacyStatus,
          isApplicable,
          description
        );
        results.push({ name, ok: true });
      } catch (error: any) {
        console.warn('Failed to insert covenant', { name, error });
        results.push({ name, ok: false, error: String(error?.message || error) } as any);
      }
    }

    return NextResponse.json({ created: results });
  } catch (error) {
    console.error('Covenant config create error:', error);
    return NextResponse.json(
      { error: 'Failed to create covenants', details: String(error) },
      { status: 500 }
    );
  }
}
