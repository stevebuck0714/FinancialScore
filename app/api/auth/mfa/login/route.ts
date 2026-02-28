import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  verifyTOTPWithDetails,
  verifyBackupCode,
  encryptBackupCodes,
  resolveStoredMFASecret,
  encryptMFASecret,
} from '@/lib/mfa';
import { createTrustedDevice, getTrustDurationDays } from '@/lib/trusted-device';
import { sendTrustedDeviceNotification } from '@/lib/email';
import { getMfaAppScope } from '@/lib/mfa-app-scope';
import { getMfaDeviceCookieName, getMfaDeviceCookieOptions } from '@/lib/mfa-device-cookie';

export async function POST(request: NextRequest) {
  try {
    const appScope = getMfaAppScope(request);
    const { userId, token, isBackupCode, rememberDevice, trustDurationDays: requestedTrustDurationDays } =
      await request.json();

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
        primaryConsultant: true,
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
    let totpFailureReason: string | undefined;

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
      const verification = verifyTOTPWithDetails(token, user.mfaSecret, {
        expectedAppScope: appScope,
        allowLegacyScope: true,
      });
      isValid = verification.isValid;
      totpFailureReason = verification.reason;

      // Promote legacy/unscoped secrets to app-scoped secrets after successful verification.
      if (verification.isValid) {
        try {
          const parsed = resolveStoredMFASecret(user.mfaSecret);
          if (!parsed.appScope) {
            const scopedSecretPayload = JSON.stringify({
              version: 1,
              appScope,
              secret: parsed.secret,
            });
            await prisma.user.update({
              where: { id: userId },
              data: { mfaSecret: encryptMFASecret(scopedSecretPayload) },
            });
            console.log('✅ Upgraded legacy MFA secret to app-scoped payload', { userId, appScope });
          }
        } catch (scopeUpgradeError) {
          // Do not block login after successful verification.
          console.error('⚠️ Failed to upgrade MFA secret scope after successful verification:', scopeUpgradeError);
        }
      }
    }

    if (!isValid) {
      const errorMessage =
        totpFailureReason === 'CLOCK_SKEW'
          ? 'Invalid verification code. Your device clock appears out of sync. Sync your phone time and try a fresh code.'
          : totpFailureReason === 'INVALID_FORMAT'
            ? 'Invalid verification code format. Enter a 6-digit code.'
            : 'Invalid verification code. Please use the latest code from your authenticator app and try again.';

      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      );
    }

    // MFA verification successful
    console.log('✅ MFA verification successful, login complete');

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        userType: user.userType,
        companyId: user.companyId,
        consultantId: user.primaryConsultant?.id || user.consultantId,
        consultantType: user.primaryConsultant?.type,
        consultantCompanyName: user.primaryConsultant?.companyName,
      },
    });

    // Handle trusted device if requested
    if (rememberDevice) {
      try {
        console.log('🔐 Creating trusted device for user:', userId);
        const { token: deviceToken, device, trustDurationDays: effectiveTrustDurationDays } =
          await createTrustedDevice(userId, request, requestedTrustDurationDays);
        
        // Set cookie with device token
        const trustDurationDaysValue = effectiveTrustDurationDays || getTrustDurationDays();
        response.cookies.set(
          getMfaDeviceCookieName(),
          deviceToken,
          getMfaDeviceCookieOptions(request, trustDurationDaysValue * 24 * 60 * 60)
        );

        console.log('✅ Trusted device created:', device.deviceName);

        // Send email notification (non-blocking)
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        sendTrustedDeviceNotification({
          to: user.email,
          userName: user.name,
          deviceName: device.deviceName,
          ipAddress: device.ipAddress || 'Unknown',
          timestamp: device.createdAt,
          trustDurationDays: trustDurationDaysValue,
          manageDevicesLink: `${baseUrl}/settings/security`
        }).catch(err => {
          console.error('⚠️ Failed to send trusted device email notification:', err);
          // Don't fail the login if email fails
        });
      } catch (error) {
        console.error('⚠️ Failed to create trusted device:', error);
        // Don't fail the login if trusted device creation fails
      }
    }

    return response;
  } catch (error: any) {
    console.error('❌ MFA login error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error message:', error?.message);
    return NextResponse.json(
      { error: 'Failed to verify MFA code', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}


















