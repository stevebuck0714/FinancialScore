import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';

const COMPANY_SCOPED_TABLE_DELETE_ORDER = [
  'FinancialForecastBudgetArchive',
  'FinancialForecastInputSettings',
  'CustomReport',
  'UserCompanyAccess',
  'CompanyDocumentChunk',
  'DataRoomDocument',
  'CompanyDocument',
  'MonthlyFinancial',
  'FinancialRecord',
  'AssessmentRecord',
  'CompanyProfile',
  'AccountingConnection',
  'OperationalSystemConnection',
  'PlatosClosetMonthlyFact',
  'PlatosClosetWorkbookSnapshot',
  'ApiSyncLog',
  'PulseExecBriefingCache',
  'PulseDailySummary',
  'InforSyncTaskAttempt',
  'InforSyncTask',
  'InforSyncRun',
  'InforRawRecord',
  'InforRawBatch',
  'InforRawCompleteness',
  'InforItemOverviewCache',
  'AccountMapping',
  'XeroTransaction',
  'PaymentTransaction',
  'SubscriptionEvent',
  'Subscription',
  'RevenueRecord',
  'Loan',
  'CustomerSalesSnapshot',
  'ARAgingSnapshot',
  'AROpenInvoiceSnapshot',
  'ARPaymentFact',
  'GLTransactionFact',
  'APTransactionFact',
  'ARTransactionFact',
  'ARInvoiceDetail',
  'ARInvoiceOriginMap',
  'CustomerContractStatus',
  'CustomerCashFlow',
  'CustomerOrderLineSnapshot',
  'SalesInvoiceHeaderSnapshot',
  'APOpenBillSnapshot',
  'APPaymentFact',
  'APAgingSnapshot',
  'VendorSnapshot',
  'ProductSalesSnapshot',
  'InventorySnapshot',
  'CashSnapshot',
  'DailyFinancialSnapshot',
  'DailyFinancialImportRun',
  'FinancialMonthPublish',
  'DailyFinancialMappedLine',
  'BalanceSheetAnchor',
  'BalanceSheetAccountAnchor',
] as const;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function getExistingCompanyScopedTables(): Promise<Set<string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tableName: string }>>(
    `SELECT tablename AS "tableName"
     FROM pg_catalog.pg_tables
     WHERE schemaname = 'public'
       AND tablename = ANY($1::text[])`,
    COMPANY_SCOPED_TABLE_DELETE_ORDER as unknown as string[],
  );
  return new Set(rows.map((row) => row.tableName));
}

async function deleteCompanyScopedRows(tx: any, tableName: string, companyId: string) {
  await tx.$executeRawUnsafe(
    `DELETE FROM ${quoteIdentifier(tableName)} WHERE "companyId" = $1`,
    companyId,
  );
}

async function hasCompanyColumn(columnName: string): Promise<boolean> {
  const runtimeCompanyModel = ((prisma as any)?._runtimeDataModel?.models?.Company || null) as
    | { fields?: Array<{ name?: string }> }
    | null;
  if (runtimeCompanyModel?.fields?.length) {
    const supportsField = runtimeCompanyModel.fields.some((field) => field?.name === columnName);
    if (!supportsField) return false;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Company'
          AND column_name = ${columnName}
      ) as "exists"
    `;
    return rows[0]?.exists === true;
  } catch (error) {
    console.warn(`Could not verify Company.${columnName} column`, error);
    return false;
  }
}

async function hasConsultantColumn(columnName: string): Promise<boolean> {
  const runtimeConsultantModel = ((prisma as any)?._runtimeDataModel?.models?.Consultant || null) as
    | { fields?: Array<{ name?: string }> }
    | null;
  if (runtimeConsultantModel?.fields?.length) {
    const supportsField = runtimeConsultantModel.fields.some((field) => field?.name === columnName);
    if (!supportsField) return false;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Consultant'
          AND column_name = ${columnName}
      ) as "exists"
    `;
    return rows[0]?.exists === true;
  } catch (error) {
    console.warn(`Could not verify Consultant.${columnName} column`, error);
    return false;
  }
}

// GET all consultants (site admin only) or single consultant by ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('id');

    // If ID is provided, fetch single consultant
    if (consultantId) {
      const consultant = await prisma.consultant.findUnique({
        where: { id: consultantId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      });

      if (!consultant) {
        return NextResponse.json(
          { error: 'Consultant not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: consultant.id,
        fullName: consultant.fullName,
        companyName: consultant.companyName,
        email: consultant.user.email,
        phone: consultant.phone,
        address: consultant.address,
        type: consultant.type,
        userId: consultant.userId
      });
    }

    // Otherwise, fetch all consultants
    const includeCommercialInvoiceDate = await hasCompanyColumn('commercialInvoiceDate');
    const includeCommercialNextDueDate = await hasCompanyColumn('commercialNextDueDate');
    const includeCompanyReferralPartnerId = await hasCompanyColumn('referralPartnerId');
    const includeConsultantReferralPartnerId = await hasConsultantColumn('referralPartnerId');
    const includeConsultantReferralSetupPercentage = await hasConsultantColumn('referralSetupFeePercentage');
    const includeConsultantReferralRecurringPercentage = await hasConsultantColumn('referralRecurringFeePercentage');
    const consultants = await prisma.consultant.findMany({
      select: {
        id: true,
        userId: true,
        type: true,
        fullName: true,
        address: true,
        phone: true,
        revenueSharePercentage: true,
        paymentMethod: true,
        taxId: true,
        createdAt: true,
        updatedAt: true,
        companyAddress1: true,
        companyAddress2: true,
        companyCity: true,
        companyName: true,
        companyState: true,
        companyWebsite: true,
        companyZip: true,
        ...(includeConsultantReferralPartnerId ? { referralPartnerId: true } : {}),
        ...(includeConsultantReferralSetupPercentage ? { referralSetupFeePercentage: true } : {}),
        ...(includeConsultantReferralRecurringPercentage ? { referralRecurringFeePercentage: true } : {}),
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        companies: {
          select: {
            id: true,
            name: true,
            consultantId: true,
            industrySector: true,
            addressStreet: true,
            addressCity: true,
            addressState: true,
            addressZip: true,
            addressCountry: true,
            subscriptionMonthlyPrice: true,
            subscriptionQuarterlyPrice: true,
            subscriptionAnnualPrice: true,
            selectedSubscriptionPlan: true,
            affiliateCode: true,
            ...(includeCompanyReferralPartnerId ? { referralPartnerId: true } : {}),
            referralPartnerConsultantId: true,
            referralSetupFeePercentage: true,
            referralRecurringFeePercentage: true,
            commercialBillingMethod: true,
            commercialPaymentStatus: true,
            commercialInvoiceNumber: true,
            commercialInvoiceUrl: true,
            ...(includeCommercialInvoiceDate ? { commercialInvoiceDate: true } : {}),
            commercialPaymentDate: true,
            ...(includeCommercialNextDueDate ? { commercialNextDueDate: true } : {}),
            commercialTermsNotes: true,
            _count: {
              select: {
                users: true
              }
            }
          }
        },
        _count: {
          select: {
            companies: true
          }
        }
      },
      orderBy: { fullName: 'asc' }
    });

    return NextResponse.json({ consultants });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create new consultant
export async function POST(request: NextRequest) {
  try {
    const { 
      fullName, email, password, address, phone, type,
      companyName, companyAddress1, companyAddress2, companyCity, companyState, companyZip, companyWebsite
    } = await request.json();

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Full name, email, and password required' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { 
          error: 'Password does not meet requirements',
          details: passwordValidation.errors
        },
        { status: 400 }
      );
    }

    // Normalize email to lowercase for consistency
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: fullName,
          passwordHash,
          role: 'CONSULTANT',
          isPrimaryContact: true // New consultants are primary contacts
        }
      });

      const consultant = await tx.consultant.create({
        data: {
          userId: user.id,
          fullName,
          address: address || '',
          phone: phone || '',
          type: type || 'consultant',
          companyName: companyName || '',
          companyAddress1: companyAddress1 || '',
          companyAddress2: companyAddress2 || '',
          companyCity: companyCity || '',
          companyState: companyState || '',
          companyZip: companyZip || '',
          companyWebsite: companyWebsite || ''
        }
      });

      // Update user to link to consultant firm for team member queries
      await tx.user.update({
        where: { id: user.id },
        data: { consultantId: consultant.id }
      });

      return { user, consultant };
    });

    return NextResponse.json({
      consultant: {
        id: result.consultant.id,
        fullName: result.consultant.fullName,
        email: result.user.email,
        phone: result.consultant.phone,
        address: result.consultant.address,
        type: result.consultant.type,
        companyName: result.consultant.companyName,
        companyAddress1: result.consultant.companyAddress1,
        companyAddress2: result.consultant.companyAddress2,
        companyCity: result.consultant.companyCity,
        companyState: result.consultant.companyState,
        companyZip: result.consultant.companyZip,
        companyWebsite: result.consultant.companyWebsite
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating consultant:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT update consultant
export async function PUT(request: NextRequest) {
  try {
    const { 
      id, fullName, email, address, phone, type,
      companyName, companyAddress1, companyAddress2, companyCity, companyState, companyZip, companyWebsite,
      revenueSharePercentage,
      referralPartnerId,
      referralSetupFeePercentage,
      referralRecurringFeePercentage
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Consultant ID required' },
        { status: 400 }
      );
    }

    // Get the consultant with user info
    const consultant = await prisma.consultant.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!consultant) {
      return NextResponse.json(
        { error: 'Consultant not found' },
        { status: 404 }
      );
    }

    // Normalize email to lowercase if provided
    const normalizedEmail = email ? email.toLowerCase().trim() : undefined;

    // Check if email is being changed and if it's already taken by another user
    if (normalizedEmail && normalizedEmail !== consultant.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingUser && existingUser.id !== consultant.userId) {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
    }

    // Update consultant and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update user email, name, and phone if provided
      const updateData: any = {};
      if (normalizedEmail) updateData.email = normalizedEmail;
      if (fullName) updateData.name = fullName;
      if (phone !== undefined) updateData.phone = phone;

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: consultant.userId },
          data: updateData
        });
      }

      // Update consultant info
      const consultantUpdateData: any = {};
      if (fullName !== undefined) consultantUpdateData.fullName = fullName;
      if (address !== undefined) consultantUpdateData.address = address;
      if (phone !== undefined) consultantUpdateData.phone = phone;
      if (type !== undefined) consultantUpdateData.type = type;
      if (companyName !== undefined) consultantUpdateData.companyName = companyName;
      if (companyAddress1 !== undefined) consultantUpdateData.companyAddress1 = companyAddress1;
      if (companyAddress2 !== undefined) consultantUpdateData.companyAddress2 = companyAddress2;
      if (companyCity !== undefined) consultantUpdateData.companyCity = companyCity;
      if (companyState !== undefined) consultantUpdateData.companyState = companyState;
      if (companyZip !== undefined) consultantUpdateData.companyZip = companyZip;
      if (companyWebsite !== undefined) consultantUpdateData.companyWebsite = companyWebsite;
      if (revenueSharePercentage !== undefined) consultantUpdateData.revenueSharePercentage = revenueSharePercentage;
      if (referralPartnerId !== undefined) {
        const normalizedReferralPartnerId = String(referralPartnerId || '').trim() || null;
        if (normalizedReferralPartnerId) {
          const referralPartner = await (tx as any).referralPartner?.findUnique?.({
            where: { id: normalizedReferralPartnerId },
            select: { id: true }
          });
          if (!referralPartner) {
            throw new Error('Referral partner not found');
          }
        }
        consultantUpdateData.referralPartnerId = normalizedReferralPartnerId;
      }
      if (referralSetupFeePercentage !== undefined) {
        consultantUpdateData.referralSetupFeePercentage = referralSetupFeePercentage === null || referralSetupFeePercentage === ''
          ? null
          : Number(referralSetupFeePercentage);
      }
      if (referralRecurringFeePercentage !== undefined) {
        consultantUpdateData.referralRecurringFeePercentage = referralRecurringFeePercentage === null || referralRecurringFeePercentage === ''
          ? null
          : Number(referralRecurringFeePercentage);
      }

      const updatedConsultant = await tx.consultant.update({
        where: { id },
        data: consultantUpdateData,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });

      return updatedConsultant;
    });

    return NextResponse.json({ consultant: result });
  } catch (error) {
    console.error('Error updating consultant:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE consultant
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Consultant ID required' },
        { status: 400 }
      );
    }

    const consultant = await prisma.consultant.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        fullName: true,
        companies: {
          select: { id: true }
        }
      }
    });

    if (!consultant) {
      return NextResponse.json({ success: true, message: 'Consultant was already removed.' });
    }

    const ownedCompanyIds = consultant.companies.map((company) => company.id);
    const existingCompanyScopedTables = await getExistingCompanyScopedTables();

    await prisma.$transaction(async (tx) => {
      for (const companyId of ownedCompanyIds) {
        for (const tableName of COMPANY_SCOPED_TABLE_DELETE_ORDER) {
          if (!existingCompanyScopedTables.has(tableName)) continue;
          await deleteCompanyScopedRows(tx, tableName, companyId);
        }

        await tx.user.deleteMany({ where: { companyId } });
        await tx.company.deleteMany({ where: { id: companyId } });
      }

      // Keep unrelated companies, but remove references to the deleted consultant.
      await tx.company.updateMany({
        where: { referralPartnerConsultantId: id },
        data: {
          referralPartnerConsultantId: null,
          referralSetupFeePercentage: 0,
          referralRecurringFeePercentage: 0
        }
      });

      // Preserve non-company revenue history while removing the consultant FK.
      await tx.revenueRecord.updateMany({
        where: { consultantId: id },
        data: { consultantId: null }
      });

      await tx.consultantPayable.deleteMany({ where: { consultantId: id } });

      // Team members reference the consultant through User.consultantId.
      // Delete them before the consultant so production FK behavior is explicit.
      await tx.user.deleteMany({
        where: {
          consultantId: id,
          id: { not: consultant.userId }
        }
      });

      await tx.consultant.delete({ where: { id } });

      // If the primary consultant user did not have consultantId populated, remove it here.
      await tx.user.deleteMany({ where: { id: consultant.userId } });
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting consultant:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


