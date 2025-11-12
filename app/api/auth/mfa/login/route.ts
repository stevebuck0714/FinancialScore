import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyTOTP, verifyBackupCode, encryptBackupCodes } from '@/lib/mfa';

export async function POST(request: NextRequest) {
  try {
    const { userId, token, isBackupCode } = await request.json();

    if (!userId || !token) {
      return NextResponse.json(
        { error: 'User ID and token are required' },
        { status: 400 }
      );
    }

    // Get user with relations
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        consultant: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json(
        { error: 'MFA is not enabled for this user' },
        { status: 400 }
      );
    }

    let isValid = false;

    // Check if it's a backup code or TOTP token
    if (isBackupCode && user.backupCodes) {
      const result = verifyBackupCode(token, user.backupCodes);
      isValid = result.valid;

      if (isValid && result.remainingCodes.length > 0) {
        // Update backup codes (remove used one)
        await prisma.user.update({
          where: { id: userId },
          data: {
            backupCodes: encryptBackupCodes(result.remainingCodes),
          },
        });
      } else if (isValid && result.remainingCodes.length === 0) {
        // No backup codes left, warn user
        console.warn(`User ${userId} has used their last backup code`);
      }
    } else {
      // Verify TOTP token
      isValid = verifyTOTP(token, user.mfaSecret);
    }

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 401 }
      );
    }

    // MFA verification successful - return user data
    console.log('✅ MFA verification successful, login complete');
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        userType: user.userType,
        companyId: user.companyId,
        consultantId: user.consultant?.id,
        consultantType: user.consultant?.type,
        consultantCompanyName: user.consultant?.companyName,
      },
    });
  } catch (error) {
    console.error('MFA login error:', error);
    return NextResponse.json(
      { error: 'Failed to verify MFA code' },
      { status: 500 }
    );
  }
}


