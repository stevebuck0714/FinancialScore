import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    console.log('👤 /api/auth/me called');
    
    // Get session
    const session = await auth();
    
    if (!session?.user?.id) {
      console.error('❌ No session found');
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    console.log('✅ Session found for user:', session.user.id);

    // Get full user data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        company: true,
        primaryConsultant: true,
        consultantFirm: true
      }
    });

    if (!user) {
      console.error('❌ User not found in database');
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('✅ User data retrieved:', user.email);

    // Get consultant info
    const consultant = user.primaryConsultant || user.consultantFirm;
    const consultantId = consultant?.id || user.consultantId;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        userType: user.userType,
        companyRole: user.companyRole,
        sidebarAccess: user.sidebarAccess,
        companyId: user.companyId,
        consultantId: consultantId,
        isPrimaryContact: user.isPrimaryContact,
        consultantType: consultant?.type,
        consultantCompanyName: consultant?.companyName,
        mfaEnabled: user.mfaEnabled
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}

