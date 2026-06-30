import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { getAccountingSystemModule } from '@/lib/accounting-systems/registry';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ system: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { system } = await context.params;
    const plugin = getAccountingSystemModule(system);
    if (!plugin) {
      return NextResponse.json({ ok: false, error: `Unknown accounting system: ${system}` }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);

    await prisma.accountingConnection.update({
      where: { companyId_platform: { companyId, platform: plugin.platform } },
      data: {
        status: 'INACTIVE',
        autoSync: false,
        errorMessage: null,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      platform: plugin.platform,
      status: 'INACTIVE',
      message: `${plugin.label} disconnected.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
