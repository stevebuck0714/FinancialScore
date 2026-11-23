import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';

export const dynamic = 'force-dynamic';

const WRITE_ROLES = new Set(['SITEADMIN', 'CONSULTANT']);

const DOCUMENT_REQUIREMENTS = [
  ['Financial records', 'Accounting-system connection or trial balance', 'Accounting / Financials'],
  ['Financial records', 'Monthly income statements and balance sheets', 'Accounting / Financials'],
  ['Financial records', 'General ledger detail', 'Accounting / Financials'],
  ['Financial records', 'Bank reconciliation reports', 'Bank Statements'],
  ['Revenue and operations', 'Receivables aging and customer data', 'Supporting Documents'],
  ['Cash Proof evidence', 'Business bank statement PDFs for every relevant account and month', 'Bank Statements'],
  ['Cash Proof evidence', 'Bank CSV/XLSX transaction exports where statements are unavailable', 'Bank Statements'],
  ['Cash Proof evidence', 'Merchant processor settlement reports', 'Supporting Documents'],
  ['Cash Proof evidence', 'Company-card statements', 'Credit Card Statements'],
  ['Cash Proof evidence', 'Account inventory and bank / transaction contact', 'Engagement Tracker'],
  ['Tax and reconciliation', 'Federal and state business tax returns', 'Tax'],
  ['Tax and reconciliation', 'IRS transcripts, if required by lender', 'Tax'],
  ['Tax and reconciliation', 'CPA-prepared financial statements', 'Supporting Documents'],
  ['QoE adjustments', 'Invoices, settlements, contracts, and receipts supporting add-backs', 'Supporting Documents'],
  ['QoE adjustments', 'Owner and family payroll / compensation / draw detail', 'Supporting Documents'],
  ['QoE adjustments', 'Related-party agreements and payment support', 'Supporting Documents'],
  ['Debt, leases, and non-operating cash', 'Loan notes, debt schedules, and agreements', 'Loan Documents'],
  ['Debt, leases, and non-operating cash', 'Equipment and real-estate lease agreements', 'Supporting Documents'],
  ['Debt, leases, and non-operating cash', 'Asset sales, insurance proceeds, refunds, and owner contribution support', 'Supporting Documents'],
  ['Revenue and operations', 'Customer contracts and renewals', 'Supporting Documents'],
  ['Revenue and operations', 'Fixed-asset and maintenance records', 'Supporting Documents'],
] as const;

const CONTACT_TYPES = [
  'PRIMARY_CLIENT',
  'ACCOUNTING_ADMIN',
  'BOOKKEEPER_OR_CPA',
  'BANK_ADMIN',
  'TRANSACTION_CONTACT',
] as const;

const TRACKER_INCLUDE = {
  accountManager: { select: { id: true, name: true, email: true } },
  lender: true,
  contacts: { orderBy: { sortOrder: 'asc' as const } },
  bankAccounts: { orderBy: { sortOrder: 'asc' as const } },
  documentRequirements: { orderBy: { sortOrder: 'asc' as const } },
};

function date(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function text(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

async function assertStaffAccess(companyId: string, action: 'READ' | 'UPDATE') {
  const context = await requireAuth();
  if (!(await validateCompanyAccess(companyId))) {
    await auditForbiddenAccess('QoE Engagement Tracker', companyId, action);
    return { context, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!WRITE_ROLES.has(context.role)) {
    await auditForbiddenAccess('QoE Engagement Tracker', companyId, action);
    return {
      context,
      response: NextResponse.json({ error: 'Only consultants and site admins can access the QoE Engagement Tracker' }, { status: 403 }),
    };
  }
  return { context, response: null };
}

async function getOrCreateTracker(companyId: string) {
  return prisma.qoeEngagementTracker.upsert({
    where: { companyId },
    create: {
      companyId,
      contacts: {
        create: CONTACT_TYPES.map((contactType, sortOrder) => ({ contactType, sortOrder })),
      },
      documentRequirements: {
        create: DOCUMENT_REQUIREMENTS.map(([category, requirement, dataRoomFolder], sortOrder) => ({
          category,
          requirement,
          dataRoomFolder,
          sortOrder,
        })),
      },
    },
    update: {},
    include: TRACKER_INCLUDE,
  });
}

async function trackerResponse(companyId: string) {
  const [tracker, company, accountManagers, lenders, dataRoomDocuments, cashProof] = await Promise.all([
    getOrCreateTracker(companyId),
    prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } }),
    prisma.user.findMany({
      where: { isAccountManager: true, isExternal: false },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    }),
    prisma.qoeLender.findMany({ orderBy: { name: 'asc' } }),
    prisma.dataRoomDocument.findMany({
      where: { companyId },
      select: { id: true, originalFileName: true, category: true, statementMonth: true, statementAccountLast4: true },
    }),
    prisma.cashProofEngagement.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, lockedAt: true, bankAccounts: { select: { id: true, accountName: true, accountLast4: true, included: true } } },
    }),
  ]);

  return {
    companyId,
    tracker,
    company: { accountingSystem: company?.accountingSystem || '' },
    accountManagers,
    lenders,
    dataRoom: {
      documentCount: dataRoomDocuments.length,
      bankStatementCount: dataRoomDocuments.filter((document) => document.statementMonth || document.statementAccountLast4).length,
      taxDocumentCount: dataRoomDocuments.filter((document) => document.category === 'TAX_DOCUMENTS').length,
    },
    cashProof: cashProof
      ? {
          status: cashProof.status,
          lockedAt: cashProof.lockedAt,
          accountCount: cashProof.bankAccounts.filter((account) => account.included).length,
          accounts: cashProof.bankAccounts,
        }
      : null,
  };
}

function errorResponse(error: unknown, fallback: string) {
  const message = String((error as Error)?.message || error);
  if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  console.error(`${fallback}:`, error);
  return NextResponse.json({ error: fallback, detail: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    const access = await assertStaffAccess(companyId, 'READ');
    if (access.response) return access.response;
    return NextResponse.json(await withPrismaReconnectRetry(() => trackerResponse(companyId), 'qoe-engagement-tracker.GET'));
  } catch (error) {
    return errorResponse(error, 'Failed to load QoE Engagement Tracker');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const companyId = String(body?.companyId || '').trim();
    const action = String(body?.action || '').trim();
    if (!companyId || !action) return NextResponse.json({ error: 'companyId and action are required' }, { status: 400 });
    const access = await assertStaffAccess(companyId, 'UPDATE');
    if (access.response) return access.response;
    const tracker = await getOrCreateTracker(companyId);

    if (action === 'update-tracker') {
      const accountManagerUserId = text(body.accountManagerUserId);
      const accountManager = accountManagerUserId
        ? await prisma.user.findFirst({
            where: { id: accountManagerUserId, isAccountManager: true, isExternal: false },
            select: { id: true, name: true },
          })
        : null;
      if (accountManagerUserId && !accountManager) {
        return NextResponse.json({ error: 'Select a valid Corelytics Account Manager' }, { status: 400 });
      }
      const lenderId = text(body.lenderId);
      const lender = lenderId ? await prisma.qoeLender.findUnique({ where: { id: lenderId }, select: { id: true, name: true } }) : null;
      if (lenderId && !lender) return NextResponse.json({ error: 'Select a valid lender' }, { status: 400 });
      await prisma.qoeEngagementTracker.update({
        where: { id: tracker.id },
        data: {
          engagementType: text(body.engagementType),
          reviewPeriodStart: text(body.reviewPeriodStart),
          reviewPeriodEnd: text(body.reviewPeriodEnd),
          fiscalYearEndMonth: body.fiscalYearEndMonth ? Number(body.fiscalYearEndMonth) : null,
          reportDueDate: date(body.reportDueDate),
          accountManagerUserId: accountManager?.id || null,
          accountManagerName: accountManager?.name || null,
          lenderId: lender?.id || null,
          corelyticsAccountant: text(body.corelyticsAccountant),
          teamLeadName: text(body.teamLeadName),
          lenderName: lender?.name || null,
          loanOfficerName: text(body.loanOfficerName),
          buyerOrBrokerName: text(body.buyerOrBrokerName),
        },
      });
    } else if (action === 'update-accounting-system') {
      await prisma.company.update({
        where: { id: companyId },
        data: { accountingSystem: text(body.accountingSystem) },
      });
    } else if (action === 'update-lender') {
      const name = text(body.name);
      if (!name) return NextResponse.json({ error: 'Lender name is required' }, { status: 400 });
      const lenderId = String(body.lenderId || '');
      if (!lenderId || !(await prisma.qoeLender.findUnique({ where: { id: lenderId }, select: { id: true } }))) {
        return NextResponse.json({ error: 'Select a valid lender' }, { status: 400 });
      }
      const duplicate = await prisma.qoeLender.findFirst({ where: { name, NOT: { id: lenderId } }, select: { id: true } });
      if (duplicate) return NextResponse.json({ error: 'Another lender already has this name' }, { status: 400 });
      await prisma.qoeLender.update({
        where: { id: lenderId },
        data: {
          name,
          address1: text(body.address1),
          address2: text(body.address2),
          city: text(body.city),
          state: text(body.state),
          zip: text(body.zip),
          country: text(body.country),
        },
      });
      await prisma.qoeEngagementTracker.updateMany({ where: { lenderId }, data: { lenderName: name } });
    } else if (action === 'create-lender') {
      const name = text(body.name);
      if (!name) return NextResponse.json({ error: 'Lender name is required' }, { status: 400 });
      const lender = await prisma.qoeLender.upsert({
        where: { name },
        create: {
          name,
          address1: text(body.address1),
          address2: text(body.address2),
          city: text(body.city),
          state: text(body.state),
          zip: text(body.zip),
          country: text(body.country),
        },
        update: {},
      });
      await prisma.qoeEngagementTracker.update({
        where: { id: tracker.id },
        data: { lenderId: lender.id, lenderName: lender.name },
      });
    } else if (action === 'create-contact') {
      await prisma.qoeEngagementTrackerContact.create({
        data: { trackerId: tracker.id, contactType: text(body.contactType) || 'OTHER', sortOrder: tracker.contacts.length },
      });
    } else if (action === 'update-contact') {
      await prisma.qoeEngagementTrackerContact.updateMany({
        where: { id: String(body.id), trackerId: tracker.id },
        data: {
          contactType: text(body.contactType) || 'OTHER', name: text(body.name), role: text(body.role), email: text(body.email),
          phone: text(body.phone), preferredContactMethod: text(body.preferredContactMethod), notes: text(body.notes),
        },
      });
    } else if (action === 'delete-contact') {
      await prisma.qoeEngagementTrackerContact.deleteMany({ where: { id: String(body.id), trackerId: tracker.id } });
    } else if (action === 'create-bank-account') {
      await prisma.qoeEngagementTrackerBankAccount.create({ data: { trackerId: tracker.id, sortOrder: tracker.bankAccounts.length } });
    } else if (action === 'update-bank-account') {
      await prisma.qoeEngagementTrackerBankAccount.updateMany({
        where: { id: String(body.id), trackerId: tracker.id },
        data: {
          institution: text(body.institution), accountName: text(body.accountName), accountType: text(body.accountType), last4: text(body.last4),
          legalEntity: text(body.legalEntity), purpose: text(body.purpose), receivesCustomerPayments: Boolean(body.receivesCustomerPayments),
          statementsNeeded: Boolean(body.statementsNeeded), statementsFromMonth: text(body.statementsFromMonth), statementsThroughMonth: text(body.statementsThroughMonth),
          bankContactName: text(body.bankContactName), status: text(body.status) || 'IDENTIFIED', notes: text(body.notes),
        },
      });
    } else if (action === 'delete-bank-account') {
      await prisma.qoeEngagementTrackerBankAccount.deleteMany({ where: { id: String(body.id), trackerId: tracker.id } });
    } else if (action === 'create-document-requirement') {
      await prisma.qoeEngagementDocumentRequirement.create({
        data: { trackerId: tracker.id, category: 'Other', requirement: 'New requirement', sortOrder: tracker.documentRequirements.length },
      });
    } else if (action === 'update-document-requirement') {
      await prisma.qoeEngagementDocumentRequirement.updateMany({
        where: { id: String(body.id), trackerId: tracker.id },
        data: {
          category: text(body.category) || 'Other', requirement: text(body.requirement) || 'New requirement',
          required: Boolean(body.required), status: text(body.status) || 'NOT_REQUESTED', owner: text(body.owner),
          requestedDate: date(body.requestedDate), dueDate: date(body.dueDate), receivedDate: date(body.receivedDate),
          dataRoomFolder: text(body.dataRoomFolder), notes: text(body.notes),
        },
      });
    } else if (action === 'delete-document-requirement') {
      await prisma.qoeEngagementDocumentRequirement.deleteMany({ where: { id: String(body.id), trackerId: tracker.id } });
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json(await trackerResponse(companyId));
  } catch (error) {
    return errorResponse(error, 'Failed to update QoE Engagement Tracker');
  }
}
