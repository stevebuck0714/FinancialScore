import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { DATAROOM_CREDIT_CARD_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';
import { canUseQoeTab } from '@/lib/qoe/server-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!(await validateCompanyAccess(companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!(await canUseQoeTab(companyId, 'credit-card-review'))) {
      return NextResponse.json({ error: 'Forbidden: Credit Card Review access required' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
    const capabilities = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company?.userDefinedAllocations,
      folderId: DATAROOM_CREDIT_CARD_STATEMENTS_FOLDER_ID,
    });
    if (!capabilities.view) return NextResponse.json({ error: 'Forbidden: Data Room view access required' }, { status: 403 });

    const imports = await prisma.creditCardImport.findMany({
      where: { companyId },
      orderBy: { importedAt: 'desc' },
      include: {
        dataRoomDocument: { select: { id: true, originalFileName: true, storageAccess: true, createdAt: true } },
        transactions: {
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          take: 500,
          select: {
            id: true, accountLast4: true, accountName: true, date: true, amount: true, currency: true, description: true,
            merchantName: true, category: true, creditCategoryPrimary: true, creditCategoryDetailed: true,
            reviewClassification: true, reviewNote: true, reviewedAt: true,
          },
        },
      },
    });
    const dataRoomReady = getDataRoomState(company?.userDefinedAllocations).folders.some(
      (folder: { id?: string }) => folder.id === DATAROOM_CREDIT_CARD_STATEMENTS_FOLDER_ID,
    );
    return NextResponse.json({
      companyId,
      dataRoomReady,
      canImport: capabilities.upload || capabilities.manage,
      canReview: context.role === 'SITEADMIN' || context.role === 'CONSULTANT',
      imports,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Credit-card review load failed:', error);
    return NextResponse.json({ error: 'Failed to load credit-card review', detail: message }, { status: 500 });
  }
}
