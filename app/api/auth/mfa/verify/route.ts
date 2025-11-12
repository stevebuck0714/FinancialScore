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

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        // No backup codes left
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

    return NextResponse.json({
      success: true,
      message: 'MFA verification successful',
    });
  } catch (error) {
    console.error('MFA verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify MFA code' },
      { status: 500 }
    );
  }
}



