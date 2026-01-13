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
 * Get encryption key for MFA secrets
 * CRITICAL: Must be set in environment, no fallbacks
 */
function getMFAEncryptionKey(): Buffer {
  const key = process.env.MFA_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error(
      'SECURITY ERROR: MFA_ENCRYPTION_KEY not configured. ' +
      'MFA secrets cannot be encrypted. Set this environment variable immediately.'
    );
  }
  
  if (key.length < 64) {
    throw new Error(
      'SECURITY ERROR: MFA_ENCRYPTION_KEY must be at least 64 hexadecimal characters (32 bytes). ' +
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

/**
 * Encrypt MFA secret
 */
export function encryptMFASecret(plaintext: string): string {
  const key = getMFAEncryptionKey();
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt MFA secret
 */
export function decryptMFASecret(encryptedData: string): string {
  const key = getMFAEncryptionKey();
  
  // Handle old format for backward compatibility
  const parts = encryptedData.split(':');
  
  if (parts.length === 2) {
    console.warn('WARNING: Decrypting MFA secret with old encryption format. Should be re-encrypted.');
    const [ivHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted MFA data format');
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

/**
 * Validate all required encryption keys are configured
 * Call this on application startup
 */
export function validateEncryptionKeys(): void {
  const errors: string[] = [];
  
  try {
    getOAuthEncryptionKey();
  } catch (error) {
    errors.push('OAUTH_ENCRYPTION_KEY: ' + (error as Error).message);
  }
  
  try {
    getMFAEncryptionKey();
  } catch (error) {
    errors.push('MFA_ENCRYPTION_KEY: ' + (error as Error).message);
  }
  
  if (errors.length > 0) {
    console.error('❌ ENCRYPTION KEY VALIDATION FAILED:');
    errors.forEach(err => console.error('   - ' + err));
    console.error('\n🔐 Generate secure keys with:');
    console.error('   openssl rand -hex 32\n');
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Encryption keys not properly configured for production');
    } else {
      console.warn('⚠️  WARNING: Continuing in development mode with missing encryption keys');
    }
  } else {
    console.log('✅ All encryption keys validated');
  }
}

