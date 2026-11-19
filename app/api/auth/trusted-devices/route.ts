import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTrustDurationDays, getUserTrustedDevices, revokeAllTrustedDevices } from '@/lib/trusted-device';
import { clearMfaDeviceCookie } from '@/lib/mfa-device-cookie';

async function verifiedSessionUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.mfaPending) return null;
  return session.user.id;
}

/**
 * GET /api/auth/trusted-devices
 * Get all trusted devices for the signed-in user
 */
export async function GET() {
  try {
    const userId = await verifiedSessionUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const devices = await getUserTrustedDevices(userId);
    const trustDurationDays = getTrustDurationDays();

    return NextResponse.json({ devices, trustDurationDays });
  } catch (error) {
    console.error('Error fetching trusted devices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trusted devices' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/trusted-devices
 * Revoke all trusted devices for the signed-in user
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = await verifiedSessionUserId();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await revokeAllTrustedDevices(userId);

    // Clear the cookie
    const response = NextResponse.json({ 
      success: true,
      message: 'All trusted devices have been revoked' 
    });
    clearMfaDeviceCookie(response, request);

    return response;
  } catch (error) {
    console.error('Error revoking all trusted devices:', error);
    return NextResponse.json(
      { error: 'Failed to revoke trusted devices' },
      { status: 500 }
    );
  }
}
