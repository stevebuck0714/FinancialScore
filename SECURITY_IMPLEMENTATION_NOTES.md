# Security Implementation Notes

## CRITICAL: Required Environment Variables

The application now requires **mandatory encryption keys** with NO fallbacks. These MUST be configured before the application can run in production.

### Generate Encryption Keys

```bash
# Generate OAuth encryption key (for QuickBooks tokens)
openssl rand -hex 32

# Generate MFA encryption key (for MFA secrets and backup codes)
openssl rand -hex 32

# Generate NextAuth secret
openssl rand -base64 32
```

### Required Environment Variables

Add these to your `.env` file and Vercel environment variables:

```bash
# Authentication (required)
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="https://your-domain.com"

# Encryption Keys (required - NO DEFAULTS)
OAUTH_ENCRYPTION_KEY="64-character-hex-string-here"
MFA_ENCRYPTION_KEY="64-character-hex-string-here"

# Database (required)
DATABASE_URL="postgresql://..."

# Payment Processing (required for payments)
USAEPAY_API_KEY="your-usaepay-key"
USAEPAY_PIN="your-usaepay-pin"
USAEPAY_SOURCE_KEY="your-source-key"
USAEPAY_SANDBOX="true"  # Set to false in production

# QuickBooks Integration (required for QB sync)
QUICKBOOKS_CLIENT_ID="your-qb-client-id"
QUICKBOOKS_CLIENT_SECRET="your-qb-client-secret"
QUICKBOOKS_ENVIRONMENT="sandbox"  # or "production"
QUICKBOOKS_REDIRECT_URI="https://your-domain.com/api/quickbooks/callback"
```

---

## CRITICAL: Payment Data Security (PCI-DSS Compliance)

### Current Status: ⚠️ NON-COMPLIANT

The current payment implementation **passes card data through your server**, which:
- Increases PCI-DSS compliance scope to **Level 1** (most strict)
- Exposes your server to card data interception
- Violates PCI-DSS best practices

### REQUIRED ACTION: Implement Client-Side Tokenization

You **MUST** implement USAePay's client-side tokenization before processing real payments.

#### Implementation Steps:

1. **Use USAePay Hosted Payment Fields**
   ```html
   <!-- Add to your payment form -->
   <script src="https://secure.usaepay.com/js/v1/usaepay.js"></script>
   
   <div id="card-number"></div>
   <div id="card-exp"></div>
   <div id="card-cvv"></div>
   ```

2. **Tokenize on Client-Side**
   ```javascript
   const usaepay = new USAePay({
     apiKey: 'your-public-key',
     sandbox: true
   });
   
   const token = await usaepay.createToken({
     card: cardElement,
     // Card data never touches your server
   });
   
   // Send only the token to your server
   fetch('/api/payments', {
     method: 'POST',
     body: JSON.stringify({
       token: token.id,  // Send token, NOT card data
       amount: 100.00,
       // ... other non-sensitive data
     })
   });
   ```

3. **Update Server-Side**
   ```typescript
   // app/api/payments/route.ts
   export async function POST(request: NextRequest) {
     const { token, amount, companyId } = await request.json();
     
     // Use token instead of raw card data
     const result = await processPaymentWithToken(token, amount);
     
     // No card data ever touches your server!
   }
   ```

#### Benefits:
- ✅ Reduces PCI-DSS scope dramatically
- ✅ Card data never touches your server
- ✅ Eliminates card data interception risk
- ✅ Simplifies compliance audits

#### Resources:
- [USAePay Tokenization Documentation](https://usaepay.com/developer/docs/tokenization)
- [PCI-DSS Compliance Guide](https://www.pcisecuritystandards.org/)

---

## Security Features Implemented

### ✅ Authentication & Authorization
- [x] API authentication middleware (middleware.ts)
- [x] JWT token validation on all protected routes
- [x] Session fingerprinting (IP + User Agent)
- [x] Tenant isolation validation
- [x] Role-based access control (RBAC) helpers

### ✅ Rate Limiting
- [x] Global API rate limiting (100 req/min)
- [x] Login rate limiting (5 attempts / 15 minutes)
- [x] Password reset rate limiting (3 attempts / hour)
- [x] Payment rate limiting (3 attempts / hour)
- [x] Rate limit headers (X-RateLimit-*)

### ✅ Input Validation
- [x] Zod validation schemas for all endpoints
- [x] Email normalization and validation
- [x] Password strength requirements
- [x] SQL injection prevention
- [x] XSS prevention

### ✅ Encryption
- [x] Strong password hashing (bcrypt, 10 rounds)
- [x] Cryptographically secure token generation
- [x] OAuth token encryption (AES-256-GCM)
- [x] MFA secret encryption (AES-256-GCM)
- [x] NO hardcoded encryption keys

### ✅ Audit Logging
- [x] All financial data access logged
- [x] All authentication events logged
- [x] All authorization failures logged
- [x] IP address and user agent captured
- [x] Immutable audit log (write-only)

### ✅ Security Headers
- [x] Content-Security-Policy
- [x] X-Content-Type-Options: nosniff
- [x] X-Frame-Options: DENY
- [x] X-XSS-Protection
- [x] Referrer-Policy
- [x] Permissions-Policy
- [x] Strict-Transport-Security (HTTPS only)

---

## API Security Checklist

Use this checklist when creating new API endpoints:

```typescript
// ✅ Complete Example of Secure API Endpoint

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { auditLog, auditForbiddenAccess } from '@/lib/audit-logger';
import { myInputSchema, validateInput } from '@/lib/validation-schemas';

export async function GET(request: NextRequest) {
  try {
    // 1. VALIDATE INPUT
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID required' }, { status: 400 });
    }
    
    // 2. VALIDATE AUTHORIZATION
    try {
      await requireCompanyAccess(companyId);
    } catch (error) {
      await auditForbiddenAccess('Resource', companyId, 'READ');
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
    
    // 3. QUERY DATA (user has validated access)
    const data = await prisma.resource.findMany({
      where: { companyId }
    });
    
    // 4. AUDIT LOG
    await auditLog({
      action: 'RESOURCE_VIEWED',
      entityType: 'Resource',
      entityId: companyId,
      success: true,
    });
    
    // 5. RETURN DATA
    return NextResponse.json({ data });
    
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Required Steps for Every Protected Endpoint:
1. ✅ Validate input (Zod schemas)
2. ✅ Check authentication (middleware does this)
3. ✅ Check authorization (tenant access)
4. ✅ Query data (with tenant filters)
5. ✅ Audit log operation
6. ✅ Return sanitized data

---

## Testing Security

### Test Authorization Boundaries

```bash
# Test 1: Unauthenticated access (should fail)
curl https://your-domain.com/api/financials?companyId=test

# Test 2: Cross-tenant access (should fail)
curl https://your-domain.com/api/financials?companyId=other-company-id \
  -H "Authorization: Bearer $YOUR_TOKEN"

# Test 3: Rate limiting (should fail after N attempts)
for i in {1..10}; do
  curl https://your-domain.com/api/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}'
done
```

### Verify Audit Logs

```sql
-- Check audit log for suspicious activity
SELECT * FROM "AuditLog" 
WHERE action IN ('UNAUTHORIZED_ACCESS_ATTEMPT', 'FORBIDDEN_ACCESS_ATTEMPT')
ORDER BY "createdAt" DESC 
LIMIT 100;

-- Check failed login attempts
SELECT * FROM "AuditLog" 
WHERE action = 'LOGIN_FAILED'
AND "createdAt" > NOW() - INTERVAL '1 hour';
```

---

## Deployment Checklist

### Before Deploying to Production:

- [ ] All encryption keys generated and configured
- [ ] `NEXTAUTH_SECRET` set (not the default)
- [ ] Database encryption at rest enabled
- [ ] Vercel environment variables configured
- [ ] Payment tokenization implemented (client-side)
- [ ] Rate limiting tested
- [ ] Audit logging verified
- [ ] Security headers verified
- [ ] HTTPS enforced
- [ ] Error messages don't leak sensitive info
- [ ] No console.log statements in production
- [ ] Database backups configured
- [ ] Monitoring/alerting configured

### Post-Deployment:

- [ ] Run penetration tests
- [ ] Verify audit logs are working
- [ ] Test rate limiting in production
- [ ] Monitor for unauthorized access attempts
- [ ] Set up security alerts
- [ ] Schedule SOC 2 audit

---

## Security Contacts

- **Security Issues**: Report to security@your-domain.com
- **PCI-DSS Questions**: Contact USAePay support
- **Penetration Testing**: Schedule before production launch

---

## Known Limitations

### TO BE IMPLEMENTED (Medium Priority):

1. **Redis-based rate limiting** (current: in-memory, resets on restart)
2. **IP geolocation blocking** (detect impossible travel)
3. **Anomaly detection** (ML-based suspicious activity)
4. **File upload validation** (malware scanning)
5. **Data encryption at rest** (field-level encryption for PII)
6. **GDPR compliance features** (data export, right to be forgotten)
7. **Backup validation** (automated restore testing)

### References:
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [SOC 2 Compliance Guide](https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/socforserviceorganizations.html)

