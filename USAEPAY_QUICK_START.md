# USAePay Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Create Environment File

Create a file named `.env.local` in the project root (`C:\Users\steve\FinancialScore\.env.local`):

```env
USAEPAY_API_KEY=your_source_key_here
USAEPAY_PIN=your_pin_here
USAEPAY_SANDBOX=true
USAEPAY_ENDPOINT=https://sandbox.usaepay.com/api/v2
```

### Step 2: Get USAePay Credentials

**For Testing (Sandbox):**
1. Go to https://sandbox.usaepay.com
2. Sign up for a free sandbox account
3. Navigate to Settings → API Keys
4. Create a new Source Key
5. Copy the API Key and PIN

**For Production:**
1. Go to https://www.usaepay.com
2. Sign up for a merchant account
3. Get your production API credentials

### Step 3: Update Environment File

Replace the placeholder values in `.env.local`:

```env
USAEPAY_API_KEY=sk_abc123xyz789
USAEPAY_PIN=1234
USAEPAY_SANDBOX=true
USAEPAY_ENDPOINT=https://sandbox.usaepay.com/api/v2
```

### Step 4: Restart Server

Close and restart your dev server to load new environment variables.

### Step 5: Test Payment

1. Go to http://localhost:3000/billing
2. Select a plan
3. Click "Proceed to Checkout"
4. Use test card: **4111 1111 1111 1111**
5. Expiration: **12/2025**
6. CVV: **123**
7. Fill in billing address
8. Click "Pay"

---

## 💳 Test Cards (Sandbox Only)

| Card Type | Number | Result |
|-----------|--------|--------|
| Visa | 4111111111111111 | Approved |
| Mastercard | 5555555555554444 | Approved |
| Amex | 378282246310005 | Approved |
| Declined | 4000000000000002 | Declined |

---

## ✅ Checklist

- [ ] Create `.env.local` file
- [ ] Add USAePay credentials
- [ ] Restart dev server
- [ ] Test payment with sandbox card
- [ ] Verify success message
- [ ] Check subscription updated

---

## 🐛 Common Issues

**"USAePay credentials not configured"**
→ Make sure `.env.local` exists in project root and restart server

**"Payment declined"**
→ Use test card 4111111111111111 in sandbox mode

**Environment variables not loading**
→ Restart the development server after creating `.env.local`

---

## 📚 Full Documentation

See `USAEPAY_SETUP_GUIDE.md` for complete documentation.

---

**Ready to accept payments!** 🎉

