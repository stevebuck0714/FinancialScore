import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';

export async function GET() {
  try {
    if (process.env.NODE_ENV === 'production') {
      const { requireAuth } = await import('@/lib/tenant-security');
      const context = await requireAuth();
      if (context.role !== 'SITEADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const rows = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      industrySector: string | null;
      industrySectorCategory: string | null;
    }>>`
      SELECT id, name, "industrySector", "industrySectorCategory"
      FROM "Company"
      WHERE "consultantId" IS NULL
        AND COALESCE(name, '') NOT LIKE '% (DELETED)%'
      ORDER BY name ASC
    `;

    return NextResponse.json({
      companies: (rows || []).map((row) => ({
        id: row.id,
        name: row.name,
        industrySector: row.industrySector,
        industrySectorCategory: resolveCompanyIndustrySectorCategory(row),
        consultantId: null,
      })),
    });
  } catch (error: any) {
    console.error('Failed to load standalone businesses', error);
    return NextResponse.json(
      { error: 'Failed to load standalone businesses', details: error?.message },
      { status: 500 },
    );
  }
}
