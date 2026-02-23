import { NextResponse } from 'next/server';
import { sendSupportTicket } from '@/lib/email';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

async function hasCompanyColumn(columnName: string): Promise<boolean> {
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

export async function POST(request: Request) {
  try {
    const context = await requireAuth();
    const body = await request.json();
    const {
      subject,
      category,
      priority,
      description,
      contactName,
      contactEmail,
      companyName,
      pageModule,
      companyId,
    } = body;

    if (!subject?.trim() || !category?.trim() || !description?.trim() || !contactName?.trim() || !contactEmail?.trim() || !companyName?.trim()) {
      return NextResponse.json(
        { error: 'Subject, Category, Description, Contact Name, Contact Email, and Company Name are required.' },
        { status: 400 }
      );
    }

    let routedToEmail = 'support@corelytics.com';
    let routedToLabel = 'Corelytics Tier 1';
    let tier1Owner: 'CORELYTICS' | 'CONSULTANT' = 'CORELYTICS';
    let tier1ConsultantName: string | undefined;
    const targetCompanyId =
      typeof companyId === 'string' && companyId.trim()
        ? companyId.trim()
        : context.companyId;

    if (targetCompanyId) {
      const hasAccess = await validateCompanyAccess(targetCompanyId);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Forbidden: Access to this company denied' },
          { status: 403 }
        );
      }

      const includeTier1SupportOwner = await hasCompanyColumn('tier1SupportOwner');
      const includeTier1SupportConsultantId = await hasCompanyColumn('tier1SupportConsultantId');
      const includeTier1SupportContactEmail = await hasCompanyColumn('tier1SupportContactEmail');
      const company = await prisma.company.findUnique({
        where: { id: targetCompanyId },
        select: {
          id: true,
          consultantId: true,
        },
      });

      if (company) {
        let storedTier1Owner: string | null = null;
        let storedTier1SupportConsultantId: string | null = null;
        let storedTier1SupportContactEmail: string | null = null;
        if (includeTier1SupportOwner || includeTier1SupportConsultantId || includeTier1SupportContactEmail) {
          const supportRows = await prisma.$queryRaw<
            Array<{ tier1SupportOwner: string | null; tier1SupportConsultantId: string | null; tier1SupportContactEmail: string | null }>
          >`
            SELECT "tier1SupportOwner", "tier1SupportConsultantId", "tier1SupportContactEmail"
            FROM "Company"
            WHERE "id" = ${targetCompanyId}
            LIMIT 1
          `;
          if (supportRows[0]) {
            storedTier1Owner = supportRows[0].tier1SupportOwner;
            storedTier1SupportConsultantId = supportRows[0].tier1SupportConsultantId;
            storedTier1SupportContactEmail = supportRows[0].tier1SupportContactEmail;
          }
        }

        const normalizedOwner = String(
          storedTier1Owner ||
            (company.consultantId ? 'CONSULTANT' : 'CORELYTICS')
        )
          .trim()
          .toUpperCase();
        tier1Owner = normalizedOwner === 'CONSULTANT' ? 'CONSULTANT' : 'CORELYTICS';
        const configuredConsultantId =
          storedTier1SupportConsultantId ||
          company.consultantId ||
          null;

        if (tier1Owner === 'CONSULTANT' && configuredConsultantId) {
          const configuredTier1Email = storedTier1SupportContactEmail?.trim() || '';
          if (configuredTier1Email) {
            routedToEmail = configuredTier1Email.toLowerCase();
            routedToLabel = `${configuredTier1Email} (Company Tier 1 Contact)`;
            tier1ConsultantName = undefined;
          } else {
          const consultant = await prisma.consultant.findUnique({
            where: { id: configuredConsultantId },
            select: {
              fullName: true,
              user: {
                select: {
                  email: true,
                },
              },
            },
          });
          if (consultant?.user?.email) {
            routedToEmail = consultant.user.email.trim().toLowerCase();
            tier1ConsultantName = consultant.fullName || undefined;
            routedToLabel = consultant.fullName
              ? `${consultant.fullName} (Consultant Tier 1)`
              : 'Consultant Tier 1';
          } else {
            tier1Owner = 'CORELYTICS';
          }
          }
        }
      }
    }

    await sendSupportTicket({
      subject: subject.trim(),
      category: category.trim(),
      priority: priority?.trim() || undefined,
      description: description.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      companyName: companyName.trim(),
      pageModule: pageModule?.trim() || undefined,
      tier1Owner,
      routedToEmail,
      routedToLabel,
      tier1ConsultantName,
    });

    return NextResponse.json({ success: true, message: 'Support ticket submitted successfully.' });
  } catch (error) {
    console.error('Support ticket error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit support ticket.' },
      { status: 500 }
    );
  }
}
