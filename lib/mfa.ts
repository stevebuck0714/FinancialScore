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
    const secret = decryptSecret(encryptedSecret);
    
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2, // Allow 2 time steps before and after (about 1 minute tolerance)
    });
  } catch (error) {
    console.error('Error verifying TOTP:', error);
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















