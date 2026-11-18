import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { DATAROOM_BANK_STATEMENTS_FOLDER_ID } from '@/lib/dataroom/constants';
import { getDataRoomState } from '@/lib/dataroom/state';
import { resolveDataRoomCapabilities } from '@/lib/dataroom/access';

export class BankStatementsAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Only the Corelytics team (Site Admins and Consultants) reviews client transaction exports. */
export function canReviewStatementExports(role: string): boolean {
  return role === 'SITEADMIN' || role === 'CONSULTANT';
}

export async function requireStatementReviewAccess(companyId: string) {
  const context = await requireAuth();
  if (!companyId) throw new BankStatementsAccessError('companyId is required', 400);
  if (!(await validateCompanyAccess(companyId))) throw new BankStatementsAccessError('Forbidden', 403);
  if (!canReviewStatementExports(context.role)) {
    throw new BankStatementsAccessError('Only the Corelytics team can review transaction files.', 403);
  }
  return context;
}

/** The caller must be able to upload to this company's Data Room Bank Statements folder. */
export async function requireStatementUploadAccess(companyId: string) {
  const context = await requireAuth();
  if (!companyId) throw new BankStatementsAccessError('companyId is required', 400);
  if (!(await validateCompanyAccess(companyId))) throw new BankStatementsAccessError('Forbidden', 403);

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { userDefinedAllocations: true } });
  const ready = getDataRoomState(company?.userDefinedAllocations).folders.some(
    (f: { id?: string }) => String(f?.id) === DATAROOM_BANK_STATEMENTS_FOLDER_ID,
  );
  if (!ready) throw new BankStatementsAccessError('Enable the Data Room for this company before connecting a bank.', 409);

  const caps = await resolveDataRoomCapabilities({
    userId: context.userId,
    role: context.role,
    companyId,
    userDefinedAllocations: company?.userDefinedAllocations,
    folderId: DATAROOM_BANK_STATEMENTS_FOLDER_ID,
  });
  if (!caps.upload && !caps.manage) {
    throw new BankStatementsAccessError('Forbidden: Data Room upload access required', 403);
  }
  return context;
}
