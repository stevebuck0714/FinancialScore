import crypto from 'crypto';

/**
 * Secure Encryption Utilities
 * 
 * SECURITY CRITICAL:
 * - No hardcoded fallback keys
 * - Different keys for different data types
 * - AES-256-GCM for authenticated encryption
 * - Throws errors if encryption keys are missing
 */

/**
 * Get encryption key for OAuth tokens
 * CRITICAL: Must be set in environment, no fallbacks
 */
function getOAuthEncryptionKey(): Buffer {
  const key = process.env.OAUTH_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      'SECURITY ERROR: OAUTH_ENCRYPTION_KEY not configured. ' +
      'OAuth tokens cannot be encrypted. Set this environment variable immediately.'
    );
  }
  
  if (key.length < 64) {
    throw new Error(
      'SECURITY ERROR: OAUTH_ENCRYPTION_KEY must be at least 64 hexadecimal characters (32 bytes). ' +
      `Current length: ${key.length}. Generate with: openssl rand -hex 32`
    );
  }
  
  return Buffer.from(key.substring(0, 64), 'hex');
}

/**
 * Encrypt data using AES-256-GCM (authenticated encryption)
 * Returns format: iv:authTag:encrypted
 */
export function encryptOAuthToken(plaintext: string): string {
  const key = getOAuthEncryptionKey();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt OAuth token
 */
export function decryptOAuthToken(encryptedData: string): string {
  const key = getOAuthEncryptionKey();
  
  // Handle old format (iv:encrypted) for backward compatibility
  const parts = encryptedData.split(':');
  
  if (parts.length === 2) {
    // Old format without auth tag (CBC mode)
    console.warn('WARNING: Decrypting token with old encryption format (no auth tag). Token should be re-encrypted.');
    const [ivHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

