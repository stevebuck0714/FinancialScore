import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyTOTP } from '@/lib/mfa';
import { createTrustedDevice, getTrustDurationDays } from '@/lib/trusted-device';
import { sendTrustedDeviceNotification } from '@/lib/email';
import { getMfaAppScope } from '@/lib/mfa-app-scope';
import { getMfaDeviceCookieName, getMfaDeviceCookieOptions } from '@/lib/mfa-device-cookie';

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 MFA Verify Enrollment API called');
    const appScope = getMfaAppScope(request);
    const { userId, token, rememberDevice, trustDurationDays } = await request.json();
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
    const isValid = verifyTOTP(token, user.mfaSecret, {
      expectedAppScope: appScope,
      allowLegacyScope: false,
    });
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

    const response = NextResponse.json({
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

    if (rememberDevice) {
      try {
        console.log('🔐 Creating trusted device after enrollment for user:', userId);
        const { token: deviceToken, device, trustDurationDays: effectiveTrustDurationDays } =
          await createTrustedDevice(userId, request, trustDurationDays);

        const trustDuration = effectiveTrustDurationDays || getTrustDurationDays();
        response.cookies.set(
          getMfaDeviceCookieName(userId),
          deviceToken,
          getMfaDeviceCookieOptions(request, trustDuration * 24 * 60 * 60)
        );

        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        sendTrustedDeviceNotification({
          to: updatedUser.email,
          userName: updatedUser.name,
          deviceName: device.deviceName,
          ipAddress: device.ipAddress || 'Unknown',
          timestamp: device.createdAt,
          trustDurationDays: trustDuration,
          manageDevicesLink: `${baseUrl}/settings/security`
        }).catch(err => {
          console.error('⚠️ Failed to send trusted device email notification:', err);
        });
      } catch (error) {
        console.error('⚠️ Failed to create trusted device after enrollment:', error);
      }
    }

    return response;
  } catch (error) {
    console.error('MFA verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify MFA enrollment' },
      { status: 500 }
    );
  }
}


















