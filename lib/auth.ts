import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Generate a cryptographically secure random token
 * Used for password resets, email verification, etc.
 * 
 * SECURITY: Uses crypto.randomBytes instead of Math.random()
 * for cryptographic security
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}


