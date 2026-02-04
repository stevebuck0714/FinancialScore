import { randomBytes, createHash } from 'crypto';
import prisma from './prisma';
import { NextRequest } from 'next/server';

// Configuration
const TRUST_DURATION_DAYS = parseInt(process.env.MFA_TRUST_DURATION_DAYS || '60', 10);
const MAX_TRUSTED_DEVICES = parseInt(process.env.MFA_MAX_TRUSTED_DEVICES_PER_USER || '5', 10);

/**
 * Generate a secure random device token
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a device token for storage (one-way hash)
 */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Extract device information from request
 */
export function extractDeviceInfo(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || 'Unknown';
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                    request.headers.get('x-real-ip') || 
                    'Unknown';

  // Parse user agent to get device name
  let deviceName = 'Unknown Device';
  if (userAgent.includes('Chrome')) deviceName = 'Chrome';
  else if (userAgent.includes('Firefox')) deviceName = 'Firefox';
  else if (userAgent.includes('Safari')) deviceName = 'Safari';
  else if (userAgent.includes('Edge')) deviceName = 'Edge';

  if (userAgent.includes('Windows')) deviceName += ' on Windows';
  else if (userAgent.includes('Mac')) deviceName += ' on Mac';
  else if (userAgent.includes('Linux')) deviceName += ' on Linux';
  else if (userAgent.includes('iPhone')) deviceName += ' on iPhone';
  else if (userAgent.includes('Android')) deviceName += ' on Android';

  // Create device fingerprint
  const fingerprint = createHash('sha256')
    .update(userAgent + ipAddress)
    .digest('hex')
    .substring(0, 16);

  return {
    deviceName,
    userAgent,
    ipAddress,
    fingerprint
  };
}

/**
 * Create a trusted device for a user
 */
function resolveTrustDurationDays(requestedDays?: number): number {
  if (typeof requestedDays !== 'number' || !Number.isFinite(requestedDays)) {
    return TRUST_DURATION_DAYS;
  }

  const roundedDays = Math.floor(requestedDays);
  if (roundedDays <= 0) {
    return TRUST_DURATION_DAYS;
  }

  return Math.min(roundedDays, TRUST_DURATION_DAYS);
}

export async function createTrustedDevice(
  userId: string,
  request: NextRequest,
  requestedDurationDays?: number
): Promise<{ token: string; device: any; trustDurationDays: number }> {
  const deviceInfo = extractDeviceInfo(request);
  const trustDurationDays = resolveTrustDurationDays(requestedDurationDays);
  
  // Check if user has reached max trusted devices
  const existingDevices = await prisma.trustedDevice.findMany({
    where: {
      userId,
      isActive: true,
      expiresAt: { gt: new Date() }
    },
    orderBy: { lastUsedAt: 'asc' }
  });

  // If at max, remove oldest device
  if (existingDevices.length >= MAX_TRUSTED_DEVICES) {
    await prisma.trustedDevice.update({
      where: { id: existingDevices[0].id },
      data: { isActive: false }
    });
  }

  // Generate token and expiration
  const token = generateDeviceToken();
  const hashedToken = hashDeviceToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + trustDurationDays);

  // Create device record
  const device = await prisma.trustedDevice.create({
    data: {
      userId,
      deviceToken: hashedToken,
      deviceName: deviceInfo.deviceName,
      deviceFingerprint: deviceInfo.fingerprint,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
      expiresAt,
      isActive: true
    }
  });

  return { token, device, trustDurationDays };
}

/**
 * Validate a device token
 */
export async function validateTrustedDevice(
  userId: string,
  token: string,
  request: NextRequest
): Promise<{ valid: boolean; device?: any; reason?: string }> {
  if (!token) {
    return { valid: false, reason: 'No token provided' };
  }

  const hashedToken = hashDeviceToken(token);

  // Find the device
  const device = await prisma.trustedDevice.findFirst({
    where: {
      deviceToken: hashedToken,
      userId,
      isActive: true
    }
  });

  if (!device) {
    return { valid: false, reason: 'Device not found' };
  }

  // Check if expired
  if (device.expiresAt < new Date()) {
    // Mark as inactive
    await prisma.trustedDevice.update({
      where: { id: device.id },
      data: { isActive: false }
    });
    return { valid: false, reason: 'Device expired' };
  }

  // Optional: Check device fingerprint for additional security
  const currentDeviceInfo = extractDeviceInfo(request);
  if (device.deviceFingerprint && device.deviceFingerprint !== currentDeviceInfo.fingerprint) {
    console.warn(`⚠️ Device fingerprint mismatch for user ${userId}`);
    // You can choose to invalidate or just log
    // For now, we'll just log and allow
  }

  // Update last used timestamp
  await prisma.trustedDevice.update({
    where: { id: device.id },
    data: { lastUsedAt: new Date() }
  });

  return { valid: true, device };
}

/**
 * Get all trusted devices for a user
 */
export async function getUserTrustedDevices(userId: string) {
  return await prisma.trustedDevice.findMany({
    where: {
      userId,
      isActive: true
    },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      deviceName: true,
      ipAddress: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true
    }
  });
}

/**
 * Revoke a trusted device
 */
export async function revokeTrustedDevice(userId: string, deviceId: string) {
  const device = await prisma.trustedDevice.findFirst({
    where: {
      id: deviceId,
      userId
    }
  });

  if (!device) {
    throw new Error('Device not found');
  }

  await prisma.trustedDevice.update({
    where: { id: deviceId },
    data: { isActive: false }
  });
}

/**
 * Revoke all trusted devices for a user
 */
export async function revokeAllTrustedDevices(userId: string) {
  await prisma.trustedDevice.updateMany({
    where: {
      userId,
      isActive: true
    },
    data: { isActive: false }
  });
}

/**
 * Clean up expired trusted devices (for cron job)
 */
export async function cleanupExpiredDevices() {
  const result = await prisma.trustedDevice.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      isActive: true
    },
    data: { isActive: false }
  });

  console.log(`🧹 Cleaned up ${result.count} expired trusted devices`);
  return result.count;
}

/**
 * Get trust duration in days
 */
export function getTrustDurationDays(): number {
  return TRUST_DURATION_DAYS;
}

/**
 * Get max trusted devices per user
 */
export function getMaxTrustedDevices(): number {
  return MAX_TRUSTED_DEVICES;
}

