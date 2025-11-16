# QuickBooks Sync Issue - FIXED

## Problem
After connecting to QuickBooks, clicking "Sync Data" was failing with a **403 ApplicationAuthorizationFailed** error from QuickBooks API.

Error message:
```
"message":"message=ApplicationAuthorizationFailed; errorCode=003100; statusCode=403"
```

## Root Causes Identified

1. **No token refresh buffer** - Tokens were only being refreshed AFTER they expired, not before
2. **Poor error handling** - 403/401 errors weren't properly caught and handled
3. **No token validation** - No checks for token decryption failures
4. **Silent failures** - Connection wasn't being marked as expired when auth failed

## Fixes Applied

### 1. Token Refresh Buffer (app/api/quickbooks/sync/route.ts)
- Added 5-minute buffer before token expiry to refresh proactively
- Added detailed logging to show token expiration status
- Now refreshes tokens BEFORE they expire, not after

### 2. Enhanced Error Handling
- Added explicit 401/403 error detection
- When QuickBooks rejects the token, the connection is immediately marked as `EXPIRED`
- Returns `needsReconnect: true` flag to frontend

### 3. Token Decryption Validation
- Added try-catch around token decryption
- If decryption fails, connection is marked as ERROR
- Better logging to debug encryption issues

### 4. Frontend Reconnection Flow (app/page.tsx)
- Frontend now detects `needsReconnect` flag or 401 status
- Automatically updates UI to show "Reconnect" button
- Shows clear alert: "⚠️ QuickBooks authorization expired. Please reconnect to QuickBooks to sync your data."

## Changes Made

### Backend: `app/api/quickbooks/sync/route.ts`

1. **Token expiration logging** (lines 110-115)
```typescript
console.log('⏰ Token expiration check:');
console.log('  Current time:', now.toISOString());
console.log('  Token expires at:', connection.tokenExpiresAt?.toISOString() || 'Not set');
console.log('  Time until expiry:', ...);
```

2. **Token refresh buffer** (lines 106-130)
```typescript
const bufferTime = 5 * 60 * 1000; // 5 minutes
const shouldRefresh = connection.tokenExpiresAt && 
                     (connection.tokenExpiresAt.getTime() - now.getTime() < bufferTime);
```

3. **Token decryption validation** (lines 59-88)
```typescript
try {
  accessToken = decryptToken(connection.accessToken);
  refreshToken = decryptToken(connection.refreshToken);
} catch (decryptError) {
  // Mark connection as ERROR and return needsReconnect
}
```

4. **403/401 Error handling** (lines 176-194, 226-244)
```typescript
if (plResponse.status === 401 || plResponse.status === 403) {
  await prisma.accountingConnection.update({
    data: { status: 'EXPIRED', errorMessage: 'Authorization failed...' }
  });
  return NextResponse.json({ 
    error: 'QuickBooks authorization failed - please reconnect',
    needsReconnect: true 
  }, { status: 401 });
}
```

### Frontend: `app/page.tsx`

1. **Reconnection detection** (lines 2873-2885)
```typescript
if (data.needsReconnect || response.status === 401) {
  setQbConnected(false);
  setQbStatus('EXPIRED');
  await checkQBStatus(selectedCompanyId);
  alert('⚠️ QuickBooks authorization expired.\n\nPlease reconnect...');
  return;
}
```

## Testing Instructions

1. **Reconnect to QuickBooks**
   - Go to Admin panel
   - Click "Reconnect to QuickBooks"
   - Complete OAuth flow
   
2. **Try Sync Again**
   - Click "Sync Data"
   - Watch the server console for debug logs:
     - Token decryption status
     - Token expiration time
     - API call results
   
3. **Check Console Logs**
   ```
   🔐 Decrypting tokens...
   ✅ Tokens decrypted successfully
   ⏰ Token expiration check:
   📅 QB Sync Date Range: ...
   ```

## What Changed in User Flow

### Before
1. User connects to QuickBooks ✓
2. User clicks "Sync Data"
3. ❌ Error: 403 - unclear what to do
4. Connection still shows as "Connected" (confusing)

### After
1. User connects to QuickBooks ✓
2. User clicks "Sync Data"
3. If token expired/invalid:
   - ✓ Connection automatically marked as EXPIRED
   - ✓ Clear alert: "Please reconnect to QuickBooks"
   - ✓ UI updates to show "Reconnect" button
4. User clicks "Reconnect" and sync works ✓

## Known Issues to Monitor

1. **Encryption Key** - Make sure `OAUTH_ENCRYPTION_KEY` is set correctly in production
2. **Token Expiry** - QuickBooks access tokens expire after 1 hour. The refresh buffer should handle this now.
3. **Sandbox vs Production** - Ensure `QUICKBOOKS_ENVIRONMENT` is set correctly

## Next Steps

1. Test the reconnection flow
2. Monitor server logs for token refresh activity
3. If still failing with 403, check:
   - QuickBooks app permissions/scopes
   - Encryption key consistency
   - Whether the QuickBooks company was disconnected on their end

## Debug Commands

To check the current connection status:
```sql
SELECT status, tokenExpiresAt, errorMessage, lastSyncAt 
FROM AccountingConnection 
WHERE platform = 'QUICKBOOKS';
```

To see sync logs:
```sql
SELECT * FROM ApiSyncLog 
WHERE platform = 'QUICKBOOKS' 
ORDER BY createdAt DESC 
LIMIT 5;
```




















