mp# MFA Security - One Page Summary

**Corelytics Multi-Factor Authentication & Trusted Device System**  
*Last Updated: January 5, 2026*

---

## 🔐 What is MFA?

Multi-Factor Authentication (MFA) adds a second layer of security beyond passwords. Users must provide:
1. **Something they know** - Password
2. **Something they have** - Authenticator app (Google Authenticator, Authy, etc.)

## ✅ Current Implementation

### Status
- **Production**: ✅ Active and Required
- **Staging**: ✅ Active and Required  
- **Development**: ⏸️ Paused (optional via environment flag)

### How It Works
```
Login → Password → MFA Code (6 digits) → Access Granted
```

### Trusted Device Feature (NEW)
- **Purpose**: Skip MFA for 60 days on trusted devices
- **Security**: 256-bit encrypted tokens, secure cookies
- **User Control**: Max 5 devices, revocable anytime
- **Notifications**: Email alerts for new trusted devices

---

## 🛡️ Security Standards

| Feature | Implementation |
|---------|----------------|
| **MFA Standard** | TOTP (RFC 6238) - Industry Standard |
| **Encryption** | AES-256 for secrets |
| **Token Hashing** | SHA-256 one-way hash |
| **Password Storage** | bcrypt with salt |
| **Cookie Security** | httpOnly, Secure, SameSite |
| **Backup Codes** | 10 single-use encrypted codes |

---

## 📊 Key Metrics

- **Device Trust Duration**: 60 days (configurable)
- **Max Devices per User**: 5 (configurable)
- **TOTP Code Validity**: 30 seconds
- **Backup Codes**: 10 per user
- **Cleanup Schedule**: Daily at 3 AM UTC

---

## 👤 User Experience

### First-Time Setup
1. User logs in with password
2. Prompted to enroll in MFA
3. Scans QR code with authenticator app
4. Verifies with 6-digit code
5. Receives 10 backup codes
6. MFA enabled ✅

### Regular Login (Untrusted Device)
1. Enter password
2. Enter MFA code from app
3. **Optional**: Check "Remember this device for 60 days"
4. Access granted

### Regular Login (Trusted Device)
1. Enter password
2. **MFA skipped** - Direct access ✅

---

## 🔧 Technical Configuration

### Environment Variables
```bash
MFA_ENCRYPTION_KEY=<64-char-hex>          # Required
MFA_TRUST_DURATION_DAYS=60                # Optional (default: 60)
MFA_MAX_TRUSTED_DEVICES_PER_USER=5        # Optional (default: 5)
DISABLE_MFA_DEV=true                      # Dev only
```

### Database
- **Table**: `TrustedDevice`
- **Relations**: Links to `User` table
- **Indexes**: Optimized for token lookup and expiration checks
- **Cleanup**: Automated via cron job

---

## 🚨 Security Features

✅ **Mandatory in Production** - All users must enroll  
✅ **Encrypted Secrets** - AES-256 encryption  
✅ **Device Fingerprinting** - Browser + IP tracking  
✅ **Email Notifications** - Alerts for new devices  
✅ **Automatic Cleanup** - Expired devices removed daily  
✅ **Audit Logging** - All MFA events tracked  
✅ **User Control** - Self-service device management  
✅ **Backup Recovery** - 10 backup codes per user  

---

## ⚠️ Best Practices

### For Users
- ✅ Use trusted devices only on personal computers
- ❌ Don't check "Remember" on shared/public computers
- ✅ Review trusted devices regularly
- ✅ Revoke devices you don't recognize
- ✅ Keep backup codes in a safe place

### For Administrators
- ✅ Monitor failed MFA attempts
- ✅ Review audit logs regularly
- ✅ Ensure email notifications are working
- ✅ Test MFA enrollment process periodically
- ✅ Verify cron job runs successfully

---

## 📞 Support & Troubleshooting

### Common Issues
| Issue | Solution |
|-------|----------|
| Invalid MFA code | Ensure device time is synced, try fresh code |
| Lost authenticator | Use one of the 10 backup codes |
| Lost backup codes | Contact administrator for MFA reset |
| Device not trusted | Check browser cookies are enabled |
| MFA not working | Check production logs in Vercel |

### Admin Tools
- **Reset MFA**: Database script available
- **View Devices**: Query `TrustedDevice` table
- **Manual Cleanup**: `npm run cleanup:devices`

---

## 📈 Compliance & Standards

- **NIST Guidelines**: Multi-factor authentication compliant
- **RFC 6238**: TOTP standard implementation
- **OWASP**: Follows authentication best practices
- **GDPR**: User data encrypted and auditable
- **SOC 2**: Audit logging and access controls

---

## 🔗 Related Documentation

- **Full Technical Documentation**: `MFA_SECURITY_DETAILED.md`
- **Implementation Guide**: `TRUSTED_DEVICES_IMPLEMENTATION.md`
- **Quick Start Guide**: `TRUSTED_DEVICES_QUICK_START.md`
- **Testing Guide**: `MFA_TESTING_GUIDE.md`

---

**Questions?** Contact: support@corelytics.com  
**Status Dashboard**: Vercel Deployment Logs  
**Last Security Audit**: January 5, 2026

