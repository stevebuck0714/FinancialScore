import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { ensureRealEstateWaterfallTables } from '@/lib/real-estate/waterfall-tables';
import { loadQbdInvestorActivity } from '@/lib/real-estate/qbd-investor-activity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
  if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
  await requireAuth();
  if (!(await validateCompanyAccess(companyId))) {
    await auditForbiddenAccess('Company', companyId, 'OPERATIONS_REAL_ESTATE_READ');
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureRealEstateWaterfallTables();
    const [investors, aliases] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ id: string; legalName: string }>>(
        'SELECT "id", "legalName" FROM "RealEstateInvestor" WHERE "companyId"=$1',
        companyId,
      ).catch(() => []),
      prisma.$queryRawUnsafe<Array<{ alias: string; investorId: string }>>(
        'SELECT "alias", "investorId" FROM "RealEstateInvestorAlias" WHERE "companyId"=$1',
        companyId,
      ),
    ]);
    return NextResponse.json(await loadQbdInvestorActivity(companyId, investors, aliases));
  } catch (error) {
    console.error('QuickBooks investor activity load failed', {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load QuickBooks member activity.' }, { status: 500 });
  }
}
