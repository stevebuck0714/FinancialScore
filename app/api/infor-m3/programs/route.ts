import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';

type AccountingProgram = {
  module: string;
  miProgram: string;
};

const DEFAULT_PROGRAMS: AccountingProgram[] = [
  { module: 'Accounts', miProgram: 'CRS630MI' },
  { module: 'Cash', miProgram: 'CRS690MI, CRS691MI, CRS692MI' },
  { module: 'AR', miProgram: 'ARS200MI' },
  { module: 'AP', miProgram: 'APS200MI' },
  { module: 'Customer', miProgram: 'CRS610MI' },
  { module: 'Supplier', miProgram: 'CRS620MI' },
  { module: 'Inventory', miProgram: 'MMS200MI, MWS070MI' },
  { module: 'Sales', miProgram: 'OIS100MI' },
];

function sanitizePrograms(value: unknown): AccountingProgram[] {
  if (!Array.isArray(value)) return [];
  const cleaned: AccountingProgram[] = [];
  for (const row of value) {
    const module = typeof row?.module === 'string' ? row.module.trim() : '';
    const miProgram = typeof row?.miProgram === 'string' ? row.miProgram.trim() : '';
    if (!module && !miProgram) continue;
    if (!module || !miProgram) {
      throw new Error('Each accounting program row must include both module and MI program.');
    }
    cleaned.push({ module, miProgram });
  }
  return cleaned;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request);

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        connectionMetadata: true,
      },
    });

    const metadata =
      connection?.connectionMetadata && typeof connection.connectionMetadata === 'object'
        ? (connection.connectionMetadata as Record<string, unknown>)
        : {};

    const programs = sanitizePrograms(metadata.accountingPrograms);

    return NextResponse.json({
      ok: true,
      companyId,
      programs: programs.length > 0 ? programs : DEFAULT_PROGRAMS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to load accounting programs',
        details: message,
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const programs = sanitizePrograms(body.programs);

    const existing = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      select: {
        connectionMetadata: true,
      },
    });

    const existingMetadata =
      existing?.connectionMetadata && typeof existing.connectionMetadata === 'object'
        ? (existing.connectionMetadata as Record<string, unknown>)
        : {};

    const mergedMetadata = {
      ...existingMetadata,
      accountingPrograms: programs,
      accountingProgramsUpdatedAt: new Date().toISOString(),
    };

    await prisma.accountingConnection.upsert({
      where: {
        companyId_platform: {
          companyId,
          platform: 'INFOR_M3',
        },
      },
      update: {
        connectionMetadata: mergedMetadata,
      },
      create: {
        companyId,
        platform: 'INFOR_M3',
        status: 'INACTIVE',
        autoSync: false,
        syncFrequency: 'manual',
        connectionMetadata: mergedMetadata,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      programs,
      message: 'Accounting programs saved for this company.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to save accounting programs',
        details: message,
      },
      { status }
    );
  }
}
