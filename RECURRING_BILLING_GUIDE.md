# 🔄 Recurring Billing System - Complete Implementation Guide

## Overview

Fully automated recurring billing system integrated with USAePay for monthly, quarterly, and annual subscriptions.

---

## ✅ What's Been Implemented

### 1. **Database Models** ✅
- **`Subscription`** - Stores subscription details, billing schedule, payment method info
- **`PaymentTransaction`** - Complete history of all payment attempts (success/failed)
- **Enums**: `SubscriptionStatus`, `PaymentStatus`, `PaymentType`

### 2. **USAePay Integration** ✅
Enhanced `lib/usaepay.ts` with:
- **Customer Vault** - Securely store payment methods (PCI compliant)
- **Recurring Billing** - Automatic charges on schedule
- **Subscription Management** - Create, update, cancel subscriptions

#### New Functions:
```typescript
addCustomerToVault(customerData)        // Store payment method securely
updateCustomerVault(customerId, data)   // Update card info
deleteCustomerFromVault(customerId)     // Remove customer
createRecurringBilling(billingData)     // Set up auto-billing
updateRecurringBilling(billingId, data) // Change plan/amount
cancelRecurringBilling(billingId)       // Stop auto-billing
getRecurringBillingStatus(billingId)    // Check billing status
```

### 3. **API Endpoints** ✅

#### `/api/subscriptions` (GET, POST, PUT, DELETE)
- **GET** - Fetch subscription details with transaction history
- **POST** - Create new subscription (saves card, sets up recurring billing)
- **PUT** - Update subscription (change plan, update card)
- **DELETE** - Cancel subscription

#### `/api/webhooks/usaepay` (POST)
- Receives notifications from USAePay when:
  - Recurring payments are processed
  - Payments fail
  - Automatically updates database
  - Tracks failed payments (suspends after 3 failures)

#### `/api/payments` (Enhanced)
- Now creates **recurring subscriptions** by default
- Still supports one-time payments (set `createSubscription: false`)
- Stores all transactions in database

---

## 🔄 How Recurring Billing Works

### Initial Subscription Flow:
```
1. Customer submits payment form
   ↓
2. API adds card to USAePay Customer Vault (encrypted storage)
   ↓
3. API creates recurring billing schedule in USAePay
   ↓
4. API creates Subscription record in database
   ↓
5. API creates initial PaymentTransaction record
   ↓
6. Customer is enrolled - automatic billing starts
```

### Automatic Recurring Payment Flow:
```
1. USAePay automatically charges card on schedule
   ↓
2. USAePay sends webhook to /api/webhooks/usaepay
   ↓
3. Webhook handler processes result:
   
   IF SUCCESS:
   - Updates subscription status to ACTIVE
   - Sets next billing date
   - Creates PaymentTransaction (SUCCESS)
   - Resets failed payment count
   
   IF FAILED:
   - Increments failed payment count
   - Creates PaymentTransaction (FAILED)
   - Suspends subscription after 3 failures
   - (TODO: Send email notification)
```

---

## 📊 Database Schema

### Subscription Model
```typescript
{
  id: string
  companyId: string (unique)
  
  // USAePay IDs
  usaepayCustomerId: string   // Customer Vault ID
  usaepayBillingId: string    // Recurring Billing ID
  
  // Subscription Details
  plan: 'monthly' | 'quarterly' | 'annual'
  amount: number
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'SUSPENDED' | 'PENDING'
  
  // Billing Cycle
  nextBillingDate: DateTime
  lastPaymentDate: DateTime
  billingStartDate: DateTime
  billingEndDate: DateTime? (when canceled)
  
  // Payment Method (for display)
  cardLast4: string
  cardType: string
  cardExpMonth: string
  cardExpYear: string
  
  // Tracking
  failedPaymentCount: number
  lastFailureReason: string?
}
```

### PaymentTransaction Model
```typescript
{
  id: string
  subscriptionId: string?
  companyId: string
  
  amount: number
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'REFUNDED'
  type: 'INITIAL' | 'RECURRING' | 'MANUAL' | 'REFUND'
  
  transactionId: string (USAePay transaction ID)
  authCode: string
  
  cardLast4: string
  cardType: string
  
  errorMessage: string? (if failed)
  errorCode: string?
  
  description: string
  invoice: string
  createdAt: DateTime
}
```

---

## 🎨 Frontend Integration

### Add to Billing Page

Add a subscription management section that shows:
- Current subscription status (Active, Canceled, Suspended)
- Plan details (Monthly/Quarterly/Annual)
- Next billing date
- Payment method (Visa ending in 1234)
- Transaction history

### Example UI Code Structure:

```typescript
// Fetch subscription data
const [subscription, setSubscription] = useState(null);

useEffect(() => {
  fetch(`/api/subscriptions?companyId=${companyId}`)
    .then(res => res.json())
    .then(data => setSubscription(data.subscription));
}, [companyId]);

// Display subscription info
if (subscription) {
  return (
    <div>
      <h3>Subscription Status: {subscription.status}</h3>
      <p>Plan: {subscription.plan}</p>
      <p>Amount: ${subscription.amount}</p>
      <p>Next Billing: {new Date(subscription.nextBillingDate).toLocaleDateString()}</p>
      <p>Payment Method: {subscription.cardType} ending in {subscription.cardLast4}</p>
      
      <button onClick={handleUpdateCard}>Update Payment Method</button>
      <button onClick={handleChangePlan}>Change Plan</button>
      <button onClick={handleCancelSubscription}>Cancel Subscription</button>
      
      <h4>Transaction History</h4>
      {subscription.transactions.map(txn => (
        <div key={txn.id}>
          {txn.createdAt} - ${txn.amount} - {txn.status}
        </div>
      ))}
    </div>
  );
}
```

### Update Payment Method:
```typescript
const handleUpdateCard = async () => {
  // Show payment form
  // Submit to /api/subscriptions with PUT method
  const response = await fetch('/api/subscriptions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      cardNumber: '4111111111111111',
      cardholderName: 'John Doe',
      expirationMonth: '12',
      expirationYear: '2025',
      cvv: '123',
      billingAddress: {...}
    })
  });
};
```

### Change Plan:
```typescript
const handleChangePlan = async (newPlan: 'monthly' | 'quarterly' | 'annual', newAmount: number) => {
  const response = await fetch('/api/subscriptions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyId,
      plan: newPlan,
      amount: newAmount
    })
  });
};
```

### Cancel Subscription:
```typescript
const handleCancelSubscription = async () => {
  if (confirm('Are you sure you want to cancel your subscription?')) {
    const response = await fetch(`/api/subscriptions?companyId=${companyId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      alert('Subscription canceled successfully');
      // Refresh subscription data
    }
  }
};
```

---

## ⚙️ USAePay Configuration

### 1. Configure Webhook in USAePay Dashboard
1. Log into USAePay account
2. Go to Settings → Webhooks
3. Add new webhook:
   - **URL**: `https://yourdomain.com/api/webhooks/usaepay`
   - **Events**: Select "Recurring Billing" and "Transaction"
   - **Format**: JSON
4. Save and test

### 2. Environment Variables Required
```env
USAEPAY_SOURCE_KEY=your_source_key
USAEPAY_PIN=your_pin
USAEPAY_SANDBOX=true  # Set to false for production
```

---

## 🧪 Testing

### Test in Sandbox Mode

1. Use test card numbers:
   - **Success**: 4111111111111111
   - **Decline**: 4000000000000002

2. Create test subscription:
```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "companyId": "your-company-id",
    "amount": 99.00,
    "billingPeriod": "monthly",
    "subscriptionPlan": "Business",
    "cardNumber": "4111111111111111",
    "cardholderName": "Test User",
    "expirationMonth": "12",
    "expirationYear": "2025",
    "cvv": "123",
    "billingAddress": {
      "street": "123 Test St",
      "city": "Test City",
      "state": "CA",
      "zip": "12345"
    },
    "email": "test@example.com",
    "createSubscription": true
  }'
```

3. Check database for subscription record

4. Test webhook by triggering payment in USAePay sandbox

---

## 📧 Email Notifications (TODO)

Add email notifications for:
- ✅ Subscription created
- ✅ Payment successful
- ⚠️ Payment failed
- ⚠️ Subscription suspended (after 3 failures)
- ⚠️ Card expiring soon
- ℹ️ Subscription canceled

Use your email service (e.g., SendGrid, AWS SES, Resend) to send these.

---

## 🔒 Security Notes

1. **PCI Compliance**: Card data is never stored in your database - only in USAePay's secure vault
2. **Webhook Validation**: Consider adding webhook signature verification for production
3. **HTTPS Required**: Webhooks must be sent over HTTPS in production
4. **API Rate Limiting**: Consider adding rate limiting to payment endpoints

---

## 📈 Admin Dashboard

Consider adding to Site Admin dashboard:
- List all subscriptions with status
- View failed payment attempts
- Manually retry failed payments
- View revenue metrics
- Export transaction history

---

## 🚀 Next Steps

1. ✅ Database models created
2. ✅ USAePay integration complete
3. ✅ API endpoints implemented
4. ✅ Webhook handler created
5. ⏳ Add subscription UI to customer dashboard
6. ⏳ Add email notifications
7. ⏳ Add admin subscription management
8. ⏳ Test end-to-end flow
9. ⏳ Deploy to production

---

## 💡 Usage Examples

### Check if Company Has Active Subscription
```typescript
const subscription = await prisma.subscription.findUnique({
  where: { companyId },
});

if (subscription?.status === 'ACTIVE') {
  // Allow access
} else {
  // Show payment form or suspended message
}
```

### Get Transaction History
```typescript
const transactions = await prisma.paymentTransaction.findMany({
  where: { companyId },
  orderBy: { createdAt: 'desc' },
  take: 10,
});
```

### Calculate Total Revenue
```typescript
const totalRevenue = await prisma.paymentTransaction.aggregate({
  where: {
    status: 'SUCCESS',
  },
  _sum: {
    amount: true,
  },
});
```

---

## 🐛 Troubleshooting

### Subscription Not Created
- Check USAePay credentials in `.env`
- Verify card number is valid test card
- Check console logs for detailed error messages

### Webhook Not Working
- Verify webhook URL is publicly accessible (use ngrok for local testing)
- Check USAePay webhook configuration
- Check webhook logs in console

### Failed Payments Not Tracked
- Ensure webhook is configured correctly
- Check that subscriptionId or customerId is being sent in webhook

---

## 📝 Summary

You now have a **complete recurring billing system** that:
- ✅ Securely stores payment methods
- ✅ Automatically charges customers on schedule
- ✅ Handles failed payments gracefully
- ✅ Tracks all transactions
- ✅ Allows customers to update/cancel subscriptions
- ✅ Sends webhooks for all payment events

The payment flow is now **fully automated** - customers will be charged automatically every month/quarter/year without manual intervention!

