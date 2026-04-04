 Corelytics Operational Manual

Contents
Corelytics Operational Manual	1
1.	Purpose and Scope	1
2.	Operating Model Overview	1
3.	Technology and Runtime	2
4.	Security, Privacy, and Access Control	3
5.	Company Configuration and Site Administration	24
6.	Accounting Integrations and Data Contracts	27
7.	Functional Areas: Design and Runtime Behavior	28
a)	7.1 Operations Hub	28
8.	DataRoom	29
9.	Expert Analysis	32
10.	Ask Corelytics	34
11.	Company Pulse	40
12.	Ratios and Trend Analysis	47
13.	Goals and Projections	50
14.	Line of Business allocation	50
15.	Valuation and recommendation modules	50
16.	Sector System and Reporting Logic	50
17.	Payments and Revenue Share Operations	51
18.	Technology and runtime details (`TECH_STACK.md`)	52
19.	MFA operating controls (`MFA_SECURITY_SUMMARY.md`, `MFA_CLIENT_OVERVIEW.md`)	53
20.	QuickBooks Desktop project schema details (`QBD_PROJECT_SCHEMA_EXTENSION.md`)	54
21.	Canonical operations data contract details (`OPERATIONS_PLAYBOOK_DATA_MATRIX.md`)	55
22.	DataRoom design and production validation detail (`DATAROOM_FUNCTIONAL_OVERVIEW.md`, `DATAROOM_PROD_VALIDATION_CHECKLIST.md`)	56
23.	Sector mapping and playbook details (`SECTOR_MAPPING_SCHEMA_DRAFT.md`, `SECTOR_PLAYBOOK_LIBRARY.md`)	57
b)	Purpose	58
c)	Schema: Sector Playbook	58
d)	How the playbook is used	60
e)	Playbook content by sector	61
f)	MINING	62
g)	Implementation notes	69
h)	Summary	70
24.	Product margin weekly operating detail (`PRODUCT_MARGIN_WEEKLY_REPORTING_IMPLEMENTATION_PLAN.md`)	70
25.	Payment and revenue-share operations (`USAEPAY_INTEGRATION.md`)	73



1.  Purpose and Scope

This manual describes how the Corelytics platform is designed to operate end-to-end across:

- platform architecture and security
- company onboarding and Site Admin controls
- accounting integrations and data movement
- functional modules (Operations, DataRoom, Analysis, Ratios, Goals/Projections, SDE/Valuation, Payments)
- sector-specific reporting behavior
- operational guardrails, controls, and cadences

This is an operations/design manual (how the system works), not a click-by-click user guide.

 Manual Set

This manual is part of a three-document set:

- Core operational reference: `docs/OPERATIONAL_MANUAL.md`
- Executive summary: `docs/OPERATIONAL_MANUAL_EXECUTIVE_SUMMARY.md`
- Role-based runbooks: `docs/OPERATIONAL_MANUAL_RUNBOOK_APPENDIX.md`
- Enterprise controls appendix: `docs/OPERATIONAL_MANUAL_APPENDIX_ENTERPRISE_CONTROLS.md`

2.  Operating Model Overview

Corelytics runs as a multi-tenant financial intelligence platform where:

- Company is the tenancy boundary.
- Sector drives default operational categories and analytics focus.
- Accounting integrations feed canonical datasets.
- Operational Hub and analytics modules render standardized outputs.
- Site Admin controls company-level behavior, visibility, pricing, and data mode.

The platform is designed to support both:

- standardized cross-company reporting contracts, and
- selective company-specific customization where needed.

3.  Technology and Runtime

Based on `TECH_STACK.md`:

- Frontend: Next.js 14 App Router, React 18, TypeScript, Recharts.
- Backend/API: Next.js route handlers (`app/api`), Node runtime, socket support.
- Data layer: Prisma ORM with PostgreSQL (primary), SQLite for dev tooling.
- Authentication: NextAuth; MFA support via OTP (Speakeasy + QR).
- Integrations: QuickBooks, Xero, Infor (M3/CSI), payment gateway (USAePay), AI services.
- Tooling: ESLint, TypeScript, Prisma migrations/scripts.
Overview
- Framework: Next.js 14 (App Router)
- Language: TypeScript, React 18
- Runtime: Node.js

Frontend
- UI: React with Next.js server/client components
- Charts: Recharts
- Icons: lucide-react
- Notifications: react-hot-toast

Backend / API
- API: Next.js Route Handlers (app/api)
- Auth: NextAuth.js (beta)
- Realtime: socket.io (server and client)

Data Layer
- ORM: Prisma
- Databases: PostgreSQL (pg) and SQLite (dev tooling)
- Migrations/Seeds: Prisma CLI + tsx scripts

Integrations
- QuickBooks: intuit-oauth
- Xero: xero-node
- Email: Resend
- AI: OpenAI SDK

Security / MFA
- Password hashing: bcryptjs
- MFA/OTP: speakeasy + qrcode

Tooling
- Linting: ESLint with eslint-config-next
- Typechecking: TypeScript
- Scripts: tsx runner for scripts and seeds

Build/Deployment
- Build: next build + Prisma generate
- Runtime server: custom Node server (server.js) and Next.js server on Vercel


4.  Security, Privacy, and Access Control

 4.1 Security posture

Security design is layered:

- authentication + session controls
- MFA support (including trusted-device behavior)
- role-based access (including Site Admin-only configuration actions)
- company boundary checks in data and document APIs
- auditable operational actions

From MFA and integration security docs:

- MFA is implemented and operational with trusted-device support.
- MFA is required to mitigate credential compromise and account takeover risk.
 Multi-Factor Authentication Security - Detailed Documentation

Corelytics MFA & Trusted Device System  
Comprehensive Technical and Security Documentation

---

 Table of Contents

1. [Executive Summary](executive-summary)
2. [System Architecture](system-architecture)
3. [Security Implementation](security-implementation)
4. [Trusted Device Feature](trusted-device-feature)
5. [User Flows](user-flows)
6. [Technical Specifications](technical-specifications)
7. [Database Schema](database-schema)
8. [API Endpoints](api-endpoints)
9. [Security Controls](security-controls)
10. [Compliance & Standards](compliance--standards)
11. [Monitoring & Auditing](monitoring--auditing)
12. [Disaster Recovery](disaster-recovery)
13. [Configuration](configuration)
14. [Troubleshooting](troubleshooting)

---

 Executive Summary

 Purpose
Corelytics implements enterprise-grade Multi-Factor Authentication (MFA) to protect user accounts against unauthorized access. The system combines TOTP-based authentication with an optional trusted device feature that balances security with user convenience.

 Key Features
- Mandatory MFA: Required for all users in production/staging environments
- TOTP Standard: Industry-standard time-based one-time passwords (RFC 6238)
- Trusted Devices: Optional 60-day MFA exemption for personal devices
- Backup Codes: 10 single-use recovery codes per user
- Email Notifications: Security alerts for account activity
- Audit Logging: Complete trail of authentication events

 Security Posture
- Encryption: AES-256 for secrets, SHA-256 for tokens
- Cookie Security: httpOnly, Secure, SameSite attributes
- Device Limits: Maximum 5 trusted devices per user
- Automatic Cleanup: Daily removal of expired trusted devices
- User Control: Self-service device management and revocation

---

 System Architecture

 Components

```
???????????????????????????????????????????????????????????????
?                     User Authentication Flow                 ?
???????????????????????????????????????????????????????????????
                              ?
                              ?
                    ????????????????????
                    ?  Login Endpoint  ?
                    ?  (Email/Password)?
                    ????????????????????
                              ?
                              ?
                    ????????????????????
                    ?  Check Trusted   ?
                    ?     Device       ?
                    ????????????????????
                       ?            ?
              Valid    ?            ?    Not Found/Expired
                       ?            ?
            ????????????????  ????????????????
            ?  Skip MFA    ?  ?  Require MFA ?
            ?  Login OK    ?  ?  Verification?
            ????????????????  ????????????????
                                      ?
                                      ?
                              ????????????????????
                              ?  MFA Endpoint    ?
                              ?  (TOTP/Backup)   ?
                              ????????????????????
                                      ?
                                      ?
                              ????????????????????
                              ?  Remember Device??
                              ????????????????????
                                 ?            ?
                            Yes  ?            ?  No
                                 ?            ?
                    ????????????????????  ????????????
                    ?  Create Trusted  ?  ?  Login   ?
                    ?     Device       ?  ?  Success ?
                    ?  Send Email      ?  ????????????
                    ????????????????????
```

 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Authentication | NextAuth.js | Session management |
| MFA Library | Speakeasy | TOTP generation & verification |
| QR Codes | qrcode | Enrollment QR code generation |
| Database | PostgreSQL (Neon) | User & device storage |
| ORM | Prisma | Database access |
| Encryption | Node.js crypto | AES-256 encryption |
| Email | Resend | Notification delivery |
| Hosting | Vercel | Serverless deployment |

---

 Security Implementation

 1. MFA Secret Generation

```javascript
// Process
1. Generate 32-character base32 secret using Speakeasy
2. Encrypt secret with AES-256-CBC encryption
3. Store encrypted secret in database
4. Generate otpauth:// URL for QR code
5. Never transmit or log unencrypted secret
```

Security Properties:
- Cryptographically random generation
- Unique per user
- Never stored in plain text
- Encrypted at rest
- Separate encryption key from database credentials

 2. TOTP Verification

```javascript
// Verification Process
1. User enters 6-digit code from authenticator app
2. System retrieves encrypted secret from database
3. Secret is decrypted in memory only
4. TOTP verification checks current + adjacent time windows
5. Decrypted secret immediately discarded from memory
```

Security Properties:
- 30-second time window
- Checks adjacent windows for clock skew tolerance
- One-time use within time window
- Resistant to replay attacks
- No secret exposure in logs or responses

 3. Backup Codes

```javascript
// Generation & Storage
1. Generate 10 random 10-character alphanumeric codes
2. Hash each code individually with SHA-256
3. Encrypt entire hash array with AES-256
4. Store encrypted array in database
5. Display codes to user once during enrollment
```

Security Properties:
- Single-use only
- Cryptographically random
- Hashed and encrypted at rest
- Removed immediately after use
- User warned when running low

 4. Password Security

```javascript
// Password Handling
1. User passwords hashed with bcrypt
2. Cost factor: 10 rounds (configurable)
3. Automatic salt generation per password
4. Never stored or logged in plain text
5. Verified using constant-time comparison
```

---

 Trusted Device Feature

 Overview
The trusted device feature allows users to skip MFA verification for 60 days on devices they regularly use, reducing authentication friction while maintaining security.

 Token Generation Process

```javascript
// Secure Token Creation
1. Generate 32-byte (64-character hex) cryptographically random token
2. Create device fingerprint from User-Agent + IP address
3. Hash token with SHA-256 (one-way, non-reversible)
4. Store hashed token in database with metadata
5. Set original token in httpOnly secure cookie
6. Send email notification to user
```

 Security Controls

| Control | Implementation | Purpose |
|---------|---------------|---------|
| Token Strength | 256-bit random | Prevent brute force |
| One-Way Hash | SHA-256 | Token compromise protection |
| Cookie Security | httpOnly, Secure, SameSite | XSS/CSRF prevention |
| Device Fingerprinting | Browser + IP hash | Additional validation |
| Expiration | 60 days automatic | Limit exposure window |
| Device Limit | 5 per user | Prevent abuse |
| Email Alerts | Immediate notification | User awareness |
| User Revocation | Self-service removal | User control |

 Device Validation Flow

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

 Automatic Cleanup

```javascript
// Daily Cron Job (3 AM UTC)
1. Query all trusted devices with expiresAt < now()
2. Mark as inactive (soft delete)
3. Log cleanup results
4. Run via Vercel Cron or system scheduler
```

---

 User Flows

 Flow 1: Initial MFA Enrollment

```
1. User attempts first login (production/staging)
2. Credentials validated ?
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

 Flow 2: Login with MFA (No Trusted Device)

```
1. User enters email + password
2. Credentials validated ?
3. Check for trusted device cookie
4. No valid cookie found
5. Redirect to MFA Verification screen
6. User enters 6-digit code
7. Optional: User checks "Remember this device"
8. Code verified ?
9. If remembered: Create trusted device + send email
10. Complete login
```

 Flow 3: Login with Trusted Device

```
1. User enters email + password
2. Credentials validated ?
3. Check for trusted device cookie ?
4. Cookie found and valid
5. Validate hashed token in database ?
6. Check expiration ?
7. Optional: Validate fingerprint
8. Update last used timestamp
9. Skip MFA verification ?
10. Complete login directly
```

 Flow 4: Backup Code Recovery

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

 Flow 5: Device Management

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

 Technical Specifications

 Encryption Details

 MFA Secret Encryption (AES-256-CBC)
```javascript
Algorithm: AES-256-CBC
Key Size: 256 bits (64 hex characters)
IV: Random 16 bytes per encryption
Format: <iv>:<encryptedData>
Key Source: MFA_ENCRYPTION_KEY environment variable
```

 Device Token Hashing (SHA-256)
```javascript
Algorithm: SHA-256
Input: 64-character hex token
Output: 64-character hex hash
Salt: None (one-way hash, not for password)
Purpose: Secure storage, prevent token exposure
```

 Password Hashing (bcrypt)
```javascript
Algorithm: bcrypt
Cost Factor: 10 rounds
Salt: Automatic per-password
Output: 60-character bcrypt hash
Library: bcryptjs
```

 Cookie Configuration

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

 TOTP Parameters

```javascript
// Speakeasy Configuration
{
  algorithm: 'sha1',     // TOTP standard
  digits: 6,             // 6-digit codes
  step: 30,              // 30-second validity
  window: 1,             // Check �1 time window
  encoding: 'base32',    // Secret encoding
  issuer: 'Corelytics'   // Displayed in app
}
```

---

 Database Schema

 User Table (Relevant Fields)

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

 TrustedDevice Table

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

 API Endpoints

 POST /api/auth/mfa/enroll
Purpose: Initialize MFA enrollment for a user

Request:
```json
{
  "userId": "string"
}
```

Response:
```json
{
  "qrCodeDataURL": "data:image/png;base64,...",
  "backupCodes": ["CODE1", "CODE2", ...]
}
```

 POST /api/auth/mfa/verify-enrollment
Purpose: Complete MFA enrollment with code verification

Request:
```json
{
  "userId": "string",
  "token": "123456"
}
```

Response:
```json
{
  "success": true,
  "message": "MFA enabled successfully"
}
```

 POST /api/auth/mfa/login
Purpose: Verify MFA code and complete login

Request:
```json
{
  "userId": "string",
  "token": "123456",
  "isBackupCode": false,
  "rememberDevice": true
}
```

Response:
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

Side Effects:
- Sets `mfa_device_token` cookie if `rememberDevice = true`
- Sends email notification for new trusted device

 GET /api/auth/trusted-devices
Purpose: List user's trusted devices

Headers:
```
x-user-id: string
```

Response:
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

 DELETE /api/auth/trusted-devices/:deviceId
Purpose: Revoke a specific trusted device

Headers:
```
x-user-id: string
```

Response:
```json
{
  "success": true,
  "message": "Trusted device has been revoked"
}
```

 DELETE /api/auth/trusted-devices
Purpose: Revoke all trusted devices for a user

Headers:
```
x-user-id: string
```

Response:
```json
{
  "success": true,
  "message": "All trusted devices have been revoked"
}
```

Side Effects:
- Clears `mfa_device_token` cookie

---

 Security Controls

 Access Controls
- ? MFA endpoints require valid user session or userId
- ? Device management requires authenticated user
- ? Users can only manage their own devices
- ? Admin override capability for emergency MFA resets
- ? Rate limiting on MFA verification attempts (future enhancement)

 Data Protection
- ? MFA secrets encrypted at rest (AES-256)
- ? Device tokens hashed before storage (SHA-256)
- ? Passwords hashed with bcrypt
- ? Backup codes encrypted at rest
- ? Sensitive data never logged
- ? HTTPS enforced in production

 Session Management
- ? Trusted device cookies are httpOnly
- ? Secure flag enabled in production
- ? SameSite attribute prevents CSRF
- ? Automatic cookie expiration
- ? Session invalidation on logout

 Audit & Monitoring
- ? All MFA operations logged
- ? Failed login attempts tracked
- ? Device creation/revocation audited
- ? Email notifications for security events
- ? Vercel function logs retained

---

 Compliance & Standards

 NIST Guidelines
- ? Multi-Factor: Implements "something you know" + "something you have"
- ? TOTP Standard: Follows NIST SP 800-63B guidelines
- ? Secret Storage: Encrypted at rest per NIST recommendations
- ? Recovery Codes: Secure backup authentication method

 RFC 6238 (TOTP)
- ? SHA-1 algorithm (standard)
- ? 30-second time step
- ? 6-digit codes
- ? Base32 secret encoding
- ? Time window tolerance for clock skew

 OWASP Best Practices
- ? A02:2021 - Cryptographic Failures: Strong encryption (AES-256)
- ? A04:2021 - Insecure Design: Defense in depth with MFA
- ? A07:2021 - Authentication Failures: MFA prevents credential stuffing
- ? A09:2021 - Security Logging: Comprehensive audit trail

 GDPR Considerations
- ? User data encrypted
- ? User control over trusted devices
- ? Data retention policies (60-day device expiration)
- ? Audit trail for compliance
- ? User notification of security events

---

 Monitoring & Auditing

 Audit Logs
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

 Metrics to Monitor
- MFA enrollment rate
- MFA verification success rate
- Trusted device adoption rate
- Failed verification attempts
- Backup code usage
- Device revocation frequency

 Vercel Function Logs
```
Location: Vercel Dashboard ? Functions
Key Endpoints:
- /api/auth/login
- /api/auth/mfa/login
- /api/auth/mfa/enroll
- /api/cron/cleanup-devices
```

---

 Disaster Recovery

 User Lost Authenticator App
Solution: Use one of 10 backup codes

Process:
1. User clicks "Use backup code instead"
2. Enters one backup code
3. Code verified and removed from list
4. User logs in successfully
5. User can re-enroll MFA or continue with remaining codes

 User Lost Backup Codes
Solution: Admin MFA reset

Process:
1. User contacts support
2. Verify user identity (email, security questions, etc.)
3. Admin runs MFA reset script
4. User re-enrolls in MFA
5. New backup codes generated

 Compromised Device Token
Solution: User revokes device

Process:
1. User logs into security settings
2. Views trusted devices
3. Revokes suspicious device
4. MFA required on next login from that device

 Mass Security Incident
Solution: Bulk device revocation

Process:
1. Admin identifies compromised accounts
2. Run bulk revocation script
3. All affected users forced to use MFA
4. Email notifications sent
5. Investigate and remediate

---

 Configuration

 Environment Variables

 Required
```bash
 Database
DATABASE_URL="postgresql://..."

 Authentication
NEXTAUTH_SECRET="<random-secret>"
NEXTAUTH_URL="https://your-domain.com"

 MFA Encryption
MFA_ENCRYPTION_KEY="<64-char-hex>"

 Email Notifications
RESEND_API_KEY="<your-resend-key>"
```

 Optional
```bash
 Trusted Device Settings
MFA_TRUST_DURATION_DAYS=60               Default: 30
MFA_MAX_TRUSTED_DEVICES_PER_USER=5       Default: 5

 Development
DISABLE_MFA_DEV=true                     Skip MFA in dev
NODE_ENV=development                     Environment

 Cron Security
CRON_SECRET="<random-secret>"            Secure cron endpoints
```

 Vercel Configuration

 Build Command
```json
{
  "build": "prisma generate && node scripts/check-deploy-block.js && next build"
}
```

 Cron Jobs
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-devices",
      "schedule": "0 3   "
    }
  ]
}
```

---

 Troubleshooting

 Issue: Invalid MFA Code

Symptoms: User enters code but verification fails

Causes:
1. Device time not synchronized
2. Code expired (>30 seconds old)
3. Wrong secret in authenticator app
4. Database encryption key mismatch

Solutions:
1. Sync device clock with NTP
2. Try fresh code immediately after generation
3. Re-enroll in MFA if persistent
4. Verify MFA_ENCRYPTION_KEY matches across environments

 Issue: Trusted Device Not Working

Symptoms: User still prompted for MFA after checking "Remember"

Causes:
1. Cookies disabled in browser
2. Cookie expired
3. Device token not created
4. Different browser/incognito mode

Solutions:
1. Enable cookies in browser settings
2. Check cookie in browser dev tools
3. Review server logs for device creation
4. Use same browser/profile

 Issue: Email Notifications Not Sent

Symptoms: No email received for new trusted device

Causes:
1. RESEND_API_KEY not set
2. Invalid email address
3. Email in spam folder
4. Resend service error

Solutions:
1. Verify RESEND_API_KEY in environment variables
2. Check user email in database
3. Check spam/junk folder
4. Review Vercel function logs

 Issue: Backup Codes Don't Work

Symptoms: Backup code rejected during login

Causes:
1. Code already used
2. Incorrect code entered
3. Database encryption key mismatch
4. Typo in code

Solutions:
1. Try different unused backup code
2. Copy-paste code to avoid typos
3. Verify encryption key
4. Contact admin for MFA reset if all codes exhausted

---

 Maintenance Tasks

 Regular Tasks
- ? Review MFA enrollment rates monthly
- ? Monitor failed verification attempts
- ? Check cron job execution logs
- ? Audit trusted device usage
- ? Review email notification delivery

 Periodic Reviews
- ? Security audit quarterly
- ? Update dependencies
- ? Review and rotate encryption keys annually
- ? Test disaster recovery procedures
- ? Update documentation

 Database Maintenance
```sql
-- Check expired devices
SELECT COUNT() FROM "TrustedDevice" 
WHERE "expiresAt" < NOW() AND "isActive" = true;

-- Check user MFA enrollment
SELECT COUNT() as total,
       SUM(CASE WHEN "mfaEnabled" THEN 1 ELSE 0 END) as enrolled
FROM "User";

-- Check device distribution
SELECT "userId", COUNT() as device_count
FROM "TrustedDevice"
WHERE "isActive" = true
GROUP BY "userId"
ORDER BY device_count DESC;
```

---

 Appendix

 References
- [RFC 6238 - TOTP Specification](https://tools.ietf.org/html/rfc6238)
- [NIST SP 800-63B - Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

 Related Documentation
- `MFA_SECURITY_SUMMARY.md` - One-page overview
- `TRUSTED_DEVICES_IMPLEMENTATION.md` - Implementation details
- `TRUSTED_DEVICES_QUICK_START.md` - Quick setup guide
- `MFA_TESTING_GUIDE.md` - Testing procedures

 Change Log
| Date | Version | Changes |
|------|---------|---------|
| 2026-01-05 | 1.0 | Initial implementation with trusted device feature |



 4.2 Data separation controls

From `infor-m3-security-data-separation-one-pager.md`, the platform applies:

- company-scoped credential storage and retrieval
- per-company API access checks
- production controls and review checklists for integration changes


5. Company Configuration and Site Administration

Site Admin is the system control plane for company-level operational behavior.

 5.1 Core admin domains

Site Admin controls:

- accounting system connection configuration
- integration credentials and sync actions
- operational data mode (mock/real readiness controls)
- Operational Hub visibility and section-level customization
- DataRoom enablement and pricing
- default pricing and payment-related baselines

 5.2 Operational Hub customization model

Operational Hub configuration is stored in:

- `Company.userDefinedAllocations.operationalHub`

Primary substructures:

- `sections` -> report/tab visibility toggles
- `customReports` -> admin-defined report entries

 5.3 Tab categories and sector behavior

`TAB CATEGORIES` are sector-derived per company (`industrySectorCategory`).

Key behavior:

- selected categories render category containers
- standard report toggles are mapped by module data type
- company-specific and global custom report entries are appended in category containers

 5.4 New custom report scope model

From `OPERATIONAL_HUB_CUSTOM_REPORT_SELECTION_PROCESS.md`, Site Admin can create:

- Company-only custom report entries
- Global custom report entries (written to all companies at creation time)

Important:

- this creates configurable report metadata and toggles
- rendering actual new chart/table content still requires implementation in module UI/data logic

 Operational Hub Custom Report Selection Process

This document explains how the new report selection flow works in `Site Admin -> Operational Hub Customization`.

 Purpose

The feature allows a Site Admin to:

- create a new report entry
- assign it to a selected tab category
- choose scope as either:
  - Company only (only the current company), or
  - All companies (global) (applied to all companies at creation time)

It works alongside existing section toggles in Operational Hub customization.

 Where It Lives

In each company card inside Site Admin, under Operational Hub Customization:

- `TAB CATEGORIES` remains the master list of categories for that company sector.
- The add-report controls appear in the customization header:
  - New report name
  - Tab category selector
  - Scope selector (`Company only` or `All companies (global)`)
  - Add Report button

 Admin Workflow

1. Open the target company in Site Admin.
2. In Operational Hub Customization, enter a report name.
3. Select the tab category where the report should live.
4. Choose scope:
   - `Company only`: add to current company only
   - `All companies (global)`: add to all current companies
5. Click Add Report.
6. Use existing checkboxes to enable/disable visibility in that company�s configuration.
7. Click Save to persist section toggle state changes.

 How Scope Works

- Company only
  - The report metadata is added only to the selected company.

- All companies (global)
  - The same report metadata is written to all companies currently in the system.
  - The report label is shown with `(global)` in the customization list.

 Data Storage

Configuration is stored in:

- `Company.userDefinedAllocations.operationalHub`

New custom reports are stored in:

- `operationalHub.customReports[]`

Each custom report record includes:

- `id`
- `label`
- `tabKey`
- `dataType`
- `scope` (`company` or `global`)
- `createdAt`
- `createdByCompanyId`

Visibility toggles (including custom report toggles) are stored in:

- `operationalHub.sections`

Custom report toggle keys use:

- `customReport:<reportId>`

 Category and Toggle Rendering

- Tab categories are generated from the company sector profile.
- Each selected category renders its own container.
- Standard report toggles are derived from module-to-data-type mapping.
- Custom reports assigned to that category are appended as additional toggles.

 Important Notes

- Adding a custom report creates a configurable report entry; it does not automatically create chart/table rendering logic in `OperationsTab`.
- For a custom report to display real content in Operations, corresponding UI/data logic must be implemented.
- Current UI supports add behavior; there is no dedicated edit/delete management workflow yet.
- `global` scope is applied to companies present at creation time.



6. Accounting Integrations and Data Contracts

 6.1 Canonical contract strategy

From `OPERATIONS_PLAYBOOK_DATA_MATRIX.md`:

- Integrations map source payloads to shared canonical datasets.
- Dashboards should consume canonical contracts, not source-specific fields.
- Detail layers are additive by sector/use case.

Canonical operational datasets include:

- AR/AP aging snapshots
- customer/product snapshots
- inventory and cash snapshots
- optional detail tables for invoices/payments

 6.2 Infor security and operational onboarding

Infor controls emphasize:

- strict tenant/company isolation
- controlled onboarding checklist
- PR review checklist for integration modifications

 6.2.1 Infor async run safety controls

Current async queue behavior and recovery flow are documented in `SYNC_ARCHITECTURE.md`.

Operational safeguards:

- stale-progress timeout guard: `INFOR_SYNC_RUN_STALE_MINUTES` (default `30`)
- max runtime age guard: `INFOR_SYNC_RUN_MAX_AGE_HOURS` (default `8`)
- timeout guard failure transitions run state to `failed` (no indefinite `running`)
- pending/leased queue tasks are cancelled when a run is auto-failed by timeout

 6.3 QBD schema extension direction

From `QBD_PROJECT_SCHEMA_EXTENSION.md`:

- extends project-level keying for direct extraction
- adds source precedence, parser logic, and exception logging
- supports project-aware facts and future expanded joins

7.   Functional Areas: Design and Runtime Behavior

a)  Operations Hub

Operations is the cross-functional operating dashboard and is sector-aware.

Current design includes:

- category tabs derived from sector and layout config
- section-level visibility toggles (company override)
- fixture-first support for scaffolding where live ERP data is pending
- chart/table sections for AR, AP, Cash, Customers, Products, Inventory, Daily Financials

 7.2 Products and margin reporting

From `PRODUCT_MARGIN_WEEKLY_REPORTING_IMPLEMENTATION_PLAN.md`:

- weekly product margin model by item/site/customer
- net revenue/cost/margin logic with finance sign-off definitions
- EST schedule target:
  - weekly close Friday EOD EST
  - run Saturday 2:00 AM EST
  - publish by Saturday 8:00 AM EST
- reconciliation thresholds:
  - <0.5% acceptable
  - 0.5-1.0% warning
  - >1.0% investigate

 7.3 Daily Financials lane

From `DAILY_TRIAL_BALANCE_IMPLEMENTATION_MAP.md`:

- introduces a daily operational financial lane
- keeps core monthly statements unchanged during month
- supports controlled month-end publish into monthly financial records
- enforces separation between operational daily views and monthly canonical statement lane

8. DataRoom

From `DATAROOM_FUNCTIONAL_OVERVIEW.md` and validation checklist:

- secure diligence workspace with entitlement + permissions + scan-gate
- external invite flow and controlled user access
- audited view/download/assignment/permission events
- production validation checklist across access, lifecycle, controls, and regressions

 Corelytics DataRoom - Functional Overview

Corelytics DataRoom is a secure diligence workspace for company documents. It is designed for consultant-led transactions and internal company collaboration with strong access controls, scan gating, and auditable activity.

 Purpose

DataRoom provides a controlled place to:

- Organize diligence documents by folder and category
- Share access with internal and external users
- Enforce per-user and per-document permissions
- Protect downloads with scan and policy checks
- Maintain an immutable activity trail for compliance

 Access and Entitlement

DataRoom access is controlled by both entitlement and permissions:

- Entitlement layer
  - DataRoom must be enabled for the company
  - If pricing is `$0`, access is treated as free
  - If pricing is non-zero, active subscription is required
- Permission layer
  - Capabilities: `view`, `download`, `upload`, `share`, `manage`
  - Rules can be set at:
    - Default (user-wide)
    - Folder override
    - Document override

 Navigation Model

DataRoom is opened from the Company Dashboard DataRoom tab.

- This is the canonical entry point
- Payment and enablement checks run before opening
- If payment is required and inactive, checkout is shown instead of DataRoom

 Document Lifecycle

1. File uploaded to company documents storage
2. File assigned to a DataRoom folder
3. Scan state initialized (`pending_scan`)
4. Auto-scan trigger runs (plus manual `Scan Pending` support)
5. File transitions to:
   - `clean` (allowed)
   - `blocked` (quarantined)
   - `scan_failed` (retry/backoff path)

Only `clean` files can be viewed/downloaded.

 View vs Download

DataRoom supports distinct actions:

- View
  - Intended for preview behavior
  - Tracks view events in audit
- Download
  - Opens/downloads document through guarded delivery route
  - Enforces permission + scan state
  - Emits watermark header when configured
  - Tracks open/download events in audit

 Security Controls

Implemented controls include:

- Company scope checks (`companyId`) on DataRoom and document routes
- Capability checks for all critical actions
- Malware scan gate before file delivery
- Blocked/quarantined document handling
- Watermark metadata header support on delivery path
- Controlled invite flow for new external users

 External User Invite Flow

Manage Users supports inviting external users to company access:

- Existing account: access is granted immediately
- New email: invite token flow is issued
  - User creates credentials on accept page
  - Login and MFA apply per environment policy

 Audit Trail

DataRoom writes append-only audit events (stored under company allocations):

- Assignment/move/remove events
- View and blocked-view events
- Download/open and blocked-open events
- Scan completion events
- Permission update events

Audit includes user, action, timestamp, and context fields (document/folder, IP/user-agent where available).  
UI supports filtering, grouping by folder, pagination, and CSV export.

 Search in DataRoom

DataRoom includes document search that reuses the same backend AI document-search pipeline used elsewhere:

- Select a DataRoom document
- Ask a question
- Uses indexed chunks + retrieval
- Returns grounded short answer and cited bullets

 Admin Configuration

Site administration supports:

- Enable/disable DataRoom per company
- DataRoom pricing configuration (monthly/quarterly/annual)
- Default DataRoom pricing baselines
- Manage-user DataRoom permission editing

 Current Scope Notes

- Watermark rendering is currently header/policy level; full file-content watermark rendering can be extended later.
- Office preview behavior depends on viewer compatibility and storage URL accessibility.
- Production validation should follow `docs/DATAROOM_PROD_VALIDATION_CHECKLIST.md`.


9. Expert Analysis 

From `ANALYSIS_SECTION.md`:

- Overview (context + run controls)
- Focus Board (triage buckets)
- Trend Explorer
- Anomaly Inbox
- Opportunity Workspace

The section is AI-enabled but designed around controlled inputs and run workflows.

 Analysis Section (Performance Analytics)

This document corrects and clarifies the Analysis section. In the app navigation, Analysis refers to Performance Analytics, which is separate from Ask Corelytics and MD&A.

 What Analysis Includes

The Analysis section contains one context view plus four AI-enabled workspaces:

1. Overview (context and controls)
2. Focus Board (AI-enabled)
3. Trend Explorer (AI-enabled)
4. Anomaly Inbox (AI-enabled)
5. Opportunity Workspace (AI-enabled)

The four AI-enabled functions are Focus Board, Trend Explorer, Anomaly Inbox, and Opportunity Workspace.

 Overview (Context + Controls)

Use Overview to confirm inputs, scope, and data readiness before running AI agents.

- Industry group context used for benchmarks.
- Operational profile and suggested goal areas.
- Data range coverage for financials and operational datasets.
- Window selector to choose the analysis horizon (12/24/36 months).
- Run Performance Agents button to generate findings used across the AI views.

 Focus Board (AI-Enabled)

Focus Board is the executive triage view. It groups AI findings into action buckets:

- Fix Now
- Investigate
- Monitor
- Opportunities

Each card summarizes the metric, signal, and severity/priority so you can decide what to address first. It is designed for leadership review and weekly operating cadence.

 Trend Explorer (AI-Enabled)

Trend Explorer connects AI findings to the underlying financial time series.

- Displays key metric trends (revenue, margins, operating expenses, cash, AR, inventory).
- Includes benchmarks and goals where available.
- Provides narrative drivers that explain what is moving the trend and why.
- Helps validate AI findings with the raw data patterns.

 Anomaly Inbox (AI-Enabled)

Anomaly Inbox collects outlier signals for fast investigation.

- Filter by severity (high, medium, low).
- Each anomaly includes supporting evidence and a likely cause.
- Use Run Performance Agents to refresh anomalies as new data arrives.

 Opportunity Workspace (AI-Enabled)

Opportunity Workspace turns AI findings into an execution pipeline.

- Filter by objective (cash, margin, growth, risk).
- Filter by time to impact and owner.
- Track opportunity status from Discover ? Validate ? Plan ? Execute ? Realized.
- Evidence strength and impact ranges help prioritize the queue.

 Relationship to Ask Corelytics and MD&A

- Ask Corelytics is a separate navigation item with AI Q&A and period reviews.
- MD&A is a separate navigation item focused on narrative reporting.
- Analysis (Performance Analytics) is the AI operations layer for triage, trends, anomalies, and opportunities.
 


10. Ask Corelytics

From `ASK_CORELYTICS.md`:

- AI Q&A and period-review experience
- default categorized question sets per company
- company-level custom question persistence with reset-to-default fallback

 Ask Corelytics - Operational Description

 Purpose

This document explains how the Ask Corelytics section works operationally, with focus on the two AI search capabilities it uses:

1. Company/Market AI Search (Ask tab)
2. Document Semantic Search (RAG) (Search Documents tab)

It describes data flow, source selection, model behavior, grounding/citation controls, and operational guardrails.

---

 1) Ask Corelytics Runtime Architecture

Ask Corelytics UI is implemented in `app/components/AIAnalysisView.tsx` and calls two API routes:

- `POST /api/ai-analysis/ask` (for Ask + Search Documents modes)
- `POST /api/ai-analysis/period-review` (separate narrative review workflow)

Authentication and tenant boundary checks are enforced server-side before any AI processing:

- `requireAuth()`
- `validateCompanyAccess(companyId)`
- forbidden attempts are audited with `auditForbiddenAccess(...)`

---

 2) Capability A: Company/Market AI Search (Ask tab)

 What it does

Given a question, this capability builds a grounded answer using:

- internal company financial and operational context, and
- optional external web sources (when enabled and relevant).

 Trigger path

- UI tab: Ask
- API mode: `mode = "default"`
- Endpoint: `POST /api/ai-analysis/ask`

 Data context assembled by the API

The API builds a structured `internalSummary` payload including:

- monthly financial snapshot and prior-month deltas
- ratio/KPI snapshot with industry benchmark values (when available)
- recent daily operational trend summaries (cash, AR/AP patterns, customer concentration)
- data availability metadata and notes

This is the canonical context fed to the model for company-specific answers.

 Source strategy

The source set is selected based on question type and toggle behavior:

- Internal-only mode (default in many operational questions):
  - Data Review source
  - Operations source
- External web mode:
  - SerpApi results (Google organic results), bounded and filtered
- If a document is selected in UI (from shared request path), document source can be appended.

 External source selection logic

The route uses term heuristics to decide if external sources should be used:

- internal terms (KPI, margin, AR/AP, trend, goals, etc.)
- external terms (competitor, market, benchmark, regulatory, macro, etc.)

If external mode is requested but no sources are found, the route returns a clear 422 error.

 Model behavior

The route calls OpenAI via `createModelText(...)` with:

- a strict JSON output contract
- explicit requirement to cite only allowed URLs
- anti-hallucination constraints (no invented metrics/URLs/claims)
- compact retry mode if response truncates
- repair pass if response is malformed JSON

 Reliability controls

- citation allowlist validation (all bullet citations must match provided source URLs)
- strict retry if citation quality is invalid
- fallback synthesized answer from available sources when model output is invalid or truncated
- list-quality enforcement for "Top N" style questions

---

 3) Capability B: Document Semantic Search (RAG) (Search Documents tab)

 What it does

Given one selected company document and a question, this capability retrieves the most relevant chunks and generates a grounded answer with citations to the selected document only.

 Trigger path

- UI tab: Search Documents
- API mode: `mode = "document"`
- Endpoint: `POST /api/ai-analysis/ask` (same route, document branch)

 Document prerequisites

For selected document:

- extraction must be complete (`extractionStatus = DONE`)
- index must be usable (`indexStatus = DONE` or indexable on demand)

If index is missing, the route attempts indexing before retrieval.

 Indexing pipeline

Indexing is managed by `lib/company-documents/index-document.ts`:

1. sanitize extracted text
2. chunk text (`chunkDocumentText`) with overlap
3. generate embeddings (`embedTexts`)
4. store chunk text + vector in `CompanyDocumentChunk`
5. update document `indexStatus`, model, and vector dimensional metadata

 Retrieval pipeline (hybrid search)

Retrieval is implemented in `lib/company-documents/retrieve-chunks.ts` and uses a hybrid approach:

- keyword full-text ranking (`ts_rank_cd`)
- vector similarity (`pgvector <->`)
- query expansion for legal/contract phrasing
- anchor-term pass for section-style terminology
- score fusion (keyword + vector weighted score)
- neighbor-window expansion around top chunks to preserve clause continuity

Result: ranked and context-expanded chunk set for grounded generation.

 Generation constraints (document mode)

The model is constrained to:

- answer only from retrieved chunks
- cite only the selected document open URL
- avoid invented section numbers or unsupported claims
- return strict JSON structure

If citations are missing, the route auto-attaches document citation where appropriate.  
If answer quality is still weak, it falls back to excerpt-based grounded bullets.

---

 4) Shared Output Contract (Ask + Document modes)

Both modes return:

- `shortAnswer`
- `longAnswer`
- `citedBullets[]` (with citations per bullet)
- `howThisImpactsUs`
- `sources[]`

This response shape is stable and designed for deterministic rendering in the Ask Corelytics UI.

---

 5) Operational Guardrails

 Security and tenancy

- user must be authenticated
- company access validated per request
- forbidden requests are auditable

 Grounding and citation integrity

- model citations are restricted to an allowlist of route-provided sources
- invalid citations trigger strict retry/fallback logic

 Failure handling

- request timeout handling in UI (AbortController path)
- actionable API errors for missing company/question/document state
- document extraction/index readiness messaging

 Data-quality resilience

- if model response truncates or fails JSON parsing, route performs compact retry/repair
- if still invalid, route returns grounded fallback response from available source set

---

 6) Environment and Model Controls

Relevant settings:

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (default model)
- `OPENAI_MODEL_ASK` (optional Ask-mode override)
- `OPENAI_MODEL_DOCS` (optional Document-mode override)
- `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- `SERPAPI_API_KEY` (for external web source retrieval)

Operational recommendation:

- keep Ask and Document models configurable independently
- monitor latency and truncation rates per mode

---

 7) How the Two Agentic Search Capabilities Differ

 A) Company/Market AI Search

- Scope: enterprise financial/operational context + optional external market context
- Sources: internal app pages and/or SerpApi results
- Best for: KPI interpretation, trend questions, competitor/market context, action framing

 B) Document Semantic Search (RAG)

- Scope: one selected uploaded company document
- Sources: indexed document chunks only (hybrid keyword + vector retrieval)
- Best for: covenant extraction, clause lookup, document-grounded Q&A

Both are agentic in orchestration (selection, retrieval, synthesis, validation) but enforce grounded output and citation controls.

---

 8) Relationship to Period Review

Period Review is related but distinct:

- endpoint: `POST /api/ai-analysis/period-review`
- purpose: structured narrative period report (not ad-hoc search)
- inputs: monthly + daily internal signals, goals, benchmark context, optional external market sources
- includes explicit negative trend alert handling and opportunities section generation

---

 9) Current Limits and Next Enhancements

Current limits:

- custom report metadata and Ask capabilities are separate; Ask does not auto-ingest custom report definitions.
- document Q&A quality depends on extraction quality and chunking fidelity.
- external source availability depends on SerpApi results and query specificity.

High-value enhancements:

- add source confidence scoring in UI
- persist Ask query/response audit history by company
- add retrieval diagnostics panel (top chunks + scoring metadata) for admins
- add policy controls for allowed external domains by tenant
 

11. Company Pulse

Purpose

Company Pulse is the daily operating-risk triage layer for a selected company.  
It combines operational snapshots, unresolved critical findings, policy logic, and persisted lifecycle state so operators can quickly decide:

- what needs immediate attention,
- what can be monitored,
- who owns each item,
- and why each alert triggered.

---

1) Runtime Location and Entry Points

- Navigation label: `COMPANY PULSE`
- Route/view key: `daily-alerts`
- Main UI component: `app/components/operations/DailyAlertsView.tsx`
- Supporting APIs:
  - `GET/POST /api/pulse/alerts`
  - `PATCH /api/pulse/alerts/[id]`
  - `GET /api/pulse/alerts/[id]/events`

Primary UX structure:

- `Alerts` tab (triage + lifecycle actions)
- `Policy Settings` tab (sector defaults + company overrides + row-level Details)

---

2) Data Inputs and Source Contracts

Company Pulse composes alerts from live inputs, then syncs to persisted Pulse rows.

2.1 Operational and findings inputs

- `GET /api/operational-data` for:
  - AR aging (`type=ar-aging`)
  - AP aging (`type=ap-aging`)
  - Cash (`type=cash`)
- `GET /api/performance-analytics/findings?severity=critical`
- `GET /api/operational-goals?companyId=<id>` (includes Pulse policy overrides)
- `GET /api/companies?companyId=<id>` (industry sector category for policy defaults)

2.2 Policy configuration source

Policy definitions and defaults are in:

- `lib/company-pulse/policy.ts`

Effective policy resolution:

- global definition defaults
- sector patch defaults (based on `industrySectorCategory`)
- company overrides (`goals.__pulsePolicyOverrides`)

Result: each alert formula uses an active policy value, not a hardcoded threshold.

---

3) Alert Generation Model

Pulse builds three alert source types:

- `daily-change`: deterioration vs prior day
- `open-critical`: currently critical even without new deterioration
- `unresolved`: unresolved critical findings from analysis workflows

3.1 AR daily deterioration (policy-driven)

Core checks:

- AR >30-day ratio exceeds policy minimum
- day-over-day delta exceeds policy minimum
- materiality gate: any of top 5 customers by >30-day overdue amount exceeds `ar_daily_change.min_top_customer_overdue_amount`

Overdue definition for customer materiality:

- `days31to60 + days61to90 + days90plus` (strictly >30 days)

3.2 AP daily deterioration

Equivalent AP deterioration checks:

- overdue ratio threshold
- day-over-day delta threshold

3.3 Cash deterioration and open-critical cash

Cash signals include:

- total cash day-over-day deterioration
- account-level day-over-day deterioration
- open-critical cash condition (severe change and/or low runway)

Runway logic guardrail:

- sourced runway is preferred
- proxy runway is allowed only when `cash_open_critical.allow_proxy_runway = 1`
- when sourced runway is unavailable and proxy is disabled, Pulse emits a data-gap style signal (`Runway Signal Unavailable`) instead of guessing

3.4 Unresolved findings ingestion

Unresolved critical findings are mapped into Pulse alerts with drill links to analysis views.  
Resolved statuses are filtered (`resolved`, `realized`, `closed`, `done`, `complete`, `completed`).

---

4) Priority Scoring and Bucketing

Each generated alert receives a priority score and bucket:

- base score by source type (`open-critical` highest weight)
- recency and magnitude adjustments
- optional focus-term boost from `goals.__focusWatchlist`

Buckets:

- `attention` for high-priority alerts
- `monitoring` for lower-priority but still relevant alerts

The Alerts tab surfaces counts and grouped cards for both buckets.

---

5) Persisted Lifecycle and Audit Trail

Pulse now persists alert state and interaction history.

5.1 Persistence model

Primary tables:

- `PulseAlert` (current state)
- `PulseAlertEvent` (append-only event history)

Defined in:

- `lib/pulse-alerts.ts` (`ensurePulseAlertTables`, indexes, event insert helper)

5.2 Lifecycle states

Supported state set:

- `new`
- `acknowledged`
- `snoozed`
- `resolved`

5.3 User actions and transitions

Available actions in UI/API:

- acknowledge
- snooze (with `snoozedUntil`)
- resolve / reopen
- assign owner
- set due date
- add note

All transitions and operational updates emit events into `PulseAlertEvent` with actor identity and timestamp.

5.4 Sync behavior between computed and persisted alerts

On each load cycle:

- generated alert fingerprints are upserted into `PulseAlert`
- previously resolved alerts can be reopened automatically if the same fingerprint reappears
- alerts not present in the latest computed set are marked inactive (except resolved history rows retained for visibility/audit)

This preserves state across refresh/session while keeping signals current.

---

6) Explainability Model

Each Pulse alert carries an `explainability` payload and can be inspected from the `Why` action.

Explainability fields include:

- trigger name
- formula text
- threshold/policy used
- reason it triggered now
- policy source (sector default + company override context)
- source references and timestamps
- readiness status context (where applicable)

Operational intent:

- make every alert decision traceable to data + policy, not opaque scoring.

---

7) Data Readiness and Missing-Data Handling

Pulse exposes readiness gates to separate "no issue" from "insufficient source data."

Readiness statuses:

- `ready`
- `partial`
- `missing`

Current readiness coverage includes AR/AP/Cash snapshot sufficiency and runway source availability.  
A readiness summary chip is shown in Alerts with tooltip detail per source.

Design behavior:

- keep Pulse operational for available signals
- do not fabricate blocked metrics when source data is missing
- explicitly disclose gaps and reasons

---

8) Policy Settings UX and Governance

The `Policy Settings` tab provides:

- sector default column
- active value column
- per-row override toggle and editable value
- save/reset controls persisted through `operational-goals` storage
- per-policy `Details` popup with:
  - what it controls,
  - how Pulse evaluates it,
  - sensitivity guidance (higher vs lower),
  - example,
  - data caveats

This supports controlled tuning without code changes.

---

9) Security and Tenant Controls

Pulse APIs enforce:

- authenticated session requirement (`requireAuth`)
- company access check (`validateCompanyAccess(companyId)`)
- forbidden access auditing (`auditForbiddenAccess`)

All reads/writes are company-scoped.

---

10) Current Scope and Remaining Enhancements

Implemented in current runtime:

- policy-driven thresholds with sector defaults and company overrides
- persisted lifecycle with event history
- explainability panel
- readiness visibility and missing-data transparency
- proxy-runway hard guard via policy switch

Recommended next enhancements:

1. Notification routing (email/slack) for high-priority `attention` alerts.
2. Stronger owner model (`ownerUserId`) plus role-based transition controls.
3. Status filter chips (`new/acknowledged/snoozed/resolved`) in Alerts tab.
4. Backfill/replay controls to recompute affected signals when delayed line-level data arrives.


12. Ratios and Trend Analysis

From `RATIOS_AND_TRENDS.md`:

- ratio dashboards and formula-driven KPI tracking
- priority ratio selection (company-specific)
- monthly category ratio exports
- time-series trend exploration for major financial and expense categories
 Ratios and Trends

This document explains the Ratios and Trend Analysis pages, including their sub-tabs and what each one does.

 Ratios Page

The Ratios page provides KPI ratios derived from monthly COA data, with optional industry benchmarks. It has three sub-tabs:

 1) Ratio Graphs

This tab is a visual dashboard of ratio trends. It groups charts by category and plots each ratio over time:

- Liquidity: Current Ratio, Quick Ratio
- Activity: Inventory Turnover, Receivables Turnover, Payables Turnover, Days� Inventory, Days� Receivables, Days� Payables, Sales/Working Capital
- Coverage: Interest Coverage, Debt Service Coverage, Cash Flow to Debt
- Leverage: Debt/Net Worth, Fixed Assets/Net Worth, Leverage Ratio
- Operating: Total Asset Turnover, ROE, ROA, EBITDA Margin, EBIT Margin

Features:

- Each chart includes a benchmark line when available.
- Each chart includes a Formula button to view the calculation.
- Color-coded charts make category scanning easier.

 2) Priority Ratios

This tab lets users build a custom KPI list for a company.

What it does:

- Select up to 10 ratios from a categorized dropdown.
- Save selections per company (persisted in the browser).
- Remove ratios directly from the grid.
- Print the custom selection.

Best use: executive dashboards or board-level reporting.

 3) Monthly Ratios by Category

This tab shows a table-style view of ratios by month:

- Displays the last 12 months of values.
- Organized by the same ratio categories (Liquidity, Activity, Coverage, Leverage, Operating).
- Includes Export to Excel for offline analysis.

Best use: detailed review, month-over-month variance checks, and audit prep.

---

 Trend Analysis Page

Trend Analysis provides deeper time-series views outside of ratios. It has two sub-tabs:

 1) Item Trends

This tab allows you to select financial metrics and chart them over time.

Selectable metrics include:

- Revenue
- Gross Profit
- Total Operating Expenses
- EBIT / EBITDA / Net Income
- Cash
- Current Assets / Fixed Assets / Total Assets
- Accounts Payable / Long Term Debt / Total Equity

Features:

- Multi-select checkboxes (choose multiple metrics).
- Dynamic chart rendering with distinct colors for each metric.
- Useful for spotting growth, margin pressure, and balance sheet shifts.

 2) Expense Analysis

This tab focuses on expense-category trends from the master data store.

What it does:

- Pulls dynamic expense categories based on the company�s mapped COA.
- Adds Total Operating Expenses as a synthesized category.
- Charts category trends over time for expense management and benchmarking.

Best use: identify structural cost creep, variance drivers, and budget pressure.


13. Goals and Projections

From `GOALS_AND_PROJECTIONS.md`:

- goals:
  - expense goals (COA-driven)
  - operational goals (AR/AP/Cash/Inventory KPI targets)
- projections:
  - 12-month scenario outputs
  - Holt-Winters-driven forecast model with fallback method

14. Line of Business allocation

From `LOB_ALLOCATION_GUIDE.md`:

- supports account-to-target-field mapping with per-LOB percentage splits
- aggregates by LOB and field to produce breakdowns
- persists breakdown artifacts for downstream analysis

15. Valuation and recommendation modules

From value creation and SDE docs:

- deterministic-first facts and scoring remain canonical
- recommendation layer adds explainable action framing
- impact modeling includes EBITDA, working capital, and value-range logic
- guardrails require evidence linkage and human oversight for impactful actions

16.  Sector System and Reporting Logic

 8.1 Sector mapping strategy

From `SECTOR_MAPPING_SCHEMA_DRAFT.md`:

- sector-specific revenue/COGS mapping keys
- stable naming convention (`rev_`, `cogs_`)
- scoped category sets by NAICS group

 8.2 Sector playbook behavior

From `SECTOR_PLAYBOOK_LIBRARY.md`:

- playbooks drive priority, anomaly interpretation, and recommendation themes by sector
- normalized sector key selection with fallback behavior
- same analysis pipeline scales as additional metrics become available

 8.3 Sector-specific category rendering

Operational category lists and defaults are sector-driven, then overridden by company settings where needed.

17. Payments and Revenue Share Operations

From `USAEPAY_INTEGRATION.md`:

- recurring payment events flow into revenue tracking and payable calculations
- webhook-driven lifecycle handles success, failure, and refund paths
- consultant-linked vs direct-business revenue handling
- monthly payable generation workflow for consultant settlements

`PAYMENT_INTEGRATION_SUMMARY.txt` was provided as input but currently has no readable content in repository tooling.

 10) Operational Cadences and Runbooks

Recommended standing cadences:

- Daily
  - monitor integration sync status and error queues
  - review DataRoom scan failures and blocked files
- Weekly
  - review Operations anomalies and exception queues
  - validate report refresh and completeness
- Month-end
  - run controlled publish processes for monthly lanes
  - reconcile key finance outputs and review deltas

For product margins specifically, use the Saturday EST publish cadence defined above.

 11) Governance, Auditability, and Controls

The platform control model emphasizes:

- deterministic-first computation for financial truth
- explicit configuration ownership in Site Admin
- append-only or traceable operational event logs where applicable
- scoped tenant/company updates for sensitive configuration
- phased rollout patterns (deterministic baseline -> enhanced AI layers with guardrails)

 12) Known Limits and Current Gaps

- Custom report creation currently creates configuration/toggles; full report rendering still requires implementation in Operations UI/data layer.
- Global custom report scope applies to companies present at creation time.
- Dedicated edit/delete lifecycle for custom report metadata is not yet formalized.
- Two policy/security source documents are currently `.docx` and were not machine-readable during this compilation.

 13) Detailed Integrated Reference

This section intentionally captures implementation-level details from the source documents so this manual can function as the primary operational reference.

18. Technology and runtime details (`TECH_STACK.md`)

- Framework/runtime: Next.js 14 App Router on Node.js with TypeScript and React 18.
- API model: Next.js route handlers under `app/api`.
- Data model/runtime persistence:
  - Prisma ORM
  - PostgreSQL primary data store
  - SQLite used for some development tooling
- Auth/security libraries:
  - NextAuth.js
  - `bcryptjs` for password hashing
  - `speakeasy` + `qrcode` for TOTP MFA
- Visualization and UI:
  - Recharts
  - lucide-react
  - react-hot-toast
- Integrations and services:
  - QuickBooks (`intuit-oauth`)
  - Xero (`xero-node`)
  - Resend (email)
  - OpenAI SDK (AI features)
- Build/runtime notes:
  - `next build` plus Prisma generation
  - custom Node server (`server.js`) in addition to platform hosting patterns

19. MFA operating controls (`MFA_SECURITY_SUMMARY.md`, `MFA_CLIENT_OVERVIEW.md`)

Implementation profile:

- MFA method: TOTP (RFC 6238), 6-digit codes.
- Production and staging: MFA required.
- Development: can be paused via environment controls.

Trusted device behavior:

- Trust duration: 60 days.
- Max trusted devices per user: 5.
- Security controls:
  - encrypted trust tokens
  - secure cookie attributes (`httpOnly`, `Secure`, `SameSite`)
  - SHA-256 token hashing
- User controls:
  - device revocation
  - email notifications for newly trusted devices

Operational parameters:

- TOTP code validity: 30 seconds.
- Backup codes: 10 single-use codes per user.
- Device cleanup schedule: daily (3 AM UTC).

Environment/config controls:

- `MFA_ENCRYPTION_KEY`
- `MFA_TRUST_DURATION_DAYS`
- `MFA_MAX_TRUSTED_DEVICES_PER_USER`
- `DISABLE_MFA_DEV` (development only)

Support/admin operations:

- check failed MFA attempts and audit logs
- verify notification paths
- verify cleanup job
- MFA reset path for recovery edge cases

 13.3 Infor security and tenant separation details (`infor-m3-security-data-separation-one-pager.md`)

Required production controls:

- use per-company credentials from `AccountingConnection.connectionMetadata`
- disable env credential fallback in production (`INFOR_M3_ALLOW_ENV_FALLBACK=false`)
- forbid shared `INFOR_M3_` runtime credentials in production
- enforce company authorization on every Infor route

Built-in controls:

- production hard-block for fallback behavior
- deploy-time security gate (`scripts/check-deploy-block.js`)
- centralized policy checks in `lib/infor-m3/security-config.ts`
- regression test script: `npm run test:infor-security`

Onboarding sequence:

1. create company and assign authorized users
2. set accounting system to Infor
3. connect credentials
4. verify status/test-token/probe endpoints
5. validate unauthorized access is denied
6. enable sync only after mapping/reconciliation sign-off

20. QuickBooks Desktop project schema details (`QBD_PROJECT_SCHEMA_EXTENSION.md`)

Problem solved:

- project codes such as `NN-NNN` and `NN-NNN-NN` need to become first-class operational keys.

Canonical project key fields:

- `projectCodeRaw`
- `customerSegment` (2-digit)
- `projectSegment` (3-digit)
- `subtypeSegment` (2-digit, optional)
- `codeSchemaVersion`
- `parseStatus` (`OK`, `WARNING`, `FAILED`)
- `parseReason`

Source precedence:

1. explicit extractor field
2. PO-like source
3. job/full-name parse
4. memo/reference parse

Persistence and control model:

- project master entity
- parse/exception log entity
- optional fact-link entity
- payload extension supports optional project fields without breaking compatibility
- parse exceptions are logged; ingestion is non-blocking

21. Canonical operations data contract details (`OPERATIONS_PLAYBOOK_DATA_MATRIX.md`)

Shared canonical datasets:

- `CustomerSalesSnapshot`
- `ARAgingSnapshot`
- `AROpenInvoiceSnapshot` (detail extension)
- `ARPaymentFact` (detail extension)
- `APAgingSnapshot`
- `ProductSalesSnapshot`
- `InventorySnapshot`
- `CashSnapshot`

Contract examples:

- AR/AP summary buckets: `current`, `days1to30`, `days31to60`, `days61to90`, `days90plus`
- Product performance: `itemId`, `itemName`, `quantitySold`, `revenue`, `cogs`
- Inventory: `qtyOnHand`, `assetValue`, `avgCost`

Adapter rule:

- source adapters map into canonical contracts
- dashboard/playbook logic must consume canonical fields, not source-specific fields

22. DataRoom design and production validation detail (`DATAROOM_FUNCTIONAL_OVERVIEW.md`, `DATAROOM_PROD_VALIDATION_CHECKLIST.md`)

Lifecycle model:

1. upload file
2. assign to folder
3. set scan state (`pending_scan`)
4. auto/manual scan trigger
5. transition to `clean`, `blocked`, or `scan_failed`

Access model:

- entitlement gate (enablement + subscription)
- permission/capability gate
- folder and document-level overrides

Open/download controls:

- only `clean` files can be opened/downloaded
- blocked states return controlled user-facing outcomes
- watermark metadata headers supported on delivery path

Operational validation domains:

- entitlement and navigation checks
- role/capability enforcement
- upload/assignment/scan lifecycle
- blocked/pending/failure behavior on document open
- external invite acceptance/rejection paths
- audit event completeness and export verification

 13.7 Ratios and trends details (`RATIOS_AND_TRENDS.md`)

Ratios page:

- Ratio Graphs: category trend charts with benchmark overlays and formula references
- Priority Ratios: user-selected set (up to 10), company-specific persistence
- Monthly Ratios by Category: last 12 months with export capability

Trend Analysis page:

- Item Trends: multi-metric time-series overlays
- Expense Analysis: mapped expense category trends plus synthesized total operating expense


23. Sector mapping and playbook details (`SECTOR_MAPPING_SCHEMA_DRAFT.md`, `SECTOR_PLAYBOOK_LIBRARY.md`)

Sector mapping schema:

- revenue key standard: `rev_<snake_case>`
- COGS key standard: `cogs_<snake_case>`
- stable key naming with editable labels

Sector playbook model includes:

- focus priorities by sector
- anomaly interpretation context
- recommendation themes and ownership hints
- normalized key selection with fallback behavior

Operational impact:

- sector drives default categories and analysis emphasis
- company-level overrides can refine visibility and behavior

 Sector Playbook Library � Design

This document defines the sector playbook library used to focus Performance Analytics (Focus Board, Trend Explorer, Anomaly Inbox, and future recommendations) by company sector. Playbooks ensure analysis and recommendations are sector-appropriate and scale as COA and operational data expand (e.g. from ERP).

---

b) Purpose

- Tie analysis to company sector: Use the company�s `industrySectorCategory` to select one of 11 standard operational flavors (plus DEFAULT when sector is unset).
- Focus the agent: Prioritize which COA categories and ops metrics to analyze, how to triage (Fix now / Investigate / Monitor / Opportunities), and how to interpret anomalies and trends.
- Support recommendations: Provide sector-specific opportunity themes so COA + ops findings can be turned into actionable recommendations (title, family, when they apply, objective, owner).
- Scale with data: Playbooks define what to care about and how to interpret; the set of series analyzed comes from actual data. As ERP adds more COA lines and ops metrics, the same pipeline runs with the playbook guiding priority and narrative.

---

c) Schema: Sector Playbook

Each playbook is a structured object keyed by sector (same keys as `lib/performance-analytics/ops-metric-profiles.ts`).

 2.1 Type definitions (conceptual)

```ts
// Sector key: same as ops profile (e.g. AGRICULTURE, RETAIL_TRADE, DEFAULT).
type SectorKey = string;

// Focus bucket for triage.
type FocusBucket = 'fix_now' | 'investigate' | 'monitor' | 'opportunities';

// COA category hints: which P&L / balance sheet areas to emphasize for this sector.
type COACategoryHint =
  | 'revenue'
  | 'cogs'
  | 'labor'
  | 'materials'
  | 'overhead'
  | 'working_capital'
  | 'ar_ap'
  | 'inventory'
  | 'project_costs'
  | 'claims_losses'
  | 'interest_margin'
  | 'other';

// One focus priority: what to look at and which bucket it maps to when severe.
type FocusPriority = {
  coaCategory?: COACategoryHint;           // optional COA emphasis
  opsCategory?: OpsMetricCategory;        // optional ops group (from ops profile)
  metricHint?: string;                     // e.g. "job margin", "inventory turns"
  whenSevere: FocusBucket;                 // bucket when signal is severe
  whenModerate: FocusBucket;               // bucket when signal is moderate
  rank: number;                            // 1 = highest priority for this sector
};

// Anomaly context: how to interpret anomalies in this sector.
type AnomalyContext = {
  seasonalityNote?: string;               // e.g. "Strong Q4 peak; harvest-driven spikes in Q3"
  typicalVarianceNote?: string;           // e.g. "Month-over-month �15% common on job completions"
  highSeverityTriggers?: string[];        // metric/pattern names that should elevate severity
  narrativeTemplates?: Record<string, string>; // optional: metric key -> "likely cause" template
};

// One recommendation theme: standard opportunity type for this sector.
type RecommendationTheme = {
  id: string;                              // stable id, e.g. "retail_markdown_optimization"
  title: string;                           // display title
  family: string;                          // e.g. "Pricing & merchandising"
  whenCondition: string;                   // when to suggest (e.g. "margin pressure + high inventory")
  objective: 'cash' | 'margin' | 'growth' | 'risk';
  suggestedOwner?: 'Sales' | 'Ops' | 'Finance' | 'Marketing' | 'General';
  coaRelevant?: COACategoryHint[];        // COA areas that support this theme
  opsRelevant?: string[];                  // ops metric hints that support this theme
};

// Full playbook for one sector.
type SectorPlaybook = {
  sector: SectorKey;
  label: string;                           // display name (can match ops profile label)
  opsProfileRef: SectorKey;               // key into getOpsMetricProfile(); usually same as sector

  focusPriorities: FocusPriority[];
  anomalyContext: AnomalyContext;
  recommendationThemes: RecommendationTheme[];
};
```

 2.2 Selection and fallback

- Selection: Use `Company.industrySectorCategory` (normalized: trim, uppercase, spaces/dashes ? underscore). Look up playbook by that key.
- Fallback: If no playbook for key, use `DEFAULT` playbook. If sector is null/empty, use `DEFAULT`.
- Ops profile: Continue using `getOpsMetricProfile(industrySectorCategory)` for metric groups and suggested goals; playbook references the same sector key via `opsProfileRef`.

---

d)  How the playbook is used

| Consumer | Use of playbook |
|----------|------------------|
| Run (performance-analytics/run) | Load playbook by `industrySectorCategory`. Use `focusPriorities` to rank and bucket findings (Fix now / Investigate / Monitor / Opportunities). Use `anomalyContext` to set severity and narrative for anomaly findings. Use `recommendationThemes` (later) to generate sector-appropriate opportunity/recommendation findings from COA + ops. |
| Focus Board | Display findings already bucketed by run; playbook influenced which series were prioritized and how they were scored. |
| Trend Explorer | Emphasize trends for COA categories and ops groups in `focusPriorities`; label drivers using `metricHint` and ops profile. |
| Anomaly Inbox | Anomalies generated with sector context: severity from `highSeverityTriggers`, narrative from `anomalyContext`. COA and ops series both run through anomaly; playbook defines which categories to scan first and how to describe. |
| Recommendation layer (future) | Map findings to `recommendationThemes` by sector; generate concrete recommendations (title, rationale, evidence, owner) from COA/ops data. |

Data expansion: When new COA lines or ops metrics appear (e.g. ERP), the run still uses the same playbook. New series are analyzed with the same logic; playbook determines priority (which series to surface first) and interpretation (narrative, severity, recommendation family). No need to enumerate every possible GL or ops field in the playbook.

---

e) Playbook content by sector

Below: for each of the 11 sectors plus DEFAULT, outline of focus priorities, anomaly context, and recommendation themes. Implementation can store these as JSON/TS constants keyed by sector.

---

DEFAULT (General Operations)

Use when: `industrySectorCategory` is missing or does not match any sector key.

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Revenue, orders | fix_now | investigate |
| 2 | Gross margin %, unit economics | fix_now | monitor |
| 3 | AR days, inventory days, working capital | investigate | monitor |
| 4 | Cycle time, on-time %, fulfillment | investigate | monitor |
| 5 | Churn, repeat rate, customer | monitor | opportunities |

Anomaly context

- Seasonality: Generic; no sector-specific pattern.
- Typical variance: Revenue and margin often �10�20% MoM for small businesses.
- High severity: Large single-period revenue drop, margin collapse, or cash/AR spike.
- Narrative: Neutral (�Variance in [metric] relative to recent history.�).

Recommendation themes

- Improve collections and terms to reduce DSO (working_capital; cash; Finance).
- Optimize inventory and payables to free cash (working_capital; cash; Ops).
- Strengthen unit economics and contribution per order (unitEconomics; margin; Ops).
- Improve on-time delivery and cycle time (fulfillment; growth; Ops).
- Reduce churn and improve retention (customer; growth; Sales/Marketing).

---

AGRICULTURE

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Yield per acre, price per unit, orders | fix_now | investigate |
| 2 | Input cost per unit, capacity utilization (supply) | fix_now | investigate |
| 3 | Shrink %, defect % (quality) | investigate | monitor |
| 4 | Inventory days, cash conversion | investigate | monitor |
| 5 | COGS, materials, labor | monitor | opportunities |

Anomaly context

- Seasonality: Harvest and planting cycles; quarterly yield and price spikes are common.
- Typical variance: Yield and price can swing �20%+ by season; input costs volatile.
- High severity: Collapse in yield or price, or sharp input-cost spike vs prior period.
- Narrative: Use �yield,� �price,� �input cost,� �shrink� in likely-cause text.

Recommendation themes

- Improve yield per acre and input efficiency (supply, demand; margin; Ops).
- Reduce shrink and defect rates (quality; margin; Ops).
- Shorten cash conversion cycle and inventory days (working_capital; cash; Finance).
- Lock in price or hedge input costs when volatility is high (revenue, cogs; risk; Finance).
- Optimize capacity utilization and seasonal planning (supply, capacity; margin; Ops).

---

f) MINING

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Throughput, downtime %, utilization % | fix_now | investigate |
| 2 | Cost per ton, margin per ton | fix_now | investigate |
| 3 | Grade variance, recovery rate (quality) | investigate | monitor |
| 4 | Planned vs unplanned outages (capacity) | investigate | monitor |
| 5 | COGS, labor, materials | monitor | opportunities |

Anomaly context

- Seasonality: Weather and maintenance windows; quarterly production swings possible.
- Typical variance: Throughput and cost per ton can move �15% with outages or grade mix.
- High severity: Sustained downtime spike, cost per ton jump, or recovery rate drop.
- Narrative: Use �throughput,� �downtime,� �cost per ton,� �recovery rate.�

Recommendation themes

- Reduce unplanned downtime and improve utilization (capacity, supply; margin; Ops).
- Lower cost per ton through throughput and efficiency (unitEconomics; margin; Ops).
- Improve recovery rate and grade consistency (quality; margin; Ops).
- Optimize maintenance and outage planning (capacity; risk; Ops).
- Align labor and materials to production plans (project_costs, cogs; cash; Finance).

---

UTILITIES

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Uptime %, outage frequency, response time | fix_now | investigate |
| 2 | Cost per kWh, loss % | fix_now | investigate |
| 3 | Load factor, peak vs off-peak (capacity) | investigate | monitor |
| 4 | Revenue, regulatory/rate context | monitor | opportunities |
| 5 | O&M, capital-related costs | monitor | opportunities |

Anomaly context

- Seasonality: Peak demand (summer/winter); planned outages often in shoulder seasons.
- Typical variance: Load and cost per unit can vary �10�15% by season.
- High severity: Major outage spike, safety/reliability event, or regulatory exposure.
- Narrative: Use �uptime,� �outage,� �loss %,� �load factor.�

Recommendation themes

- Improve uptime and reduce outage frequency (service; risk; Ops).
- Reduce technical and commercial loss % (unitEconomics; margin; Ops).
- Optimize load factor and peak/off-peak mix (capacity; margin; Ops).
- Manage O&M and capital to support reliability (overhead, project_costs; risk; Finance).
- Align rates and revenue to cost and load (revenue; margin; Finance).

---

CONSTRUCTION

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Schedule variance, change orders % | fix_now | investigate |
| 2 | Job margin, labor productivity | fix_now | investigate |
| 3 | Backlog, bid win rate | investigate | monitor |
| 4 | WIP aging, retention receivable | investigate | monitor |
| 5 | Labor, materials, subcontractors (COA) | monitor | opportunities |

Anomaly context

- Seasonality: Weather and project phasing; backlog and completions lumpy by quarter.
- Typical variance: Job margin and schedule often �10�15% by job; change orders can spike.
- High severity: Large schedule slip, margin erosion on a job, or retention/AR stretch.
- Narrative: Use �schedule variance,� �change orders,� �job margin,� �WIP,� �retention.�

Recommendation themes

- Reduce schedule variance and improve project execution (fulfillment; margin; Ops).
- Control change orders and scope creep (fulfillment; margin; Ops).
- Improve job margin and labor productivity (unitEconomics; margin; Ops).
- Tighten WIP and retention collection (working_capital; cash; Finance).
- Strengthen bid win rate and backlog quality (demand; growth; Sales).

---

WHOLESALE_TRADE

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Fill rate, order volume | fix_now | investigate |
| 2 | Gross margin %, freight cost % | fix_now | investigate |
| 3 | Inventory turns, AR days | investigate | monitor |
| 4 | Cycle time, returns % | investigate | monitor |
| 5 | COGS, fulfillment costs | monitor | opportunities |

Anomaly context

- Seasonality: Demand peaks by product/season; inventory and fill rate swing.
- Typical variance: Fill rate and margin often �5�10%; inventory turns by category.
- High severity: Fill rate drop, margin compression, or inventory/AR blowout.
- Narrative: Use �fill rate,� �inventory turns,� �freight,� �returns.�

Recommendation themes

- Improve fill rate and order fulfillment (fulfillment, demand; growth; Ops).
- Optimize inventory turns and working capital (working_capital; cash; Ops/Finance).
- Reduce freight cost % and improve margin (unitEconomics; margin; Ops).
- Lower returns % and cycle time (fulfillment; margin; Ops).
- Tighten AR and payment terms (ar_ap; cash; Finance).

---

RETAIL_TRADE

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Conversion %, traffic, basket size | fix_now | investigate |
| 2 | Stockout %, return rate | fix_now | investigate |
| 3 | Gross margin %, promo lift | investigate | monitor |
| 4 | Inventory turns, sell-through % | investigate | monitor |
| 5 | Revenue by category, markdowns | monitor | opportunities |

Anomaly context

- Seasonality: Holiday and back-to-school peaks; category-specific seasonality.
- Typical variance: Conversion and traffic can move �10�15%; margin with promo mix.
- High severity: Conversion collapse, stockout spike, or margin erosion.
- Narrative: Use �conversion,� �stockout,� �sell-through,� �promo,� �markdown.�

Recommendation themes

- Reduce stockouts and improve conversion (fulfillment, demand; growth; Ops).
- Optimize markdown and promo effectiveness (unitEconomics; margin; Marketing).
- Improve inventory turns and sell-through (working_capital; cash; Ops).
- Increase basket size and traffic (demand; growth; Marketing/Sales).
- Reduce return rate and improve margin (fulfillment, unitEconomics; margin; Ops).

---

TRANSPORTATION

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | On-time %, cycle time | fix_now | investigate |
| 2 | Utilization %, load factor | fix_now | investigate |
| 3 | Cost per mile, margin per load | investigate | monitor |
| 4 | Damage rate, claims % | investigate | monitor |
| 5 | Fuel, labor, maintenance (COA) | monitor | opportunities |

Anomaly context

- Seasonality: Peak shipping periods; weather and demand cause utilization swings.
- Typical variance: On-time and utilization often �5�10%; cost per mile with fuel.
- High severity: On-time drop, claims spike, or margin collapse per load.
- Narrative: Use �on-time,� �utilization,� �cost per mile,� �claims,� �damage.�

Recommendation themes

- Improve on-time delivery and cycle time (fulfillment; growth; Ops).
- Increase utilization and load factor (capacity; margin; Ops).
- Reduce cost per mile and improve margin per load (unitEconomics; margin; Ops).
- Lower damage and claims (quality; risk; Ops).
- Optimize fuel, labor, and maintenance (cogs, overhead; margin; Ops/Finance).

---
INFORMATION (e.g. SaaS, software, media)

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Churn, retention, NPS | fix_now | investigate |
| 2 | Trial starts, activation % | fix_now | investigate |
| 3 | ARPU, gross margin % | investigate | monitor |
| 4 | Uptime %, latency | investigate | monitor |
| 5 | Revenue, S&M efficiency (COA) | monitor | opportunities |

Anomaly context

- Seasonality: Quarter-end and renewal waves; trial and activation can spike with campaigns.
- Typical variance: Churn and ARPU often reported monthly; �5�10% common.
- High severity: Churn spike, activation drop, or significant outage.
- Narrative: Use �churn,� �activation,� �ARPU,� �uptime,� �latency.�

Recommendation themes

- Reduce churn and improve retention (customer; growth; Ops/Sales).
- Improve activation and trial-to-paid (demand; growth; Marketing).
- Increase ARPU and expansion revenue (unitEconomics; growth; Sales).
- Maintain uptime and reduce latency (service; risk; Ops).
- Improve gross margin and unit economics (unitEconomics; margin; Finance).

---
FINANCE_INSURANCE

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Loss ratio, default rate | fix_now | investigate |
| 2 | Net interest margin, fee income % | fix_now | investigate |
| 3 | Policy growth, loan originations | investigate | monitor |
| 4 | Cash runway, capital adequacy | investigate | monitor |
| 5 | Reserves, claims, interest (COA) | monitor | opportunities |

Anomaly context

- Seasonality: Reporting and underwriting cycles; loss and default can lag.
- Typical variance: Loss ratio and NIM often �3�5%; originations by quarter.
- High severity: Loss ratio or default rate spike, or capital/regulatory concern.
- Narrative: Use �loss ratio,� �default rate,� �NIM,� �capital adequacy.�

Recommendation themes

- Improve loss ratio and underwriting (quality; margin; Ops).
- Reduce default rate and credit risk (quality; risk; Finance).
- Protect or improve net interest margin and fee income (unitEconomics; margin; Finance).
- Maintain capital adequacy and cash runway (working_capital; risk; Finance).
- Grow policy/loan volume with discipline (demand; growth; Sales).

---

REAL_ESTATE

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Occupancy %, lease renewal % | fix_now | investigate |
| 2 | NOI margin, rent per unit | fix_now | investigate |
| 3 | Turnover time, maintenance cycle time | investigate | monitor |
| 4 | Rent collection days, arrears % | investigate | monitor |
| 5 | Revenue, operating expenses (COA) | monitor | opportunities |

Anomaly context

- Seasonality: Lease expirations and turnover by quarter; occupancy can step-change.
- Typical variance: Occupancy and NOI often stable; arrears and turnover can spike.
- High severity: Occupancy drop, NOI compression, or arrears spike.
- Narrative: Use �occupancy,� �NOI,� �turnover,� �arrears,� �rent collection.�

Recommendation themes

- Improve occupancy and lease renewal (demand; growth; Sales/Ops).
- Protect NOI margin and rent per unit (unitEconomics; margin; Ops).
- Reduce turnover time and maintenance cycle (fulfillment; margin; Ops).
- Tighten rent collection and reduce arrears (working_capital; cash; Finance).
- Optimize operating expenses vs revenue (overhead; margin; Ops/Finance).

---

 PROFESSIONAL_SERVICES

Focus priorities

| Rank | COA / Ops emphasis | When severe | When moderate |
|------|--------------------|-------------|----------------|
| 1 | Utilization %, realization % | fix_now | investigate |
| 2 | Project margin, billable rate | fix_now | investigate |
| 3 | Pipeline, win rate | investigate | monitor |
| 4 | Repeat rate, NPS | investigate | monitor |
| 5 | Labor, subcontractors, revenue (COA) | monitor | opportunities |

Anomaly context

- Seasonality: Quarter-end and project milestones; utilization and pipeline lumpy.
- Typical variance: Utilization and realization often �5�10%; project margin by engagement.
- High severity: Utilization drop, realization erosion, or pipeline gap.
- Narrative: Use �utilization,� �realization,� �project margin,� �win rate.�

Recommendation themes

- Improve utilization and billable capacity (capacity; margin; Ops).
- Increase realization and project margin (unitEconomics; margin; Ops).
- Strengthen pipeline and win rate (demand; growth; Sales).
- Improve repeat rate and NPS (customer; growth; Ops/Sales).
- Align labor and subcontractor cost to revenue (labor, project_costs; margin; Finance).

---

g) Implementation notes

- Storage: Implement playbooks as a constant map (e.g. `SECTOR_PLAYBOOKS: Record<string, SectorPlaybook>`) in code or as JSON loaded at runtime. Keys must match normalized `industrySectorCategory` (see `getOpsMetricProfile`).
- Run integration: In `performance-analytics/run`, after resolving `industrySectorCategory` and `opsProfile`, load the sector playbook. Use `focusPriorities` when scoring and bucketing focus/driver/trend findings; use `anomalyContext` when generating anomaly findings (severity, narrative); use `recommendationThemes` when generating or enriching opportunity/recommendation findings.
- COA coverage: Ensure run (or a dedicated COA analyzer) produces series for material COA categories (revenue, cogs, labor, etc.) and runs anomaly/focus logic on them; playbook�s `focusPriorities` and `coaCategory` hints determine which categories to emphasize per sector.
- Ops coverage: Use existing `getOpsMetricProfile(sector)` for metric names; playbook adds triage and anomaly/recommendation context. As new ops metrics are added (e.g. from ERP), include them in the relevant ops profile; playbook themes stay at category/family level.
- Future recommendation layer: When turning findings into actionable recommendations, match findings to `recommendationThemes` by sector, attach evidence (COA/ops series), and output title, rationale, suggested owner, and objective (cash/margin/growth/risk) for Opportunity Workspace.

---

h) Summary

| Item | Description |
|------|--------------|
| Schema | `SectorPlaybook`: sector, label, opsProfileRef, focusPriorities, anomalyContext, recommendationThemes. |
| Selection | From `Company.industrySectorCategory` (normalized); fallback `DEFAULT`. |
| Sectors | 11 sector playbooks (AGRICULTURE � PROFESSIONAL_SERVICES) + DEFAULT. |
| Use | Run uses playbook for focus bucketing, anomaly narrative/severity, and (later) recommendation themes; Focus Board, Trend Explorer, and Anomaly Inbox consume run output; design supports thorough COA + ops review and scales with expanded ERP

24. Product margin weekly operating detail (`PRODUCT_MARGIN_WEEKLY_REPORTING_IMPLEMENTATION_PLAN.md`)

Finance-approved v1 logic:

- revenue from `ExtPrice` net of line discounts
- excluded from revenue/margin:
  - taxes
  - freight (tracked separately)
  - misc charges (tracked as other revenue)
- COGS precedence:
  1. invoice line cost
  2. `QtyInvoiced  UnitCost` fallback
- returns/credits included in net view as negative revenue/COGS
- margin percentage is null when revenue is zero

Cadence and SLA (EST):

- weekly close: Friday EOD
- run start: Saturday 2:00 AM
- publish by: Saturday 8:00 AM

Control thresholds:

- `<0.5%` acceptable
- `0.5%-1.0%` warning
- `>1.0%` investigate

 13.13 Daily trial balance lane detail (`DAILY_TRIAL_BALANCE_IMPLEMENTATION_MAP.md`)

Separation model:

- daily operational lane feeds Operations tab
- monthly core statement lane remains controlled and unchanged until publish

Target entities/processes:

- daily snapshots
- import run metadata
- month publish metadata

Publish logic:

- P&L monthly fields aggregated from daily rows
- BS monthly fields taken from last available day in month
- republish should remain deterministic

 



25. Payment and revenue-share operations (`USAEPAY_INTEGRATION.md`)

Webhook lifecycle coverage:

- approved recurring payments
- declined payments
- refunds and voids

Operational output model:

- payment transaction records
- revenue records (consultant-linked or direct business)
- monthly consultant payable generation and payment tracking

Configuration and security controls:

- API credentials and sandbox flag in environment
- webhook secret verification recommended in production
- operational troubleshooting paths for delivery/signature/recording failures

 13.17 Unreadable/blocked source inputs

The following requested files could not be ingested by current tooling:

- `docs/SECURITY_FOR_STAKEHOLDERS.docx`
- `docs/Privacy_Policy.docx`
- `PAYMENT_INTEGRATION_SUMMARY.txt` (no readable content detected by the executor)

Convert/export these to markdown or plain text to fully integrate their exact detail into this manual.

 14) Source Document Index

This manual was synthesized from:

- `docs/TECH_STACK.md`
- `docs/MFA_SECURITY_SUMMARY.md`
- `docs/MFA_CLIENT_OVERVIEW.md`
- `docs/infor-m3-security-data-separation-one-pager.md`
- `docs/QBD_PROJECT_SCHEMA_EXTENSION.md`
- `docs/OPERATIONS_PLAYBOOK_DATA_MATRIX.md`
- `docs/DATAROOM_PROD_VALIDATION_CHECKLIST.md`
- `docs/RATIOS_AND_TRENDS.md`
- `docs/DATAROOM_FUNCTIONAL_OVERVIEW.md`
- `docs/ASK_CORELYTICS.md`
- `docs/ANALYSIS_SECTION.md`
- `LOB_ALLOCATION_GUIDE.md`
- `docs/GOALS_AND_PROJECTIONS.md`
- `docs/SECTOR_PLAYBOOK_LIBRARY.md`
- `docs/SECTOR_MAPPING_SCHEMA_DRAFT.md`
- `docs/PRODUCT_MARGIN_WEEKLY_REPORTING_IMPLEMENTATION_PLAN.md`
- `docs/DAILY_TRIAL_BALANCE_IMPLEMENTATION_MAP.md`
- `docs/OPERATIONAL_HUB_CUSTOM_REPORT_SELECTION_PROCESS.md`
- `docs/VALUE_CREATION_RECOMMENDATIONS_PRD.md`
- `docs/SDE_EXEC_SUMMARY_AND_RECOMMENDATIONS_IMPLEMENTATION_MAP.md`
- `docs/SDE_AGENTIC_AI_GUARDRAILS.md`
- `USAEPAY_INTEGRATION.md`
- `docs/OPERATIONAL_MANUAL_EXECUTIVE_SUMMARY.md`
- `docs/OPERATIONAL_MANUAL_RUNBOOK_APPENDIX.md`
- `docs/OPERATIONAL_MANUAL_APPENDIX_ENTERPRISE_CONTROLS.md`

Additional requested but not machine-readable in current tooling:

- `docs/SECURITY_FOR_STAKEHOLDERS.docx`
- `docs/Privacy_Policy.docx`
- `PAYMENT_INTEGRATION_SUMMARY.txt` (no readable content via current read path)

