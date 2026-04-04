# Security Quick Reference Guide
## For Developers

**Quick access guide to security implementations**

---

## 🚀 Quick Start

### When Creating a New Protected API Route:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { auditLog, auditForbiddenAccess } from '@/lib/audit-logger';
import { myInputSchema, validateInput } from '@/lib/validation-schemas';

export async function GET(request: NextRequest) {
  try {
    // 1. PARSE & VALIDATE INPUT
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    
    if (!companyId) {
      return NextResponse.json({ error: 'Missing parameter' }, { status: 400 });
    }
    
    // 2. AUTHORIZATION CHECK
    try {
      await requireCompanyAccess(companyId);
    } catch (error) {
      await auditForbiddenAccess('Resource', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## 🔑 Security Helpers

### Authentication

```typescript
import { requireAuth, getUserContext } from '@/lib/tenant-security';

// Get current user (returns null if not authenticated)
const user = await getUserContext();

// Require authentication (throws if not authenticated)
const user = await requireAuth();
```

### Authorization

```typescript
import { 
  requireCompanyAccess,
  requireConsultantAccess,
  requireUserAccess,
  requireSiteAdmin
} from '@/lib/tenant-security';

// Require company access (throws if unauthorized)
await requireCompanyAccess(companyId);

// Require consultant access
await requireConsultantAccess(consultantId);

// Require user access
await requireUserAccess(userId);

// Require site admin role
await requireSiteAdmin();
```

### Validation (Zod)

```typescript
import { validateInput, loginSchema, createUserSchema } from '@/lib/validation-schemas';

// Validate input
const validation = validateInput(loginSchema, requestBody);
if (!validation.success) {
  return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
}

// Use validated data
const { email, password } = validation.data;
```

### Audit Logging

```typescript
import { 
  auditLog,
  auditLoginSuccess,
  auditLoginFailed,
  auditForbiddenAccess,
  auditFinancialAccess,
  auditCompanyOperation,
  auditUserOperation
} from '@/lib/audit-logger';

// Log custom event
await auditLog({
  action: 'CUSTOM_ACTION',
  entityType: 'EntityType',
  entityId: 'entity-id',
  metadata: { key: 'value' },
  success: true,
});

// Log specific events
await auditLoginSuccess(userId);
await auditLoginFailed(email, 'Invalid password');
await auditForbiddenAccess('Resource', resourceId, 'READ');
```

---

## 🛡️ Security Checklist for New Features

- [ ] Authentication: Endpoint protected by middleware?
- [ ] Authorization: Validates user owns the resource?
- [ ] Input Validation: All inputs validated with Zod?
- [ ] Audit Logging: All operations logged?
- [ ] Error Handling: Errors don't leak sensitive info?
- [ ] Rate Limiting: Consider if special limits needed?
- [ ] Testing: Security tests written?

---

## 🚨 Common Security Mistakes

### ❌ DON'T DO THIS:

```typescript
// WRONG: Trusts client-provided companyId
export async function GET(request: NextRequest) {
  const companyId = searchParams.get('companyId');
  
  // ❌ NO VALIDATION!
  const data = await prisma.financialRecord.findMany({
    where: { companyId }
  });
  
  return NextResponse.json({ data });
}
```

### ✅ DO THIS:

```typescript
// CORRECT: Validates access before querying
export async function GET(request: NextRequest) {
  const companyId = searchParams.get('companyId');
  
  // ✅ VALIDATE ACCESS
  try {
    await requireCompanyAccess(companyId);
  } catch (error) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  // Safe to query now
  const data = await prisma.financialRecord.findMany({
    where: { companyId }
  });
  
  return NextResponse.json({ data });
}
```

---

## 📚 Security Documentation

- **For Developers**: `SECURITY_PROTECTION_SUMMARY.md`
- **For Business**: `SECURITY_FOR_STAKEHOLDERS.md`
- **Implementation Notes**: `SECURITY_IMPLEMENTATION_NOTES.md`
- **What Was Fixed**: `SECURITY_FIXES_SUMMARY.md`

---

## 🔐 Environment Variables Required

```bash
# CRITICAL - Application won't start without these:
NEXTAUTH_SECRET="your-secret"
OAUTH_ENCRYPTION_KEY="64-hex-chars"
MFA_ENCRYPTION_KEY="64-hex-chars"

# Generate with:
openssl rand -hex 32  # For encryption keys
openssl rand -base64 32  # For NextAuth secret
```

---

## 🧪 Testing Security

### Test Authentication:
```bash
curl http://localhost:3000/api/financials?companyId=test
# Expected: 401 Unauthorized
```

### Test Authorization:
```bash
# Login as User A, try to access Company B
curl http://localhost:3000/api/financials?companyId=other-company \
  -H "Cookie: your-session"
# Expected: 403 Forbidden
```

### Test Rate Limiting:
```bash
for i in {1..10}; do
  curl http://localhost:3000/api/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Expected: 429 after 5 attempts
```

---

## 📞 Security Support

- **Security Issue**: Treat as P0, fix immediately
- **Questions**: Check documentation first
- **Incidents**: Follow incident response plan

---

**Last Updated**: January 2, 2026

