import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';

// This route depends on request URL/headers via auth + query parsing, so it must be dynamic.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CovenantAlert = {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning';
  status: 'active' | 'resolved';
  covenantName: string;
  timestamp: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('CovenantAlerts', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const loans = await prisma.loan.findMany({
      where: { companyId },
      include: {
        covenants: true,
      },
    });

    const alerts: CovenantAlert[] = [];

    loans.forEach((loan) => {
      (loan.covenants || []).forEach((covenant) => {
        const applicable = covenant.isApplicable ?? covenant.applicable ?? true;
        if (!applicable) return;
        const status = String(covenant.status || '').toUpperCase();
        if (status === 'WARNING' || status === 'BREACHED' || status === 'CRITICAL') {
          const severity = status === 'BREACHED' || status === 'CRITICAL' ? 'critical' : 'warning';
          const descriptionParts = [];
          if (covenant.currentValue != null && covenant.threshold != null) {
            descriptionParts.push(`Current value ${covenant.currentValue} vs threshold ${covenant.threshold}`);
          }
          if (covenant.covenantType) {
            descriptionParts.push(`Type: ${covenant.covenantType.toLowerCase()}`);
          }
          alerts.push({
            id: covenant.id,
            title: `${covenant.covenantName} ${status === 'WARNING' ? 'Warning' : 'Breach'}`,
            description: descriptionParts.join(' • ') || 'Covenant outside allowed range',
            severity,
            status: 'active',
            covenantName: covenant.covenantName,
            timestamp: covenant.updatedAt.toISOString(),
          });
        }
      });
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Covenant alerts error:', error);
    return NextResponse.json(
      { error: 'Failed to load covenant alerts', details: String(error) },
      { status: 500 }
    );
  }
}
