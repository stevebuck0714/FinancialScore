import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyTOTP } from '@/lib/mfa';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 MFA Verify Enrollment API called');
    const { userId, token } = await request.json();
    console.log('👤 User ID:', userId);
    console.log('🔢 Token received:', token);

    if (!userId || !token) {
      console.error('❌ Missing userId or token');
      return NextResponse.json(
        { error: 'User ID and token are required' },
        { status: 400 }
      );
    }

    // Get user
    console.log('🔍 Looking up user...');
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      console.error('❌ User not found:', userId);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log('✅ User found:', user.email);

    if (!user.mfaSecret) {
      console.error('❌ No MFA secret for user');
      return NextResponse.json(
        { error: 'MFA enrollment not started. Please enroll first.' },
        { status: 400 }
      );
    }

    console.log('🔑 MFA secret exists (encrypted):', user.mfaSecret.substring(0, 20) + '...');

    // Verify the token
    console.log('🔐 Verifying TOTP token...');
    const isValid = verifyTOTP(token, user.mfaSecret);
    console.log('✅ TOTP verification result:', isValid);

    if (!isValid) {
      console.error('❌ Invalid TOTP code');
      return NextResponse.json(
        { error: 'Invalid verification code. Please try again.' },
        { status: 401 }
      );
    }

    // Enable MFA
    console.log('✅ Enabling MFA for user...');
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
      },
      include: {
        company: true,
        primaryConsultant: true,
        consultantFirm: true
      }
    });

    console.log('✅ MFA enabled successfully');

    // Return user data so frontend can complete login without another API call
    const consultant = updatedUser.primaryConsultant || updatedUser.consultantFirm;
    const consultantId = consultant?.id || updatedUser.consultantId;

    return NextResponse.json({
      success: true,
      message: 'MFA has been successfully enabled',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        userType: updatedUser.userType,
        companyId: updatedUser.companyId,
        consultantId: consultantId,
        isPrimaryContact: updatedUser.isPrimaryContact,
        consultantType: consultant?.type,
        consultantCompanyName: consultant?.companyName,
        mfaEnabled: true
      }
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify MFA enrollment' },
      { status: 500 }
    );
  }
}


















