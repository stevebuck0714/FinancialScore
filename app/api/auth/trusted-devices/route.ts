import { NextRequest, NextResponse } from 'next/server';
import { getTrustDurationDays, getUserTrustedDevices, revokeAllTrustedDevices } from '@/lib/trusted-device';

/**
 * GET /api/auth/trusted-devices
 * Get all trusted devices for a user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
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
 * Revoke all trusted devices for a user
 */
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    await revokeAllTrustedDevices(userId);

    // Clear the cookie
    const response = NextResponse.json({ 
      success: true,
      message: 'All trusted devices have been revoked' 
    });
    response.cookies.delete('mfa_device_token');

    return response;
  } catch (error) {
    console.error('Error revoking all trusted devices:', error);
    return NextResponse.json(
      { error: 'Failed to revoke trusted devices' },
      { status: 500 }
    );
  }
}

