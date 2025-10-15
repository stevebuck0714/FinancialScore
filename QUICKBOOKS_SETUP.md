# QuickBooks Online API Integration Setup

## Overview
This guide explains how to set up QuickBooks Online integration using OAuth 2.0 for automatic financial data import.

## Prerequisites
1. QuickBooks Online Sandbox Account (for testing)
2. Intuit Developer Account

## Step 1: Create an Intuit Developer App

1. **Go to Intuit Developer Portal**
   - Visit: https://developer.intuit.com/
   - Sign in or create an account

2. **Create a New App**
   - Navigate to "My Apps" → "Create an App"
   - Select "QuickBooks Online and Payments"
   - Fill in app details:
     - App Name: "Venturis Business Evaluation Tool"
     - Description: "Financial analysis and business evaluation platform"

3. **Configure OAuth Settings**
   - **Development Keys** (for sandbox):
     - Redirect URI: `http://localhost:3000/api/quickbooks/callback`
     - Redirect URI: `https://your-domain.com/api/quickbooks/callback` (for production)
   
4. **Get Your Credentials**
   - Client ID: `YOUR_CLIENT_ID`
   - Client Secret: `YOUR_CLIENT_SECRET`
   
5. **Select Scopes**
   - `com.intuit.quickbooks.accounting` (Read financial data)

## Step 2: Configure Environment Variables

Add these to your `.env` file:

```env
# QuickBooks OAuth
QUICKBOOKS_CLIENT_ID=your_client_id_here
QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/quickbooks/callback
QUICKBOOKS_ENVIRONMENT=sandbox  # or 'production'

# Encryption key for storing OAuth tokens
OAUTH_ENCRYPTION_KEY=your_32_character_encryption_key_here
```

## Step 3: OAuth Flow

### Authorization Flow:
1. User clicks "Connect to QuickBooks" button
2. User is redirected to QuickBooks login
3. User authorizes the app
4. QuickBooks redirects back with authorization code
5. App exchanges code for access token and refresh token
6. Tokens are encrypted and stored in database

### Token Refresh:
- Access tokens expire after 1 hour
- Refresh tokens expire after 100 days
- App automatically refreshes tokens before making API calls

## Step 4: API Endpoints to Create

### `/api/quickbooks/auth`
- Generates OAuth authorization URL
- Redirects user to QuickBooks login

### `/api/quickbooks/callback`
- Handles OAuth callback from QuickBooks
- Exchanges authorization code for tokens
- Stores encrypted tokens in database

### `/api/quickbooks/sync`
- Triggers data sync from QuickBooks
- Imports financial data (P&L, Balance Sheet, Cash Flow)
- Maps to Venturis data structure

### `/api/quickbooks/disconnect`
- Revokes OAuth tokens
- Removes connection from database

## Step 5: QuickBooks Data Mapping

### Profit & Loss Statement
- **Revenue** → Total Income
- **COGS** → Cost of Goods Sold
- **Operating Expenses** → Operating Expense accounts
- **Net Income** → Net Income

### Balance Sheet
- **Assets**
  - Cash → Cash accounts
  - Accounts Receivable → AR accounts
  - Inventory → Inventory accounts
  - Fixed Assets → Fixed Asset accounts

- **Liabilities**
  - Accounts Payable → AP accounts
  - Current Liabilities → Short-term liabilities
  - Long-term Debt → Long-term liabilities

- **Equity** → Retained Earnings + Owner's Equity

### Cash Flow Statement
- Operating Activities
- Investing Activities
- Financing Activities

## Step 6: Testing in Sandbox

### Create Test Company in QuickBooks Sandbox:
1. Go to https://developer.intuit.com/app/developer/sandbox
2. Create a test company
3. Add sample financial data
4. Test OAuth connection flow
5. Verify data import

### Test Scenarios:
- ✅ Initial connection
- ✅ Data import (full sync)
- ✅ Token refresh
- ✅ Incremental sync
- ✅ Error handling
- ✅ Disconnection

## Step 7: Security Considerations

1. **Token Encryption**
   - All OAuth tokens must be encrypted before storage
   - Use AES-256-GCM encryption
   - Store encryption key in environment variable

2. **Token Storage**
   - Never log tokens
   - Never expose tokens in API responses
   - Rotate encryption keys regularly

3. **API Rate Limits**
   - QuickBooks: 500 requests/minute (production)
   - QuickBooks: 100 requests/minute (sandbox)
   - Implement exponential backoff for rate limit errors

4. **Webhook Notifications** (Optional)
   - Subscribe to QuickBooks webhooks for real-time updates
   - Reduces need for frequent polling

## Step 8: Production Deployment

1. Update redirect URI to production URL
2. Submit app for Intuit review (if publishing publicly)
3. Update environment variables
4. Test OAuth flow in production
5. Monitor API usage and errors

## QuickBooks API Documentation

- **Developer Portal**: https://developer.intuit.com/
- **API Reference**: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/account
- **OAuth 2.0 Guide**: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- **Sandbox**: https://developer.intuit.com/app/developer/sandbox

## NPM Packages Needed

```bash
npm install intuit-oauth crypto-js
```

## Support

For issues with QuickBooks integration:
- Check Intuit Developer Forums: https://help.developer.intuit.com/
- Review API logs in Intuit Developer Portal
- Contact Intuit Developer Support

---

**Status**: Configuration and setup guide complete. OAuth implementation requires QuickBooks developer credentials.


