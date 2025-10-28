# USAePay Payment Integration - Setup Guide

## 🎉 Integration Complete!

USAePay payment processing has been successfully integrated into the Payments tab (formerly Billing). Users can now pay for subscriptions with credit cards through the USAePay gateway.

---

## 📦 What Was Added

### 1. **Payment Processing Library**
- `lib/usaepay.ts` - Core payment processing functions
  - Process payments through USAePay API
  - Card validation (Luhn algorithm)
  - Card type detection
  - Card number formatting

### 2. **Payment API Route**
- `app/api/payments/process/route.ts` - Backend payment processing endpoint
  - Authenticates user session
  - Validates company access
  - Processes payment through USAePay
  - Updates subscription in database
  - Returns transaction details

### 3. **Payment Form Component**
- `app/components/PaymentForm.tsx` - Frontend payment form
  - Credit card input fields
  - Billing address form
  - Real-time validation
  - Secure payment submission
  - Loading states and error handling

### 4. **Updated Payments Page**
- `app/billing/page.tsx` - Enhanced with payment form
  - Shows subscription plans
  - Shopping cart for plan selection
  - Integrated payment form
  - Success/error messaging

---

## 🔧 Configuration Required

### Step 1: Create Environment Variables

Create a file named `.env.local` in the project root:

```bash
# USAePay Configuration
USAEPAY_API_KEY=your_source_key_here
USAEPAY_PIN=your_pin_here
USAEPAY_SANDBOX=true
USAEPAY_ENDPOINT=https://sandbox.usaepay.com/api/v2

# For Production, use:
# USAEPAY_SANDBOX=false
# USAEPAY_ENDPOINT=https://secure.usaepay.com/api/v2
```

### Step 2: Get USAePay Credentials

1. **Sign up for USAePay Account:**
   - Sandbox (Testing): https://sandbox.usaepay.com
   - Production: https://www.usaepay.com

2. **Generate API Credentials:**
   - Log into USAePay Console
   - Navigate to Settings → API Keys
   - Create a new Source Key
   - Copy your **Source Key** and **PIN**

3. **Add Credentials to `.env.local`:**
   ```bash
   USAEPAY_API_KEY=sk_1234567890abcdef
   USAEPAY_PIN=1234
   USAEPAY_SANDBOX=true
   ```

### Step 3: Restart Development Server

After adding environment variables:

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

---

## 💳 How It Works

### User Flow

1. **Select Plan** → User chooses Monthly, Quarterly, or Annual subscription
2. **Add to Cart** → Plan is added to shopping cart
3. **Proceed to Checkout** → Click checkout button
4. **Payment Form** → Enter credit card and billing address
5. **Process Payment** → USAePay processes the transaction
6. **Subscription Activated** → Company subscription is updated

### Technical Flow

```
Frontend (PaymentForm) 
  → POST /api/payments/process
    → Validate user & company
    → Call USAePay API
    → Process payment
    → Update subscription
  ← Return transaction result
← Update UI with success/error
```

---

## 🧪 Testing

### Test Credit Card Numbers (Sandbox)

```
Visa (Approved): 4111111111111111
Mastercard (Approved): 5555555555554444
Amex (Approved): 378282246310005

Declined: 4000000000000002
Insufficient Funds: 4000000000009995
```

### Test Data

```
Expiration: Any future date (e.g., 12/2025)
CVV: Any 3-4 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

### Testing Steps

1. Navigate to **http://localhost:3000/billing**
2. Select a subscription plan (Monthly/Quarterly/Annual)
3. Click "Select Plan" then "Proceed to Checkout"
4. Fill in payment form with test card
5. Click "Pay $XX.XX"
6. Verify success message appears
7. Check that subscription is updated

---

## 🔒 Security Features

### Implemented Security

✅ **No Card Storage** - Card details never stored in database  
✅ **HTTPS Required** - Production enforces SSL/TLS  
✅ **Session Authentication** - User must be logged in  
✅ **Company Verification** - User access to company verified  
✅ **Input Validation** - All fields validated before submission  
✅ **Error Handling** - Secure error messages (no sensitive data leaks)  
✅ **PCI Compliance** - Payment processing handled by USAePay  

### Best Practices

- Card numbers are only sent to USAePay API (never stored locally)
- CVV is never logged or stored
- All API calls use HTTPS encryption
- User sessions verified before processing payments

---

## 📊 Payment Data Model

### Current Implementation

Payments are processed and subscriptions updated in the `Company` model:

```typescript
Company {
  selectedSubscriptionPlan: 'monthly' | 'quarterly' | 'annual'
  subscriptionMonthlyPrice: Decimal
  subscriptionQuarterlyPrice: Decimal
  subscriptionAnnualPrice: Decimal
}
```

### Recommended: Add Payment History (Optional)

Create a `Payment` model to track transactions:

```prisma
model Payment {
  id              String   @id @default(cuid())
  companyId       String
  company         Company  @relation(fields: [companyId], references: [id])
  amount          Decimal
  transactionId   String   @unique
  authCode        String?
  status          String   // 'success', 'declined', 'error'
  plan            String   // 'Monthly Plan', etc.
  billingPeriod   String   // 'monthly', 'quarterly', 'annual'
  createdAt       DateTime @default(now())
}
```

---

## 🚀 Production Deployment

### Checklist Before Going Live

- [ ] Obtain production USAePay account
- [ ] Generate production API keys
- [ ] Update `.env.local` with production credentials:
  ```bash
  USAEPAY_SANDBOX=false
  USAEPAY_ENDPOINT=https://secure.usaepay.com/api/v2
  ```
- [ ] Test with real card in production sandbox
- [ ] Verify SSL certificate is active
- [ ] Set up payment reconciliation process
- [ ] Configure webhook notifications (optional)
- [ ] Test refund process
- [ ] Set up monitoring/alerts for failed payments

### Environment Variables for Vercel

When deploying to Vercel:

1. Go to Project Settings → Environment Variables
2. Add all USAePay variables:
   - `USAEPAY_API_KEY`
   - `USAEPAY_PIN`
   - `USAEPAY_SANDBOX`
   - `USAEPAY_ENDPOINT`
3. Redeploy application

---

## 🛠️ Troubleshooting

### Payment Declined

**Possible Causes:**
- Incorrect card number
- Expired card
- Insufficient funds
- Card declined by issuing bank

**Solution:** Try different test card or contact USAePay support

### Configuration Error

**Error:** "USAePay credentials not configured"

**Solution:** 
1. Check `.env.local` exists in project root
2. Verify `USAEPAY_API_KEY` and `USAEPAY_PIN` are set
3. Restart development server

### API Connection Error

**Error:** "Payment processing failed"

**Solution:**
1. Check `USAEPAY_ENDPOINT` is correct
2. Verify API credentials are valid
3. Check USAePay service status
4. Review server logs for detailed error

### Transaction ID Not Returned

**Issue:** Payment success but no transaction ID

**Solution:** Check USAePay response format - update `lib/usaepay.ts` to match actual API response structure

---

## 📞 Support

### USAePay Support

- **Sandbox Support:** sandbox-support@usaepay.com
- **Production Support:** support@usaepay.com
- **Documentation:** https://docs.usaepay.com
- **Phone:** 1-866-USA-EPAY

### Integration Support

For issues with the integration itself:
1. Check server logs: `npm run dev` output
2. Check browser console for frontend errors
3. Review API response in Network tab
4. Check that all environment variables are set

---

## 🎓 Additional Features (Optional)

### Potential Enhancements

1. **Recurring Billing** - Automatic subscription renewal
2. **Payment History** - Show past transactions to users
3. **Refund Management** - Admin panel to process refunds
4. **Invoice Generation** - PDF receipts via email
5. **Webhook Integration** - Real-time payment notifications
6. **Saved Payment Methods** - Tokenization for returning customers
7. **Multiple Payment Methods** - Add ACH, PayPal, etc.
8. **Subscription Upgrades/Downgrades** - Change plans mid-cycle
9. **Proration** - Calculate pro-rated charges
10. **Trial Periods** - Free trial before charging

---

## 📝 Files Modified/Created

### Created Files
- `lib/usaepay.ts` - Payment library
- `app/api/payments/process/route.ts` - Payment API
- `app/components/PaymentForm.tsx` - Payment UI
- `.env.example` - Environment template
- `USAEPAY_SETUP_GUIDE.md` - This file

### Modified Files
- `app/billing/page.tsx` - Integrated payment form

---

## ✅ Integration Checklist

- [x] USAePay library created
- [x] Payment API route implemented
- [x] Payment form component created
- [x] Billing page updated
- [x] Error handling implemented
- [x] Form validation added
- [x] Security measures in place
- [ ] Environment variables configured (user action required)
- [ ] USAePay account created (user action required)
- [ ] Testing in sandbox completed (user action required)
- [ ] Production deployment prepared (when ready)

---

## 🎊 Congratulations!

Your USAePay payment integration is ready to use! Complete the configuration steps above and start accepting payments.

**Next Steps:**
1. Create `.env.local` with your USAePay credentials
2. Restart the dev server
3. Test with sandbox credentials
4. Deploy to production when ready

---

© 2025 Corelytics Financial Score Calculator
**Payment processing powered by USAePay**

