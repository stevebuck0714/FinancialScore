import { NextRequest, NextResponse } from 'next/server';
import { revokeTrustedDevice } from '@/lib/trusted-device';

/**
 * DELETE /api/auth/trusted-devices/:deviceId
 * Revoke a specific trusted device
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ deviceId: string }> }) {
  const params = await props.params;
  try {
    const userId = request.headers.get('x-user-id');
    const { deviceId } = params;
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    await revokeTrustedDevice(userId, deviceId);

    return NextResponse.json({ 
      success: true,
      message: 'Trusted device has been revoked' 
    });
  } catch (error: any) {
    console.error('Error revoking trusted device:', error);
    
    if (error.message === 'Device not found') {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to revoke trusted device' },
      { status: 500 }
    );
  }
}

