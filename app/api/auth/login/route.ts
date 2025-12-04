import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 Login attempt starting...');
    console.log('🔗 DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 60) + '...');
    const { email, password } = await request.json();
    console.log('📧 Email:', email);

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Normalize email to lowercase for case-insensitive login
    const normalizedEmail = email.toLowerCase().trim();
    console.log('📧 Normalized Email:', normalizedEmail);

    console.log('🔍 Querying database for user...');
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        company: true,
        primaryConsultant: true,
        consultantFirm: true
      }
    });
    console.log('✅ User found:', user ? 'YES' : 'NO');
    if (user) {
      console.log('👤 User details:', {
        id: user.id,
        email: user.email,
        role: user.role,
        hasPasswordHash: !!user.passwordHash
      });
    }

    if (!user) {
      console.log('❌ No user found with email:', email);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    console.log('🔑 Verifying password...');
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    console.log('🔑 Password valid:', isValidPassword);

    if (!isValidPassword) {
      console.log('❌ Invalid password');
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      console.log('🔐 MFA is enabled for this user, requiring verification');
      return NextResponse.json({
        mfaRequired: true,
        userId: user.id,
        message: 'MFA verification required',
      });
    }

    console.log('✅ Login successful');
    
    // Get consultant info - either from primaryConsultant relation or consultantFirm relation
    const consultant = user.primaryConsultant || user.consultantFirm;
    const consultantId = consultant?.id || user.consultantId;
    
    // Return user data (password hash excluded)
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        userType: user.userType,
        companyId: user.companyId,
        consultantId: consultantId,
        isPrimaryContact: user.isPrimaryContact,
        consultantType: consultant?.type,
        consultantCompanyName: consultant?.companyName
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


