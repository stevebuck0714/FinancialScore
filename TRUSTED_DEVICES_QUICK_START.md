# Trusted Devices - Quick Start Guide

## What Was Implemented

You now have a complete "Remember This Device" feature for MFA that allows users to skip MFA verification for 30 days on trusted devices.

## Quick Setup (3 Steps)

### Step 1: Add Environment Variables
Add these to your `.env.local` file:

```bash
# Optional - these are the defaults
MFA_TRUST_DURATION_DAYS=30
MFA_MAX_TRUSTED_DEVICES_PER_USER=5
CRON_SECRET=your-random-secret-for-cron
```

### Step 2: Run Database Migration

**Option A: Push schema (quick, for dev)**
```bash
npm run db:push
```

**Option B: Create migration (recommended for production)**
```bash
npx prisma migrate dev --name add_trusted_devices
```

**Note:** If you get a permission error on Windows, close your dev server first, then run the command.

### Step 3: Restart Your Dev Server
```bash
npm run dev
```

## How It Works

### For Users

1. **First Login:**
   - Enter email/password
   - Enter MFA code
   - ✅ Check "Remember this device for 30 days"
   - Get email notification
   - Logged in!

2. **Next Login (same device):**
   - Enter email/password
   - Logged in! (MFA skipped)

3. **Manage Devices:**
   - Go to Settings → Security (when you add it to your UI)
   - View all trusted devices
   - Revoke any device

### For You (Developer)

The implementation is **complete and ready to use**. Here's what was added:

#### Backend
- ✅ Database model for trusted devices
- ✅ Secure token generation and validation
- ✅ Device fingerprinting
- ✅ API endpoints for device management
- ✅ Email notifications
- ✅ Automatic cleanup of expired devices

#### Frontend
- ✅ "Remember device" checkbox in MFA modal
- ✅ Trusted devices management panel
- ✅ Beautiful UI with device details

#### Security
- ✅ HttpOnly secure cookies
- ✅ SHA-256 token hashing
- ✅ Automatic expiration (30 days)
- ✅ Device limits (5 per user)
- ✅ Email alerts

## Add to Your Settings Page

To add the device management UI to your settings:

```tsx
import TrustedDevicesPanel from '@/app/components/settings/TrustedDevicesPanel';

// In your settings page:
<TrustedDevicesPanel userId={currentUser.id} />
```

## Testing

1. **Test Basic Flow:**
   ```
   1. Log in with MFA
   2. Check "Remember this device"
   3. Log out
   4. Log in again → MFA should be skipped ✅
   ```

2. **Test Email:**
   - Check your email after trusting a device
   - Should receive notification with device details

3. **Test Device Management:**
   - Add the TrustedDevicesPanel to your UI
   - View your trusted devices
   - Revoke one
   - Log in again → MFA required ✅

## Production Deployment

### Vercel (Automatic)
The cron job is already configured in `vercel.json` to run daily at 3 AM. Just deploy!

### Self-Hosted
Set up a cron job:
```bash
# Run daily at 3 AM
0 3 * * * cd /path/to/project && npm run cleanup:devices
```

See `scripts/setup-device-cleanup-cron.md` for detailed instructions.

## Configuration Options

All configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MFA_TRUST_DURATION_DAYS` | 30 | How long devices stay trusted |
| `MFA_MAX_TRUSTED_DEVICES_PER_USER` | 5 | Max devices per user |
| `CRON_SECRET` | (none) | Secret for cron endpoint security |

## Security Notes

✅ **Safe to use on:**
- Personal computers
- Work devices
- Trusted locations

❌ **Don't use on:**
- Shared computers
- Public computers
- Library/cafe computers

## Files Created

### Core Implementation
- `lib/trusted-device.ts` - Device management utilities
- `app/api/auth/trusted-devices/route.ts` - API endpoints
- `app/api/auth/trusted-devices/[deviceId]/route.ts` - Single device API
- `app/api/cron/cleanup-devices/route.ts` - Cleanup endpoint

### UI Components
- `app/components/auth/MFAVerificationModal.tsx` - Updated with checkbox
- `app/components/settings/TrustedDevicesPanel.tsx` - Device management UI

### Utilities
- `scripts/cleanup-expired-devices.ts` - Manual cleanup script
- `scripts/setup-device-cleanup-cron.md` - Setup instructions

### Documentation
- `TRUSTED_DEVICES_IMPLEMENTATION.md` - Complete technical docs
- `TRUSTED_DEVICES_QUICK_START.md` - This file

## Troubleshooting

### MFA Still Required After Trusting Device
- Check browser cookies (look for `mfa_device_token`)
- Verify database migration was applied
- Check server logs for validation errors

### Prisma Generate Error on Windows
- Close your dev server
- Run `npx prisma generate` again
- Restart dev server

### Email Not Sending
- Verify `RESEND_API_KEY` is set
- Check server logs for email errors
- Email failures won't block login (by design)

### Devices Not Cleaning Up
- Check cron job is running
- Run manually: `npm run cleanup:devices`
- Check database for expired devices

## Next Steps

1. ✅ Run database migration
2. ✅ Test the feature
3. ✅ Add TrustedDevicesPanel to your settings UI
4. ✅ Deploy to staging/production
5. ✅ Monitor logs and user feedback

## Need Help?

See `TRUSTED_DEVICES_IMPLEMENTATION.md` for:
- Detailed technical documentation
- Security considerations
- Database queries
- Advanced configuration
- Future enhancement ideas

---

**Status:** ✅ Implementation Complete - Ready to Use!

