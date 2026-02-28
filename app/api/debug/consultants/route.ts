import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// This route uses request.url query params and should never be statically rendered.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    // Get all consultants with their companies
    const consultants = await prisma.consultant.findMany({
      where: search ? {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } }
        ]
      } : undefined,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        },
        companies: {
          select: {
            id: true,
            name: true,
            consultantId: true,
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      },
      orderBy: {
        fullName: 'asc'
      }
    });

    // Also check for orphaned companies (companies with consultantId but not showing up)
    const allCompanies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        consultantId: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const orphanedCompanies = allCompanies.filter(company => {
      if (!company.consultantId) return false;
      // Check if this company's consultant exists in our consultants list
      const consultant = consultants.find(c => c.id === company.consultantId);
      if (!consultant) return true;
      // Check if this company is in the consultant's companies list
      const inConsultantList = consultant.companies.some(cc => cc.id === company.id);
      return !inConsultantList;
    });

    return NextResponse.json({
      consultants: consultants.map(c => ({
        id: c.id,
        fullName: c.fullName,
        companyName: c.companyName,
        userId: c.userId,
        userEmail: c.user.email,
        userRole: c.user.role,
        companiesCount: c.companies.length,
        companies: c.companies
      })),
      orphanedCompanies,
      totalConsultants: consultants.length,
      totalCompanies: allCompanies.length,
      totalOrphaned: orphanedCompanies.length
    });
  } catch (error: any) {
    console.error('Error in debug consultants API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch consultant data', details: error.message },
      { status: 500 }
    );
  }
}

