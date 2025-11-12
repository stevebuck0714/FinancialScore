# Multi-Factor Authentication (MFA) and WebSocket Implementation Guide

## Overview

This document explains the newly added Multi-Factor Authentication (MFA) and WebSocket real-time update features.

---

## 🔐 Multi-Factor Authentication (MFA)

### What is MFA?

MFA adds an extra layer of security by requiring users to provide a time-based one-time password (TOTP) from an authenticator app in addition to their email and password.

### Features Implemented

- ✅ **TOTP Authentication** - Compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.
- ✅ **QR Code Enrollment** - Easy setup by scanning QR code
- ✅ **Backup Codes** - 10 one-time backup codes for emergency access
- ✅ **Optional MFA** - Users can enable/disable MFA in their settings
- ✅ **Secure Storage** - MFA secrets and backup codes are encrypted in the database

### API Endpoints

#### 1. **Enroll in MFA**
```typescript
POST /api/auth/mfa/enroll
Body: { userId: string }
Response: {
  qrCode: string,        // Base64 QR code image
  secret: string,        // Secret key for manual entry
  backupCodes: string[], // 10 backup codes
  message: string
}
```

#### 2. **Verify Enrollment**
```typescript
POST /api/auth/mfa/verify-enrollment
Body: { userId: string, token: string }
Response: { success: true, message: string }
```

#### 3. **Login with MFA**
```typescript
// Step 1: Normal login
POST /api/auth/login
Body: { email: string, password: string }
Response: { mfaRequired: true, userId: string } // if MFA enabled

// Step 2: MFA verification
POST /api/auth/mfa/login
Body: { userId: string, token: string, isBackupCode?: boolean }
Response: { user: {...} }
```

#### 4. **Disable MFA**
```typescript
POST /api/auth/mfa/disable
Body: { userId: string, token: string }
Response: { success: true, message: string }
```

#### 5. **Regenerate Backup Codes**
```typescript
POST /api/auth/mfa/regenerate-backup-codes
Body: { userId: string, token: string }
Response: { success: true, backupCodes: string[] }
```

### Frontend Integration Example

```typescript
// 1. Enroll user in MFA
const enrollResponse = await fetch('/api/auth/mfa/enroll', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: currentUser.id }),
});

const { qrCode, secret, backupCodes } = await enrollResponse.json();

// 2. Display QR code to user
<img src={qrCode} alt="Scan with authenticator app" />

// 3. User enters code from their authenticator app
const verifyResponse = await fetch('/api/auth/mfa/verify-enrollment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: currentUser.id, token: userEnteredCode }),
});

// 4. Save backup codes securely (show them to user once)
alert('Save these backup codes: ' + backupCodes.join(', '));
```

### Login Flow with MFA

```typescript
// 1. User logs in with email/password
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const loginData = await loginResponse.json();

if (loginData.mfaRequired) {
  // 2. Prompt user for MFA code
  const mfaCode = prompt('Enter your 6-digit code from authenticator app:');
  
  // 3. Complete login with MFA verification
  const mfaResponse = await fetch('/api/auth/mfa/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      userId: loginData.userId, 
      token: mfaCode,
      isBackupCode: false 
    }),
  });
  
  const { user } = await mfaResponse.json();
  // Login complete!
}
```

---

## 🔌 WebSocket Real-Time Updates

### What is WebSocket?

WebSocket provides bidirectional, real-time communication between the server and client, enabling instant updates without polling.

### Features Implemented

- ✅ **Real-time Sync Status** - Live updates during QuickBooks sync
- ✅ **Progress Tracking** - 0%, 20%, 50%, 70%, 100% progress indicators
- ✅ **Error Notifications** - Instant error alerts
- ✅ **User & Company Rooms** - Targeted event delivery
- ✅ **Automatic Reconnection** - Handles connection drops

### Custom Server Setup

The app now uses a custom server (`server.js`) instead of `next dev` to support WebSocket:

```javascript
// Development
npm run dev  // Uses node server.js

// Production
npm run build
npm start    // Uses node server.js
```

### React Hook Usage

```typescript
import { useWebSocket } from '@/lib/useWebSocket';

function MyComponent() {
  const { connected, syncStatus, notifications, clearSyncStatus } = useWebSocket(
    userId,    // Optional: for user-specific events
    companyId  // Optional: for company-specific events
  );

  useEffect(() => {
    if (syncStatus) {
      console.log('Sync Status:', syncStatus);
      
      switch (syncStatus.status) {
        case 'started':
          alert('QuickBooks sync started!');
          break;
        case 'progress':
          console.log(`Progress: ${syncStatus.progress}% - ${syncStatus.message}`);
          break;
        case 'completed':
          alert(`Sync complete! ${syncStatus.recordsImported} months imported.`);
          clearSyncStatus();
          break;
        case 'error':
          alert(`Sync failed: ${syncStatus.error}`);
          break;
      }
    }
  }, [syncStatus]);

  return (
    <div>
      <p>WebSocket: {connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      
      {syncStatus && (
        <div>
          <p>Status: {syncStatus.message}</p>
          {syncStatus.progress && <progress value={syncStatus.progress} max={100} />}
        </div>
      )}
    </div>
  );
}
```

### Server-Side Event Emission

```typescript
import { emitSyncStatus, emitNotification } from '@/lib/websocket-emit';

// Emit sync status to company
emitSyncStatus(companyId, {
  status: 'progress',
  message: 'Fetching data from QuickBooks...',
  progress: 50,
});

// Emit notification to user
emitNotification(userId, {
  type: 'success',
  title: 'Sync Complete',
  message: 'Your financial data has been synced successfully.',
});
```

### WebSocket Events

#### Client Emits (to server):
- `join` - Join user-specific room
- `joinCompany` - Join company-specific room
- `leaveCompany` - Leave company room
- `ping` - Health check

#### Server Emits (to client):
- `syncStatus` - QuickBooks sync status updates
- `notification` - User notifications
- `joined` - Confirmation of room join
- `joinedCompany` - Confirmation of company room join
- `pong` - Health check response

### Connection URL

```
ws://localhost:3000/api/socket    // Development
wss://your-domain.com/api/socket  // Production
```

---

## 🚀 Deployment Notes

### Environment Variables

Add to your `.env` file:

```bash
# MFA Encryption (32-byte hex key - 64 characters)
MFA_ENCRYPTION_KEY=your-64-character-hex-key-here

# Or use existing OAUTH_ENCRYPTION_KEY for MFA as well
OAUTH_ENCRYPTION_KEY=your-existing-oauth-key

# WebSocket Configuration
NEXT_PUBLIC_APP_URL=https://dashboard.corelytics.com
```

### Vercel Deployment

**Important:** Vercel's serverless architecture doesn't support WebSocket connections with custom servers. For production on Vercel, you have two options:

1. **Use Vercel's WebSocket Support** (Enterprise plan)
2. **Use a separate WebSocket service** like:
   - Pusher
   - Ably
   - Socket.io Redis Adapter with external server

For non-Vercel deployments (VPS, AWS EC2, etc.), the current implementation works out of the box.

### Database Migration

The schema changes have been pushed. If deploying to a new environment:

```bash
npx prisma db push
# or
npx prisma migrate deploy
```

---

## 📱 Testing

### Test MFA

1. Create a test user account
2. Call `/api/auth/mfa/enroll` with userId
3. Scan QR code with Google Authenticator
4. Verify with `/api/auth/mfa/verify-enrollment`
5. Try logging in - should require MFA code
6. Test backup codes
7. Test disabling MFA

### Test WebSocket

1. Start development server: `npm run dev`
2. Open browser console
3. Use `useWebSocket` hook in a component
4. Trigger QuickBooks sync
5. Observe real-time updates in console and UI

---

## 🔒 Security Considerations

### MFA Security

- ✅ TOTP secrets are encrypted at rest using AES-256-CBC
- ✅ Backup codes are hashed with SHA-256 before storage
- ✅ Requires TOTP verification to disable MFA
- ✅ Requires TOTP verification to regenerate backup codes
- ⚠️  Ensure `MFA_ENCRYPTION_KEY` is unique and kept secret
- ⚠️  Rotate encryption keys periodically

### WebSocket Security

- ✅ CORS protection configured
- ✅ Room-based isolation (users can only join their own rooms)
- ✅ Connection authentication recommended (implement auth middleware)
- ⚠️  Add authentication check before joining rooms (future enhancement)
- ⚠️  Use WSS (WebSocket Secure) in production

---

## 📚 Resources

- **Speakeasy Documentation:** https://github.com/speakeasyjs/speakeasy
- **Socket.IO Documentation:** https://socket.io/docs/v4/
- **Google Authenticator:** https://support.google.com/accounts/answer/1066447
- **TOTP RFC 6238:** https://tools.ietf.org/html/rfc6238

---

## 🐛 Troubleshooting

### MFA Issues

**Problem:** "Invalid verification code"
- Ensure device clock is synchronized (TOTP depends on accurate time)
- Check if user is entering spaces in the code
- Verify token within 30-second window

**Problem:** QR code not displaying
- Check if qrcode library is installed
- Verify base64 image format

### WebSocket Issues

**Problem:** "WebSocket server not available"
- Ensure `node server.js` is running (not `next dev`)
- Check if port 3000 is available
- Verify Socket.IO is installed

**Problem:** Not receiving events
- Check if user/company joined correct room
- Verify WebSocket connection status
- Check browser console for connection errors

**Problem:** Events received multiple times
- Ensure useWebSocket hook cleanup is working
- Check for duplicate socket connections
- Verify component isn't re-rendering excessively

---

## ✅ For Intuit Developer Portal

When setting up your QuickBooks app in the Intuit Developer Portal, you can now answer:

- **Does your app use Multi-Factor Authentication?** → **Yes**
- **Does your app use WebSocket?** → **Yes**
- **Does your app capture intuit_tid?** → **Yes** (stored in database for support)
- **Does your app use CDC operations?** → **No**
- **Does your app use Captcha?** → **No** (can be added if needed)

---

## 📞 Support

For questions or issues with these features, contact: support@corelytics.com



