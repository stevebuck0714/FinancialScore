import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateMFASecret, generateQRCode, encryptMFASecret, generateBackupCodes, encryptBackupCodes } from '@/lib/mfa';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Check if MFA is already enabled
    if (user.mfaEnabled) {
      return NextResponse.json(
        { error: 'MFA is already enabled for this user' },
        { status: 400 }
      );
    }

    // Generate MFA secret
    const { secret, otpauthUrl } = generateMFASecret(user.email);

    // Generate QR code
    const qrCodeDataURL = await generateQRCode(otpauthUrl!);

    // Generate backup codes
    const backupCodes = generateBackupCodes(10);

    // Encrypt and temporarily store in database (not yet enabled)
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: encryptMFASecret(secret),
        backupCodes: encryptBackupCodes(backupCodes),
        mfaEnabled: false, // Not enabled until verified
      },
    });

    return NextResponse.json({
      qrCode: qrCodeDataURL,
      secret: secret, // Send secret for manual entry
      backupCodes: backupCodes, // Send backup codes to user
      message: 'Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)',
    });
  } catch (error) {
    console.error('MFA enrollment error:', error);
    return NextResponse.json(
      { error: 'Failed to enroll in MFA' },
      { status: 500 }
    );
  }
}


