import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireSiteAdmin } from '@/lib/tenant-security';
import { INDUSTRY_SECTORS } from '@/lib/constants/company-options';
import { getDefaultSectorLayoutConfig, isLegacyOpsDefaultConfig, mergeIsolvedSector54LayoutModules } from '@/lib/operations/sector-layout-defaults';

export const dynamic = 'force-dynamic';

function getSectorList() {
  return INDUSTRY_SECTORS
    .map((sector) => sector.value)
    .filter((value) => value && value !== '01');
}

export async function GET(request: NextRequest) {
  const sectorCategory = request.nextUrl.searchParams.get('sectorCategory');

  if (sectorCategory) {
    await requireAuth();
    const config = await prisma.opsSectorLayoutConfig.findUnique({
      where: { sectorCategory },
      select: { sectorCategory: true, config: true, updatedAt: true },
    });
    if (!config) {
      return NextResponse.json({
        config: {
          sectorCategory,
          config: getDefaultSectorLayoutConfig(sectorCategory),
          updatedAt: null,
        },
      });
    }

    if (isLegacyOpsDefaultConfig(config.config)) {
      return NextResponse.json({
        config: {
          ...config,
          config: getDefaultSectorLayoutConfig(sectorCategory),
        },
      });
    }

    const storedConfig = config.config as { version?: number; layoutId?: string; modules?: string[] };
    const mergedConfig =
      sectorCategory === '54'
        ? mergeIsolvedSector54LayoutModules({
            version: Number(storedConfig?.version || 2),
            layoutId: String(storedConfig?.layoutId || `sector-${sectorCategory}`),
            modules: Array.isArray(storedConfig?.modules) ? storedConfig.modules : [],
          })
        : storedConfig;

    return NextResponse.json({
      config: {
        ...config,
        config: mergedConfig,
      },
    });
  }

  await requireSiteAdmin();
  const configs = await prisma.opsSectorLayoutConfig.findMany({
    select: { sectorCategory: true, config: true, updatedAt: true },
    orderBy: { sectorCategory: 'asc' },
  });

  return NextResponse.json({ configs });
}

export async function POST(request: NextRequest) {
  await requireSiteAdmin();

  const body = await request.json();

  if (body?.initializeDefaults) {
    const sectorCategories = getSectorList();
    const results = await Promise.all(
      sectorCategories.map((sectorCategory) =>
        prisma.opsSectorLayoutConfig.upsert({
          where: { sectorCategory },
          update: {},
          create: {
            sectorCategory,
            config: getDefaultSectorLayoutConfig(sectorCategory),
          },
          select: { sectorCategory: true, updatedAt: true },
        })
      )
    );
    return NextResponse.json({ initialized: results.length });
  }

  const { sectorCategory, config } = body || {};

  if (!sectorCategory) {
    return NextResponse.json({ error: 'sectorCategory is required' }, { status: 400 });
  }

  if (!config) {
    return NextResponse.json({ error: 'config is required' }, { status: 400 });
  }

  const saved = await prisma.opsSectorLayoutConfig.upsert({
    where: { sectorCategory },
    update: { config },
    create: { sectorCategory, config },
    select: { sectorCategory: true, config: true, updatedAt: true },
  });

  return NextResponse.json({ config: saved });
}
