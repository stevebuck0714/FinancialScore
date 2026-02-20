import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateMFASecret, generateQRCode, encryptMFASecret, generateBackupCodes, encryptBackupCodes, resolveStoredMFASecret } from '@/lib/mfa';
import { getMfaAppScope } from '@/lib/mfa-app-scope';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 MFA Enroll API called');
    const appScope = getMfaAppScope(request);
    const { userId } = await request.json();
    console.log('👤 User ID:', userId);

    if (!userId) {
      console.error('❌ No userId provided');
      return NextResponse.json(
        { error: 'User ID is required' },
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

    // Check if MFA is already enabled for this app scope
    if (user.mfaEnabled) {
      const stored = user.mfaSecret ? resolveStoredMFASecret(user.mfaSecret) : null;
      const storedScope = stored?.appScope?.toLowerCase();

      if (storedScope && storedScope === appScope) {
        console.error('❌ MFA already enabled for:', user.email);
        return NextResponse.json(
          { error: 'MFA is already enabled for this user in this app' },
          { status: 400 }
        );
      }

      console.log('ℹ️ Re-enrolling MFA for new app scope', { appScope, storedScope: storedScope || 'legacy-or-none' });
    }

    // Generate MFA secret
    console.log('🔑 Generating MFA secret...');
    const { secret, otpauthUrl } = generateMFASecret(user.email);

    // Generate QR code
    console.log('📱 Generating QR code...');
    const qrCodeDataURL = await generateQRCode(otpauthUrl!);

    // Generate backup codes
    console.log('🔐 Generating backup codes...');
    const backupCodes = generateBackupCodes(10);
    console.log('✅ Generated', backupCodes.length, 'backup codes');

    // Encrypt and temporarily store app-scoped secret in database (not yet enabled)
    const scopedSecretPayload = JSON.stringify({
      version: 1,
      appScope,
      secret,
    });
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: encryptMFASecret(scopedSecretPayload),
        backupCodes: encryptBackupCodes(backupCodes),
        mfaEnabled: false, // Not enabled until verified
      },
    });

    console.log('✅ Sending MFA enrollment response');
    return NextResponse.json({
      qrCodeDataURL: qrCodeDataURL, // Fixed: was 'qrCode', should be 'qrCodeDataURL'
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


















