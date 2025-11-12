import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateBackupCodes, encryptBackupCodes, verifyTOTP } from '@/lib/mfa';

export async function POST(request: NextRequest) {
  try {
    const { userId, token } = await request.json();

    if (!userId || !token) {
      return NextResponse.json(
        { error: 'User ID and verification token are required' },
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

    // Verify the token before regenerating
    const isValid = verifyTOTP(token, user.mfaSecret);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 401 }
      );
    }

    // Generate new backup codes
    const backupCodes = generateBackupCodes(10);

    // Update in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        backupCodes: encryptBackupCodes(backupCodes),
      },
    });

    return NextResponse.json({
      success: true,
      backupCodes: backupCodes,
      message: 'New backup codes generated. Please save them securely.',
    });
  } catch (error) {
    console.error('Backup codes regeneration error:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate backup codes' },
      { status: 500 }
    );
  }
}

