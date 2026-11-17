import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';
import { loadBankStatementsState } from '@/lib/bank-statements/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    if (!(await validateCompanyAccess(companyId))) {
      await auditForbiddenAccess('BankStatements', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
    const capabilities = await resolveDataRoomCapabilities({
      userId: context.userId,
      role: context.role,
      companyId,
      userDefinedAllocations: company?.userDefinedAllocations,
      folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
    });
    if (!capabilities.view) {
      return NextResponse.json({ error: 'Forbidden: Data Room view access required' }, { status: 403 });
    }
    const dataRoomReady = getDataRoomState(company?.userDefinedAllocations).folders.some(
      (f: { id?: string }) => String(f?.id) === DATAROOM_BANK_STATEMENTS_FOLDER_ID,
    );

    const state = await withPrismaReconnectRetry(() => loadBankStatementsState(companyId), 'bank-statements.GET');
    return NextResponse.json({
      companyId,
      dataRoomReady,
      canUpload: capabilities.upload || capabilities.manage,
      ...state,
    });
  } catch (error) {
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Failed to load bank statements:', error);
    return NextResponse.json({ error: 'Failed to load bank statements', detail: message }, { status: 500 });
  }
}
