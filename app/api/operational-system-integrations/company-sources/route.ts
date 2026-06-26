import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { listOperationalSystemConnections } from '@/lib/operational/operational-system-connections';
import { BAKERS_COGS_LABEL, BAKERS_COGS_SOURCE_CODE } from '@/lib/operational/bakers-cogs';
import { COGENT_RATE_CARD_LABEL, COGENT_RATE_CARD_SOURCE_CODE } from '@/lib/operational/cogent-rate-card';

export const dynamic = 'force-dynamic';

const SOURCE_LABELS: Record<string, string> = {
  BAMBOOHR_STANDARD: 'BambooHR',
  [BAKERS_COGS_SOURCE_CODE]: BAKERS_COGS_LABEL,
  [COGENT_RATE_CARD_SOURCE_CODE]: COGENT_RATE_CARD_LABEL,
  PLATOS_CLOSET_STORE_VISIT: 'MONTHLY STORE VISIT REPORT',
  PLATOS_INVENTORY: 'Monthly Inventory Report',
  CREWTRACKS: 'Crewtracks',
  HILTI: 'Hilti',
  ICE_ENCOMPASS: 'ICE Encompass',
  LANTRAX_PROFIT_POWER: 'Profit Power Enterprise',
};

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      return NextResponse.json({ ok: false, error: 'companyId is required' }, { status: 400 });
    }
    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }

    const selectedSources = await listOperationalSystemConnections(companyId);

    return NextResponse.json({
      ok: true,
      companyId,
      accountingSystem: company.accountingSystem || null,
      selectedSources: selectedSources.map((source) => {
        const metadata =
          source.connectionMetadata && typeof source.connectionMetadata === 'object' && !Array.isArray(source.connectionMetadata)
            ? (source.connectionMetadata as Record<string, unknown>)
            : {};
        return {
          provider: source.provider,
          sourceCode: source.sourceCode,
          label: SOURCE_LABELS[source.sourceCode] || source.sourceCode,
          status: source.status,
          lastSyncAt: source.lastSyncAt,
          errorMessage: source.errorMessage,
          workbookUpload:
            source.sourceCode === 'PLATOS_CLOSET_STORE_VISIT'
              ? metadata.platosClosetWorkbookUpload || null
              : source.sourceCode === 'PLATOS_INVENTORY'
                ? metadata.platosInventoryWorkbookUpload || null
              : source.sourceCode === BAKERS_COGS_SOURCE_CODE
                ? metadata.bakersCogsWorkbookUpload || null
              : source.sourceCode === COGENT_RATE_CARD_SOURCE_CODE
                ? metadata.cogentRateCardWorkbookUpload || null
              : null,
          parsedWorkbook:
            source.sourceCode === 'PLATOS_CLOSET_STORE_VISIT'
              ? metadata.platosClosetParsedWorkbook || null
              : source.sourceCode === 'PLATOS_INVENTORY'
                ? metadata.platosInventoryParsedWorkbook || null
              : source.sourceCode === BAKERS_COGS_SOURCE_CODE
                ? metadata.bakersCogsParsedWorkbook || null
              : source.sourceCode === COGENT_RATE_CARD_SOURCE_CODE
                ? metadata.cogentRateCardParsedWorkbook || null
              : null,
        };
      }),
    });
  } catch (error: any) {
    console.error('Failed to load company operational sources:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to load company operational sources' }, { status: 500 });
  }
}
