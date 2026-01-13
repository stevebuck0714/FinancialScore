# MFA Testing Guide

## ✅ Implementation Complete

All code for mandatory MFA has been implemented. This guide will help you test the complete flow.

---

## Prerequisites

1. **Dev server running**: `npm run dev`
2. **Database accessible**: Ensure PostgreSQL is running
3. **Test user account**: Create a new user OR reset an existing user's MFA

---

## Test Flow 1: New User Enrollment (First-Time Login)

### Setup:
Create a test user with MFA disabled:

```sql
-- In your database
UPDATE "User" 
SET "mfaEnabled" = false, "mfaSecret" = NULL, "backupCodes" = '{}' 
WHERE email = 'test@example.com';
```

### Steps:

1. **Navigate to login page**: `http://localhost:3000`

2. **Enter credentials**:
   - Email: `test@example.com`
   - Password: `your-password`
   - Click "Sign In"

3. **MFA Enrollment Modal Should Appear**:
   - ✅ Modal blocks access to the app
   - ✅ Shows "Set Up Two-Factor Authentication" header
   - ✅ Displays QR code
   - ✅ Shows authenticator app recommendations

4. **Scan QR Code**:
   - Open Google Authenticator, Authy, or Microsoft Authenticator
   - Scan the QR code
   - Verify the app shows "Corelytics" or your account name

5. **Click "I've Scanned the Code →"**:
   - ✅ Advances to verification step
   - ✅ Shows 6-digit code input field

6. **Enter 6-Digit Code**:
   - Get code from authenticator app
   - Type it in (auto-advances when 6 digits entered)
   - Click "Verify & Continue →"

7. **Backup Codes Screen**:
   - ✅ Shows 8-10 backup codes
   - ✅ "Download Backup Codes" button works
   - ✅ Codes are formatted properly
   - Click "I've Saved My Backup Codes →"

8. **Success Screen**:
   - ✅ Shows "All Set!" message
   - ✅ Auto-redirects to dashboard after 1.5 seconds

9. **Verify Access**:
   - ✅ User is logged in
   - ✅ Can access dashboard
   - ✅ No errors in browser console

---

## Test Flow 2: Existing User Login (MFA Already Enabled)

### Setup:
Ensure user has MFA enabled (use the user from Test Flow 1).

### Steps:

1. **Log out** (if logged in)

2. **Navigate to login page**: `http://localhost:3000`

3. **Enter credentials**:
   - Email: `test@example.com`
   - Password: `your-password`
   - Click "Sign In"

4. **MFA Verification Modal Should Appear**:
   - ✅ Modal shows "Two-Factor Authentication" header
   - ✅ Shows 6-digit code input field
   - ✅ Shows "Use backup code instead" link
   - ✅ Shows tip about opening authenticator app

5. **Enter 6-Digit Code**:
   - Get current code from authenticator app
   - Type it in
   - Press Enter OR click "Verify & Sign In"

6. **Success**:
   - ✅ User is logged in immediately
   - ✅ Dashboard loads
   - ✅ No errors in console

---

## Test Flow 3: Backup Code Login

### Setup:
Use the backup codes saved during enrollment.

### Steps:

1. **Start login flow** (same as Test Flow 2, steps 1-4)

2. **Click "Use backup code instead"**:
   - ✅ Input field changes to accept backup code
   - ✅ Placeholder shows "XXXXXXXXXX"
   - ✅ Button text updates

3. **Enter a Backup Code**:
   - Type one of your saved backup codes
   - Click "Verify & Sign In"

4. **Success**:
   - ✅ User is logged in
   - ✅ Dashboard loads
   - ⚠️ **That backup code is now used** (cannot be reused)

---

## Test Flow 4: Invalid Code Handling

### Test Invalid TOTP Code:

1. **Start login** → MFA verification appears
2. **Enter wrong code**: `000000`
3. **Click "Verify & Sign In"**

**Expected**:
- ✅ Error message appears: "Invalid verification code"
- ✅ Input field stays focused
- ✅ User can try again
- ✅ Does NOT log out the user

### Test Invalid Backup Code:

1. **Click "Use backup code instead"**
2. **Enter invalid code**: `INVALIDCODE`
3. **Click "Verify & Sign In"**

**Expected**:
- ✅ Error message appears
- ✅ User can try again

---

## Test Flow 5: Cancel MFA Verification

### Steps:

1. **Start login** → MFA verification appears
2. **Click "Cancel" button**

**Expected**:
- ✅ Modal closes
- ✅ User returns to login screen
- ✅ User is NOT logged in
- ✅ Must re-enter password to try again

---

## Test Flow 6: Network Error Handling

### Simulate Network Issues:

1. **Open DevTools** → Network tab
2. **Set "Offline" mode**
3. **Try to enroll in MFA**

**Expected**:
- ✅ Error message appears
- ✅ User can retry when back online
- ✅ No crash or blank screen

---

## Database Verification

After successful enrollment, check the database:

```sql
SELECT 
  id, 
  email, 
  "mfaEnabled",
  "mfaSecret" IS NOT NULL as "hasSecret",
  cardinality("backupCodes") as "backupCodeCount"
FROM "User" 
WHERE email = 'test@example.com';
```

**Expected**:
- `mfaEnabled` = `true`
- `hasSecret` = `true`
- `backupCodeCount` = 8 (or 10, depending on implementation)

---

## Security Verification

### Check MFA Secret Encryption:

```sql
SELECT "mfaSecret" FROM "User" WHERE email = 'test@example.com';
```

**Expected**:
- ✅ Secret is encrypted (not plaintext)
- ✅ Cannot read the actual TOTP secret

### Check Backup Codes Hashing:

```sql
SELECT "backupCodes"[1] FROM "User" WHERE email = 'test@example.com';
```

**Expected**:
- ✅ Backup codes are hashed (bcrypt format: `$2b$...`)
- ✅ Not stored in plaintext

---

## API Testing (Optional - Advanced)

### Test MFA Enrollment API:

```bash
# Start enrollment
curl -X POST http://localhost:3000/api/auth/mfa/enroll \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID_HERE"}'
```

**Expected Response**:
```json
{
  "qrCodeDataURL": "data:image/png;base64,...",
  "secret": "encrypted-secret-here",
  "backupCodes": ["XXXXXX", "YYYYYY", ...]
}
```

### Test MFA Verification API:

```bash
# Verify enrollment code
curl -X POST http://localhost:3000/api/auth/mfa/verify-enrollment \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID_HERE",
    "code": "123456"
  }'
```

**Expected Response** (on success):
```json
{
  "success": true
}
```

---

## Browser Console Checks

### Enrollment Flow:

Expected console logs:
```
🔒 MFA enrollment required
✅ MFA enrollment completed
🔐 NextAuth session after login: EXISTS
```

### Verification Flow:

Expected console logs:
```
🔐 MFA verification required
✅ MFA verification completed
```

---

## Common Issues & Troubleshooting

### Issue: QR Code Not Showing
**Fix**: Check browser console for errors. Verify `/api/auth/mfa/enroll` is accessible.

### Issue: Code Always Invalid
**Fix**: Ensure your device time is synced (TOTP requires accurate time).

### Issue: Modal Doesn't Appear
**Fix**: 
1. Check `showMFAEnrollment` state in React DevTools
2. Verify `mfaEnrollmentRequired` is true in API response
3. Check browser console for JavaScript errors

### Issue: User Stuck in MFA Loop
**Fix**: 
```sql
-- Reset user's MFA
UPDATE "User" 
SET "mfaEnabled" = false, "mfaSecret" = NULL, "backupCodes" = '{}' 
WHERE email = 'user@example.com';
```

---

## Edge Cases to Test

### ✅ Enrollment During Registration
- [ ] Register new consultant account
- [ ] Should trigger MFA enrollment immediately

### ✅ Session Persistence
- [ ] Complete MFA login
- [ ] Refresh page
- [ ] Should stay logged in (no re-prompt)

### ✅ Multiple Failed Attempts
- [ ] Enter wrong code 5 times
- [ ] Should still allow retries (no lockout yet)

### ✅ Time-Based Code Expiration
- [ ] Get a code from authenticator
- [ ] Wait 30+ seconds (TOTP codes expire)
- [ ] Try to use expired code
- [ ] Should fail, require new code

---

## Success Criteria

All tests pass if:

- ✅ **Enrollment Flow**: New users MUST enroll before accessing the app
- ✅ **Verification Flow**: Returning users MUST enter valid code to log in
- ✅ **Backup Codes**: Work as a fallback authentication method
- ✅ **Error Handling**: Invalid codes show clear error messages
- ✅ **Security**: Secrets encrypted, backup codes hashed
- ✅ **UX**: Smooth flow, no confusing states, clear instructions
- ✅ **No Bypass**: Cannot access app without completing MFA

---

## Deployment Checklist

Before deploying to production:

- [ ] Test with multiple users
- [ ] Test on mobile devices
- [ ] Verify all error messages are user-friendly
- [ ] Ensure backup codes download works on all browsers
- [ ] Test with different authenticator apps (Google, Authy, Microsoft)
- [ ] Verify session management works correctly
- [ ] Test logout and re-login flow
- [ ] Document the MFA setup process for end users

---

## Next Steps After Testing

1. **If all tests pass**: Commit and deploy ✅
2. **If issues found**: Document them and fix before deployment
3. **User communication**: Prepare email/guide for users about mandatory MFA
4. **Support prep**: Train support team on helping users with MFA setup

---

## Contact & Support

If you encounter issues during testing:

1. Check browser console for errors
2. Check server logs for API errors
3. Verify database schema is up to date
4. Review this testing guide for missed steps

**MFA is now mandatory for all users. Good luck with testing! 🔒**

