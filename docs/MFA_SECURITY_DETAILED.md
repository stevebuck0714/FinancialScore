# Multi-Factor Authentication Security - Detailed Documentation

**Corelytics MFA & Trusted Device System**  
*Comprehensive Technical and Security Documentation*

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Security Implementation](#security-implementation)
4. [Trusted Device Feature](#trusted-device-feature)
5. [User Flows](#user-flows)
6. [Technical Specifications](#technical-specifications)
7. [Database Schema](#database-schema)
8. [API Endpoints](#api-endpoints)
9. [Security Controls](#security-controls)
10. [Compliance & Standards](#compliance--standards)
11. [Monitoring & Auditing](#monitoring--auditing)
12. [Disaster Recovery](#disaster-recovery)
13. [Configuration](#configuration)
14. [Troubleshooting](#troubleshooting)

---

## Executive Summary

### Purpose
Corelytics implements enterprise-grade Multi-Factor Authentication (MFA) to protect user accounts against unauthorized access. The system combines TOTP-based authentication with an optional trusted device feature that balances security with user convenience.

### Key Features
- **Mandatory MFA**: Required for all users in production/staging environments
- **TOTP Standard**: Industry-standard time-based one-time passwords (RFC 6238)
- **Trusted Devices**: Optional 60-day MFA exemption for personal devices
- **Backup Codes**: 10 single-use recovery codes per user
- **Email Notifications**: Security alerts for account activity
- **Audit Logging**: Complete trail of authentication events

### Security Posture
- **Encryption**: AES-256 for secrets, SHA-256 for tokens
- **Cookie Security**: httpOnly, Secure, SameSite attributes
- **Device Limits**: Maximum 5 trusted devices per user
- **Automatic Cleanup**: Daily removal of expired trusted devices
- **User Control**: Self-service device management and revocation

---

## System Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                     User Authentication Flow                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Login Endpoint  │
                    │  (Email/Password)│
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Check Trusted   │
                    │     Device       │
                    └──────────────────┘
                       │            │
              Valid    │            │    Not Found/Expired
                       ▼            ▼
            ┌──────────────┐  ┌──────────────┐
            │  Skip MFA    │  │  Require MFA │
            │  Login OK    │  │  Verification│
            └──────────────┘  └──────────────┘
                                      │
                                      ▼
                              ┌──────────────────┐
                              │  MFA Endpoint    │
                              │  (TOTP/Backup)   │
                              └──────────────────┘
                                      │
                                      ▼
                              ┌──────────────────┐
                              │  Remember Device?│
                              └──────────────────┘
                                 │            │
                            Yes  │            │  No
                                 ▼            ▼
                    ┌──────────────────┐  ┌──────────┐
                    │  Create Trusted  │  │  Login   │
                    │     Device       │  │  Success │
                    │  Send Email      │  └──────────┘
                    └──────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Authentication** | NextAuth.js | Session management |
| **MFA Library** | Speakeasy | TOTP generation & verification |
| **QR Codes** | qrcode | Enrollment QR code generation |
| **Database** | PostgreSQL (Neon) | User & device storage |
| **ORM** | Prisma | Database access |
| **Encryption** | Node.js crypto | AES-256 encryption |
| **Email** | Resend | Notification delivery |
| **Hosting** | Vercel | Serverless deployment |

---

## Security Implementation

### 1. MFA Secret Generation

```javascript
// Process
1. Generate 32-character base32 secret using Speakeasy
2. Encrypt secret with AES-256-CBC encryption
3. Store encrypted secret in database
4. Generate otpauth:// URL for QR code
5. Never transmit or log unencrypted secret
```

**Security Properties:**
- Cryptographically random generation
- Unique per user
- Never stored in plain text
- Encrypted at rest
- Separate encryption key from database credentials

### 2. TOTP Verification

```javascript
// Verification Process
1. User enters 6-digit code from authenticator app
2. System retrieves encrypted secret from database
3. Secret is decrypted in memory only
4. TOTP verification checks current + adjacent time windows
5. Decrypted secret immediately discarded from memory
```

**Security Properties:**
- 30-second time window
- Checks adjacent windows for clock skew tolerance
- One-time use within time window
- Resistant to replay attacks
- No secret exposure in logs or responses

### 3. Backup Codes

```javascript
// Generation & Storage
1. Generate 10 random 10-character alphanumeric codes
2. Hash each code individually with SHA-256
3. Encrypt entire hash array with AES-256
4. Store encrypted array in database
5. Display codes to user once during enrollment
```

**Security Properties:**
- Single-use only
- Cryptographically random
- Hashed and encrypted at rest
- Removed immediately after use
- User warned when running low

### 4. Password Security

```javascript
// Password Handling
1. User passwords hashed with bcrypt
2. Cost factor: 10 rounds (configurable)
3. Automatic salt generation per password
4. Never stored or logged in plain text
5. Verified using constant-time comparison
```

---

## Trusted Device Feature

### Overview
The trusted device feature allows users to skip MFA verification for 60 days on devices they regularly use, reducing authentication friction while maintaining security.

### Token Generation Process

```javascript
// Secure Token Creation
1. Generate 32-byte (64-character hex) cryptographically random token
2. Create device fingerprint from User-Agent + IP address
3. Hash token with SHA-256 (one-way, non-reversible)
4. Store hashed token in database with metadata
5. Set original token in httpOnly secure cookie
6. Send email notification to user
```

### Security Controls

| Control | Implementation | Purpose |
|---------|---------------|---------|
| **Token Strength** | 256-bit random | Prevent brute force |
| **One-Way Hash** | SHA-256 | Token compromise protection |
| **Cookie Security** | httpOnly, Secure, SameSite | XSS/CSRF prevention |
| **Device Fingerprinting** | Browser + IP hash | Additional validation |
| **Expiration** | 60 days automatic | Limit exposure window |
| **Device Limit** | 5 per user | Prevent abuse |
| **Email Alerts** | Immediate notification | User awareness |
| **User Revocation** | Self-service removal | User control |

### Device Validation Flow

```javascript
// On Subsequent Login
1. Extract device token from cookie
2. Hash token with SHA-256
3. Query database for matching hashed token
4. Verify token belongs to user
5. Check expiration date
6. Optional: Validate device fingerprint
7. Update last used timestamp
8. Grant access or require MFA
```

### Automatic Cleanup

```javascript
// Daily Cron Job (3 AM UTC)
1. Query all trusted devices with expiresAt < now()
2. Mark as inactive (soft delete)
3. Log cleanup results
4. Run via Vercel Cron or system scheduler
```

---

## User Flows

### Flow 1: Initial MFA Enrollment

```
1. User attempts first login (production/staging)
2. Credentials validated ✓
3. System detects: mfaEnabled = false
4. Redirect to MFA Enrollment screen
5. Generate QR code + secret
6. User scans QR code with authenticator app
7. User enters code from app
8. System verifies code
9. Generate 10 backup codes
10. Display backup codes to user (ONCE)
11. User confirms they've saved codes
12. Set mfaEnabled = true
13. Complete login
```

### Flow 2: Login with MFA (No Trusted Device)

```
1. User enters email + password
2. Credentials validated ✓
3. Check for trusted device cookie
4. No valid cookie found
5. Redirect to MFA Verification screen
6. User enters 6-digit code
7. Optional: User checks "Remember this device"
8. Code verified ✓
9. If remembered: Create trusted device + send email
10. Complete login
```

### Flow 3: Login with Trusted Device

```
1. User enters email + password
2. Credentials validated ✓
3. Check for trusted device cookie ✓
4. Cookie found and valid
5. Validate hashed token in database ✓
6. Check expiration ✓
7. Optional: Validate fingerprint
8. Update last used timestamp
9. Skip MFA verification ✓
10. Complete login directly
```

### Flow 4: Backup Code Recovery

```
1. User lost access to authenticator app
2. User clicks "Use backup code instead"
3. User enters one of 10 backup codes
4. System hashes entered code
5. Compare with encrypted code array
6. If match: Remove code from array
7. Update database with remaining codes
8. Complete login
9. Warn user if backup codes depleted
```

### Flow 5: Device Management

```
1. User navigates to Security Settings
2. View list of trusted devices
3. See: Device name, IP, last used, expires
4. User can:
   - Revoke single device
   - Revoke all devices
5. Revoked devices require MFA on next login
```

---

## Technical Specifications

### Encryption Details

#### MFA Secret Encryption (AES-256-CBC)
```javascript
Algorithm: AES-256-CBC
Key Size: 256 bits (64 hex characters)
IV: Random 16 bytes per encryption
Format: <iv>:<encryptedData>
Key Source: MFA_ENCRYPTION_KEY environment variable
```

#### Device Token Hashing (SHA-256)
```javascript
Algorithm: SHA-256
Input: 64-character hex token
Output: 64-character hex hash
Salt: None (one-way hash, not for password)
Purpose: Secure storage, prevent token exposure
```

#### Password Hashing (bcrypt)
```javascript
Algorithm: bcrypt
Cost Factor: 10 rounds
Salt: Automatic per-password
Output: 60-character bcrypt hash
Library: bcryptjs
```

### Cookie Configuration

```javascript
// Production
{
  name: 'mfa_device_token',
  value: <64-char-token>,
  httpOnly: true,        // Prevent JavaScript access
  secure: true,          // HTTPS only
  sameSite: 'lax',       // CSRF protection
  maxAge: 5184000,       // 60 days in seconds
  path: '/',             // Site-wide
  domain: undefined      // Same domain only
}
```

### TOTP Parameters

```javascript
// Speakeasy Configuration
{
  algorithm: 'sha1',     // TOTP standard
  digits: 6,             // 6-digit codes
  step: 30,              // 30-second validity
  window: 1,             // Check ±1 time window
  encoding: 'base32',    // Secret encoding
  issuer: 'Corelytics'   // Displayed in app
}
```

---

## Database Schema

### User Table (Relevant Fields)

```sql
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT UNIQUE NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "mfaEnabled" BOOLEAN DEFAULT false,
  "mfaSecret" TEXT,              -- AES-256 encrypted
  "backupCodes" TEXT,            -- AES-256 encrypted array
  -- ... other fields
);
```

### TrustedDevice Table

```sql
CREATE TABLE "TrustedDevice" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "deviceToken" TEXT UNIQUE NOT NULL,    -- SHA-256 hash
  "deviceName" TEXT NOT NULL,            -- e.g. "Chrome on Windows"
  "deviceFingerprint" TEXT,              -- Browser + IP hash
  "ipAddress" TEXT,                      -- For audit
  "userAgent" TEXT,                      -- For audit
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "lastUsedAt" TIMESTAMP DEFAULT NOW(),
  "expiresAt" TIMESTAMP NOT NULL,        -- createdAt + 60 days
  "isActive" BOOLEAN DEFAULT true,
  
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Indexes
CREATE UNIQUE INDEX "TrustedDevice_deviceToken_key" ON "TrustedDevice"("deviceToken");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");
CREATE INDEX "TrustedDevice_isActive_idx" ON "TrustedDevice"("isActive");
```

---

## API Endpoints

### POST /api/auth/mfa/enroll
**Purpose**: Initialize MFA enrollment for a user

**Request:**
```json
{
  "userId": "string"
}
```

**Response:**
```json
{
  "qrCodeDataURL": "data:image/png;base64,...",
  "backupCodes": ["CODE1", "CODE2", ...]
}
```

### POST /api/auth/mfa/verify-enrollment
**Purpose**: Complete MFA enrollment with code verification

**Request:**
```json
{
  "userId": "string",
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "MFA enabled successfully"
}
```

### POST /api/auth/mfa/login
**Purpose**: Verify MFA code and complete login

**Request:**
```json
{
  "userId": "string",
  "token": "123456",
  "isBackupCode": false,
  "rememberDevice": true
}
```

**Response:**
```json
{
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    ...
  }
}
```

**Side Effects:**
- Sets `mfa_device_token` cookie if `rememberDevice = true`
- Sends email notification for new trusted device

### GET /api/auth/trusted-devices
**Purpose**: List user's trusted devices

**Headers:**
```
x-user-id: string
```

**Response:**
```json
{
  "devices": [
    {
      "id": "string",
      "deviceName": "Chrome on Windows",
      "ipAddress": "192.168.1.1",
      "createdAt": "2026-01-05T12:00:00Z",
      "lastUsedAt": "2026-01-05T14:30:00Z",
      "expiresAt": "2026-03-06T12:00:00Z"
    }
  ]
}
```

### DELETE /api/auth/trusted-devices/:deviceId
**Purpose**: Revoke a specific trusted device

**Headers:**
```
x-user-id: string
```

**Response:**
```json
{
  "success": true,
  "message": "Trusted device has been revoked"
}
```

### DELETE /api/auth/trusted-devices
**Purpose**: Revoke all trusted devices for a user

**Headers:**
```
x-user-id: string
```

**Response:**
```json
{
  "success": true,
  "message": "All trusted devices have been revoked"
}
```

**Side Effects:**
- Clears `mfa_device_token` cookie

---

## Security Controls

### Access Controls
- ✅ MFA endpoints require valid user session or userId
- ✅ Device management requires authenticated user
- ✅ Users can only manage their own devices
- ✅ Admin override capability for emergency MFA resets
- ✅ Rate limiting on MFA verification attempts (future enhancement)

### Data Protection
- ✅ MFA secrets encrypted at rest (AES-256)
- ✅ Device tokens hashed before storage (SHA-256)
- ✅ Passwords hashed with bcrypt
- ✅ Backup codes encrypted at rest
- ✅ Sensitive data never logged
- ✅ HTTPS enforced in production

### Session Management
- ✅ Trusted device cookies are httpOnly
- ✅ Secure flag enabled in production
- ✅ SameSite attribute prevents CSRF
- ✅ Automatic cookie expiration
- ✅ Session invalidation on logout

### Audit & Monitoring
- ✅ All MFA operations logged
- ✅ Failed login attempts tracked
- ✅ Device creation/revocation audited
- ✅ Email notifications for security events
- ✅ Vercel function logs retained

---

## Compliance & Standards

### NIST Guidelines
- ✅ **Multi-Factor**: Implements "something you know" + "something you have"
- ✅ **TOTP Standard**: Follows NIST SP 800-63B guidelines
- ✅ **Secret Storage**: Encrypted at rest per NIST recommendations
- ✅ **Recovery Codes**: Secure backup authentication method

### RFC 6238 (TOTP)
- ✅ SHA-1 algorithm (standard)
- ✅ 30-second time step
- ✅ 6-digit codes
- ✅ Base32 secret encoding
- ✅ Time window tolerance for clock skew

### OWASP Best Practices
- ✅ **A02:2021 - Cryptographic Failures**: Strong encryption (AES-256)
- ✅ **A04:2021 - Insecure Design**: Defense in depth with MFA
- ✅ **A07:2021 - Authentication Failures**: MFA prevents credential stuffing
- ✅ **A09:2021 - Security Logging**: Comprehensive audit trail

### GDPR Considerations
- ✅ User data encrypted
- ✅ User control over trusted devices
- ✅ Data retention policies (60-day device expiration)
- ✅ Audit trail for compliance
- ✅ User notification of security events

---

## Monitoring & Auditing

### Audit Logs
```javascript
// Logged Events
- MFA enrollment initiated
- MFA enrollment completed
- MFA verification success/failure
- Trusted device created
- Trusted device validated
- Trusted device revoked
- Backup code used
- Failed login attempts
```

### Metrics to Monitor
- MFA enrollment rate
- MFA verification success rate
- Trusted device adoption rate
- Failed verification attempts
- Backup code usage
- Device revocation frequency

### Vercel Function Logs
```
Location: Vercel Dashboard → Functions
Key Endpoints:
- /api/auth/login
- /api/auth/mfa/login
- /api/auth/mfa/enroll
- /api/cron/cleanup-devices
```

---

## Disaster Recovery

### User Lost Authenticator App
**Solution**: Use one of 10 backup codes

**Process**:
1. User clicks "Use backup code instead"
2. Enters one backup code
3. Code verified and removed from list
4. User logs in successfully
5. User can re-enroll MFA or continue with remaining codes

### User Lost Backup Codes
**Solution**: Admin MFA reset

**Process**:
1. User contacts support
2. Verify user identity (email, security questions, etc.)
3. Admin runs MFA reset script
4. User re-enrolls in MFA
5. New backup codes generated

### Compromised Device Token
**Solution**: User revokes device

**Process**:
1. User logs into security settings
2. Views trusted devices
3. Revokes suspicious device
4. MFA required on next login from that device

### Mass Security Incident
**Solution**: Bulk device revocation

**Process**:
1. Admin identifies compromised accounts
2. Run bulk revocation script
3. All affected users forced to use MFA
4. Email notifications sent
5. Investigate and remediate

---

## Configuration

### Environment Variables

#### Required
```bash
# Database
DATABASE_URL="postgresql://..."

# Authentication
NEXTAUTH_SECRET="<random-secret>"
NEXTAUTH_URL="https://your-domain.com"

# MFA Encryption
MFA_ENCRYPTION_KEY="<64-char-hex>"

# Email Notifications
RESEND_API_KEY="<your-resend-key>"
```

#### Optional
```bash
# Trusted Device Settings
MFA_TRUST_DURATION_DAYS=60              # Default: 30
MFA_MAX_TRUSTED_DEVICES_PER_USER=5      # Default: 5

# Development
DISABLE_MFA_DEV=true                    # Skip MFA in dev
NODE_ENV=development                    # Environment

# Cron Security
CRON_SECRET="<random-secret>"           # Secure cron endpoints
```

### Vercel Configuration

#### Build Command
```json
{
  "build": "prisma generate && node scripts/check-deploy-block.js && next build"
}
```

#### Cron Jobs
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-devices",
      "schedule": "0 3 * * *"
    }
  ]
}
```

---

## Troubleshooting

### Issue: Invalid MFA Code

**Symptoms**: User enters code but verification fails

**Causes**:
1. Device time not synchronized
2. Code expired (>30 seconds old)
3. Wrong secret in authenticator app
4. Database encryption key mismatch

**Solutions**:
1. Sync device clock with NTP
2. Try fresh code immediately after generation
3. Re-enroll in MFA if persistent
4. Verify MFA_ENCRYPTION_KEY matches across environments

### Issue: Trusted Device Not Working

**Symptoms**: User still prompted for MFA after checking "Remember"

**Causes**:
1. Cookies disabled in browser
2. Cookie expired
3. Device token not created
4. Different browser/incognito mode

**Solutions**:
1. Enable cookies in browser settings
2. Check cookie in browser dev tools
3. Review server logs for device creation
4. Use same browser/profile

### Issue: Email Notifications Not Sent

**Symptoms**: No email received for new trusted device

**Causes**:
1. RESEND_API_KEY not set
2. Invalid email address
3. Email in spam folder
4. Resend service error

**Solutions**:
1. Verify RESEND_API_KEY in environment variables
2. Check user email in database
3. Check spam/junk folder
4. Review Vercel function logs

### Issue: Backup Codes Don't Work

**Symptoms**: Backup code rejected during login

**Causes**:
1. Code already used
2. Incorrect code entered
3. Database encryption key mismatch
4. Typo in code

**Solutions**:
1. Try different unused backup code
2. Copy-paste code to avoid typos
3. Verify encryption key
4. Contact admin for MFA reset if all codes exhausted

---

## Maintenance Tasks

### Regular Tasks
- ✅ Review MFA enrollment rates monthly
- ✅ Monitor failed verification attempts
- ✅ Check cron job execution logs
- ✅ Audit trusted device usage
- ✅ Review email notification delivery

### Periodic Reviews
- ✅ Security audit quarterly
- ✅ Update dependencies
- ✅ Review and rotate encryption keys annually
- ✅ Test disaster recovery procedures
- ✅ Update documentation

### Database Maintenance
```sql
-- Check expired devices
SELECT COUNT(*) FROM "TrustedDevice" 
WHERE "expiresAt" < NOW() AND "isActive" = true;

-- Check user MFA enrollment
SELECT COUNT(*) as total,
       SUM(CASE WHEN "mfaEnabled" THEN 1 ELSE 0 END) as enrolled
FROM "User";

-- Check device distribution
SELECT "userId", COUNT(*) as device_count
FROM "TrustedDevice"
WHERE "isActive" = true
GROUP BY "userId"
ORDER BY device_count DESC;
```

---

## Appendix

### References
- [RFC 6238 - TOTP Specification](https://tools.ietf.org/html/rfc6238)
- [NIST SP 800-63B - Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

### Related Documentation
- `MFA_SECURITY_SUMMARY.md` - One-page overview
- `TRUSTED_DEVICES_IMPLEMENTATION.md` - Implementation details
- `TRUSTED_DEVICES_QUICK_START.md` - Quick setup guide
- `MFA_TESTING_GUIDE.md` - Testing procedures

### Change Log
| Date | Version | Changes |
|------|---------|---------|
| 2026-01-05 | 1.0 | Initial implementation with trusted device feature |

---

**Document Owner**: Security Team  
**Last Review**: January 5, 2026  
**Next Review**: April 5, 2026  
**Classification**: Internal Use

