import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

function deriveKeyBuffer(rawKey: string): Buffer {
  const key = (rawKey || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

function getEncryptionKeyCandidates(): string[] {
  const candidates = [
    process.env.MFA_ENCRYPTION_KEY,
    process.env.OAUTH_ENCRYPTION_KEY,
    'default-key-change-me-in-prod',
  ]
    .map((value) => (value || '').trim())
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

// Encryption for MFA secrets
function encryptSecret(text: string): string {
  const keyBuffer = deriveKeyBuffer(
    process.env.MFA_ENCRYPTION_KEY || process.env.OAUTH_ENCRYPTION_KEY || 'default-key-change-me-in-prod'
  );
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptSecret(encryptedText: string): string {
  if (!encryptedText) throw new Error('Missing encrypted secret');

  const parts = encryptedText.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('Secret is not in encrypted format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  let lastError: unknown = null;
  for (const keyCandidate of getEncryptionKeyCandidates()) {
    try {
      const keyBuffer = deriveKeyBuffer(keyCandidate);
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to decrypt secret');
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
export function verifyTOTP(token: string, encryptedSecret: string): boolean {
  try {
    const normalizedToken = String(token || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedToken)) {
      console.log('❌ Invalid token format for TOTP');
      return false;
    }

    console.log('🔓 Resolving MFA secret...');
    let secret = '';
    try {
      secret = decryptSecret(encryptedSecret);
    } catch {
      // Backward compatibility: support previously stored plain base32 secrets.
      secret = encryptedSecret;
    }
    console.log('✅ Secret decrypted, length:', secret.length);
    
    console.log('🔐 Verifying TOTP with token:', normalizedToken);
    const result = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: normalizedToken,
      window: 2, // Allow 2 time steps before and after (about 1 minute tolerance)
    });
    
    console.log('✅ TOTP verify result:', result);
    
    // Also log what the current valid token should be for debugging
    const currentToken = speakeasy.totp({
      secret: secret,
      encoding: 'base32'
    });
    console.log('ℹ️ Current valid token from server:', currentToken);
    
    return result;
  } catch (error) {
    console.error('❌ Error verifying TOTP:', error);
    return false;
  }
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


















