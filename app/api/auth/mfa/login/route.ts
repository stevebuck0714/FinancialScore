import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyTOTP, verifyBackupCode, encryptBackupCodes } from '@/lib/mfa';
import { createTrustedDevice, getTrustDurationDays } from '@/lib/trusted-device';
import { sendTrustedDeviceNotification } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { userId, token, isBackupCode, rememberDevice, trustDurationDays } = await request.json();

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
          await createTrustedDevice(userId, request, trustDurationDays);
        
        // Set cookie with device token
        const trustDurationDays = effectiveTrustDurationDays || getTrustDurationDays();
        const isProduction = process.env.NODE_ENV === 'production';
        let cookieDomain: string | undefined;
        if (process.env.MFA_COOKIE_DOMAIN) {
          cookieDomain = process.env.MFA_COOKIE_DOMAIN;
        } else {
          const hostname = request.nextUrl.hostname;
          if (hostname && !hostname.includes('localhost')) {
            cookieDomain = hostname;
          }
        }

        response.cookies.set('mfa_device_token', deviceToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? 'none' : 'lax',
          maxAge: trustDurationDays * 24 * 60 * 60, // Convert days to seconds
          path: '/',
          ...(cookieDomain ? { domain: cookieDomain } : {})
        });

        console.log('✅ Trusted device created:', device.deviceName);

        // Send email notification (non-blocking)
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        sendTrustedDeviceNotification({
          to: user.email,
          userName: user.name,
          deviceName: device.deviceName,
          ipAddress: device.ipAddress || 'Unknown',
          timestamp: device.createdAt,
          trustDurationDays: trustDurationDays,
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


















