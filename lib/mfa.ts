import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

// Encryption for MFA secrets
function encryptSecret(text: string): string {
  const key = process.env.MFA_ENCRYPTION_KEY || process.env.OAUTH_ENCRYPTION_KEY || 'default-key-change-me-in-prod';
  const keyBuffer = Buffer.from(key.substring(0, 64), 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptSecret(encryptedText: string): string {
  const key = process.env.MFA_ENCRYPTION_KEY || process.env.OAUTH_ENCRYPTION_KEY || 'default-key-change-me-in-prod';
  const keyBuffer = Buffer.from(key.substring(0, 64), 'hex');
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface VerifyTOTPOptions {
  expectedAppScope?: string;
  acceptedAppScopes?: string[];
  allowLegacyScope?: boolean;
}

export interface VerifyTOTPResult {
  isValid: boolean;
  reason?: 'INVALID_FORMAT' | 'CLOCK_SKEW' | 'APP_SCOPE_MISMATCH' | 'DECRYPT_FAILED' | 'INVALID_CODE';
}

interface StoredMFASecret {
  secret: string;
  appScope?: string;
  version?: number;
}

export function resolveStoredMFASecret(encryptedSecret: string): StoredMFASecret {
  const decrypted = decryptSecret(encryptedSecret);
  const trimmed = decrypted.trim();

  // Support both legacy plain base32 and newer JSON payloads.
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { secret?: string; appScope?: string; version?: number };
      if (parsed?.secret && typeof parsed.secret === 'string') {
        return {
          secret: parsed.secret,
          appScope: typeof parsed.appScope === 'string' ? parsed.appScope : undefined,
          version: typeof parsed.version === 'number' ? parsed.version : undefined,
        };
      }
    } catch {
      // Fall through to legacy handling.
    }
  }

  return { secret: trimmed };
}

// Generate MFA secret for user
export function generateMFASecret(userEmail: string, issuer: string = 'Corelytics') {
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${userEmail})`,
    issuer: issuer,
    length: 32,
  });

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url,
  };
}

// Generate QR code data URL
export async function generateQRCode(otpauthUrl: string): Promise<string> {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

// Verify TOTP token
export function verifyTOTPWithDetails(
  token: string,
  encryptedSecret: string,
  options?: VerifyTOTPOptions
): VerifyTOTPResult {
  try {
    if (!/^\d{6}$/.test((token || '').trim())) {
      return { isValid: false, reason: 'INVALID_FORMAT' };
    }

    const parsed = resolveStoredMFASecret(encryptedSecret);
    const expectedAppScope = options?.expectedAppScope;
    const acceptedAppScopes = (options?.acceptedAppScopes || [])
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const acceptedScopeSet = new Set(
      expectedAppScope ? [expectedAppScope.toLowerCase(), ...acceptedAppScopes] : acceptedAppScopes
    );
    const allowLegacyScope = options?.allowLegacyScope === true;

    if (expectedAppScope) {
      if (parsed.appScope && !acceptedScopeSet.has(parsed.appScope.toLowerCase())) {
        return { isValid: false, reason: 'APP_SCOPE_MISMATCH' };
      }
      if (!parsed.appScope && !allowLegacyScope) {
        return { isValid: false, reason: 'APP_SCOPE_MISMATCH' };
      }
    }

    const result = speakeasy.totp.verify({
      secret: parsed.secret,
      encoding: 'base32',
      token: token.trim(),
      window: 2,
    });

    if (result) {
      return { isValid: true };
    }

    // Distinguish likely clock skew from wrong code.
    const wideWindow = speakeasy.totp.verify({
      secret: parsed.secret,
      encoding: 'base32',
      token: token.trim(),
      window: 10,
    });
    if (wideWindow) {
      return { isValid: false, reason: 'CLOCK_SKEW' };
    }

    return { isValid: false, reason: 'INVALID_CODE' };
  } catch (error) {
    console.error('❌ Error verifying TOTP:', error);
    return { isValid: false, reason: 'DECRYPT_FAILED' };
  }
}

// Verify TOTP token
export function verifyTOTP(token: string, encryptedSecret: string, options?: VerifyTOTPOptions): boolean {
  return verifyTOTPWithDetails(token, encryptedSecret, options).isValid;
}

// Generate backup codes
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  
  return codes;
}

// Hash backup code for storage
export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Verify backup code against hashed codes
export function verifyBackupCode(code: string, encryptedHashedCodes: string): { valid: boolean; remainingCodes: string[] } {
  try {
    const hashedCodesJson = decryptSecret(encryptedHashedCodes);
    const hashedCodes = JSON.parse(hashedCodesJson) as string[];
    
    const codeHash = hashBackupCode(code.toUpperCase());
    const index = hashedCodes.indexOf(codeHash);
    
    if (index === -1) {
      return { valid: false, remainingCodes: [] };
    }
    
    // Remove used code
    const remainingCodes = hashedCodes.filter((_, i) => i !== index);
    
    return { valid: true, remainingCodes };
  } catch (error) {
    console.error('Error verifying backup code:', error);
    return { valid: false, remainingCodes: [] };
  }
}

// Encrypt MFA secret for storage
export function encryptMFASecret(secret: string): string {
  return encryptSecret(secret);
}

// Encrypt backup codes for storage
export function encryptBackupCodes(codes: string[]): string {
  const hashedCodes = codes.map(code => hashBackupCode(code));
  return encryptSecret(JSON.stringify(hashedCodes));
}


















