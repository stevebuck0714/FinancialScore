import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Debug endpoint called');

    // Test basic database connection
    const userCount = await prisma.user.count();
    console.log(`✅ Database connected. User count: ${userCount}`);

    // Test consultant lookup
    const consultants = await prisma.consultant.findMany({
      select: {
        id: true,
        companyName: true,
        fullName: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            consultantId: true
          }
        }
      }
    });
    console.log(`✅ Found ${consultants.length} consultants`);

    // Test company lookup
    const companyCount = await prisma.company.count();
    console.log(`✅ Found ${companyCount} companies`);

    // Find Stuart's data
    const stuartUser = await prisma.user.findFirst({
      where: { email: 'stuart@test.com' },
      include: {
        primaryConsultant: true,
        consultantFirm: true
      }
    });

    console.log('🔍 Stuart user data:', {
      found: !!stuartUser,
      id: stuartUser?.id,
      name: stuartUser?.name,
      email: stuartUser?.email,
      role: stuartUser?.role,
      consultantId: stuartUser?.consultantId,
      hasPrimaryConsultant: !!stuartUser?.primaryConsultant,
      hasConsultantFirm: !!stuartUser?.consultantFirm
    });

    if (stuartUser?.consultantId) {
      const stuartCompanies = await prisma.company.findMany({
        where: { consultantId: stuartUser.consultantId },
        select: {
          id: true,
          name: true,
          consultantId: true
        }
      });
      console.log(`✅ Stuart has ${stuartCompanies.length} companies:`, stuartCompanies);
    }

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      userCount,
      consultantCount: consultants.length,
      companyCount,
      stuartData: stuartUser ? {
        id: stuartUser.id,
        name: stuartUser.name,
        email: stuartUser.email,
        role: stuartUser.role,
        consultantId: stuartUser.consultantId,
        hasPrimaryConsultant: !!stuartUser.primaryConsultant,
        hasConsultantFirm: !!stuartUser.consultantFirm,
        primaryConsultantName: stuartUser.primaryConsultant?.companyName,
        consultantFirmName: stuartUser.consultantFirm?.companyName
      } : null,
      consultants: consultants.map(c => ({
        id: c.id,
        companyName: c.companyName,
        fullName: c.fullName,
        userEmail: c.user?.email,
        userConsultantId: c.user?.consultantId
      }))
    });

  } catch (error: any) {
    console.error('❌ Debug endpoint error:', error);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);

    return NextResponse.json({
      status: 'error',
      error: error.message,
      stack: error.stack,
      type: error.constructor.name
    }, { status: 500 });
  }
}
