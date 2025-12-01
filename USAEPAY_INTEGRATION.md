# USAePay Integration Guide - Revenue Tracking System

## Overview

This application integrates with USAePay to process subscription payments and automatically track revenue for the revenue sharing system. When customers pay their subscription fees, the system:

1. Records the payment as a **Revenue Record**
2. Links it to the consultant (if applicable) or marks as direct business
3. Calculates revenue share for consultant payables
4. Tracks payment status (received, failed, refunded)

## Revenue Sharing Model

### How It Works

**For Consultant Companies:**
- Customer pays subscription → You receive payment via USAePay
- Revenue record created and linked to consultant
- At month end, calculate consultant's share (default 50%, customizable)
- Generate payable to consultant
- You keep the platform share

**For Direct Businesses:**
- Customer pays subscription → You receive payment via USAePay
- Revenue record created with NO consultant link
- 100% of revenue stays with platform
- No payable generated

### Example Calculation

```
Consultant John has 3 companies that paid this month:
- Company A: $195 (monthly)
- Company B: $500 (quarterly)  
- Company C: $195 (monthly)

Total from John's companies: $890
John's revenue share: 50%
Amount owed to John: $445
Platform keeps: $445
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# USAePay API Credentials
USAEPAY_API_KEY=your_api_key_here
USAEPAY_PIN=your_pin_here
USAEPAY_SOURCE_KEY=your_source_key_here
USAEPAY_SANDBOX=true  # Set to false for production

# Webhook Security (Recommended)
USAEPAY_WEBHOOK_SECRET=your_webhook_secret_here
```

### USAePay Dashboard Setup

1. **Login to USAePay Dashboard**
   - Sandbox: https://sandbox.usaepay.com
   - Production: https://secure.usaepay.com

2. **Configure Webhook URL**
   - Navigate to: Settings → Webhooks
   - Add webhook URL: `https://yourdomain.com/api/webhooks/usaepay`
   - Select events:
     - ✅ Recurring Payment Approved
     - ✅ Recurring Payment Declined
     - ✅ Transaction Refunded
     - ✅ Transaction Voided

3. **Enable Webhook Security** (Recommended)
   - Generate a webhook secret in USAePay
   - Add it to your `.env` as `USAEPAY_WEBHOOK_SECRET`
   - USAePay will sign all webhooks with this secret

## Webhook Flow

### 1. Successful Payment
```
Customer payment processed → USAePay sends webhook → 
→ Update Subscription status
→ Create PaymentTransaction record
→ 🆕 Create RevenueRecord (linked to consultant or direct)
→ Log SubscriptionEvent
→ Send confirmation email (optional)
```

### 2. Failed Payment
```
Payment fails → USAePay sends webhook →
→ Increment failed payment count
→ Suspend subscription after 3 failures
→ Create failed PaymentTransaction
→ 🆕 Create RevenueRecord with 'failed' status
→ Log SubscriptionEvent
→ Send failure notification (optional)
```

### 3. Refund
```
Admin processes refund → USAePay sends webhook →
→ Create refund PaymentTransaction
→ 🆕 Create RevenueRecord with negative amount
→ Log SubscriptionEvent
→ Adjust revenue calculations automatically
```

## Revenue & Payables Workflow

### Monthly Process

**Step 1: Collect Revenue (Automated via Webhooks)**
- USAePay charges customers' credit cards automatically
- Webhooks create revenue records
- Revenue is automatically categorized (consultant vs. direct)

**Step 2: Generate Consultant Payables**
- Navigate to: Site Administration → 💰 Revenue & Payables → Consultant Payables tab
- Click "📊 Generate Current Month Payables"
- System calculates each consultant's share
- Creates payable records

**Step 3: Review Payables**
- View detailed breakdown by consultant
- See which companies contributed to their total
- Verify calculations (total revenue × share %)

**Step 4: Pay Consultants**
- Mark payables as paid
- Enter payment method (check, ACH, wire)
- Enter payment reference (check #, transaction ID)
- System tracks for 1099 reporting

**Step 5: Generate Reports**
- Revenue by Consultant report
- Export to CSV for accounting
- Track year-to-date for tax filing

## Consultant Revenue Share

### Setting Custom Revenue Share

Each consultant can have a different revenue share percentage:

1. **Via Site Admin (Future Enhancement):**
   - Navigate to Consultants tab
   - Edit consultant
   - Set custom "Revenue Share %" (default is 50%)

2. **Via Database:**
   ```sql
   UPDATE "Consultant" 
   SET "revenueSharePercentage" = 70.0 
   WHERE id = 'consultant_id_here';
   ```

### Revenue Share Examples

| Consultant | Share % | Company Revenue | Consultant Gets | Platform Keeps |
|------------|---------|-----------------|-----------------|----------------|
| John       | 50%     | $1,000          | $500            | $500           |
| Jane       | 60%     | $1,000          | $600            | $400           |
| Bob        | 70%     | $1,000          | $700            | $300           |
| Direct     | 0%      | $1,000          | $0              | $1,000         |

## Data Tables

### RevenueRecord
Tracks every payment received from companies:
- `transactionId` - USAePay transaction ID
- `companyId` - Which company paid
- `consultantId` - Their consultant (NULL if direct business)
- `amount` - Payment amount
- `paymentStatus` - received, failed, refunded
- `subscriptionPlan` - monthly, quarterly, annual
- `billingPeriodStart/End` - Period covered by payment

### ConsultantPayable
Tracks what you owe consultants:
- `consultantId` - Which consultant
- `periodStart/End` - Time period
- `totalCompanyRevenue` - Sum of their companies' payments
- `revenueSharePercentage` - Their share % (snapshot at time)
- `payableAmount` - What you owe them
- `platformAmount` - What you keep
- `status` - pending, paid, on_hold
- `paidDate` - When you paid them
- `paymentMethod` - How you paid (check, ACH, wire)

## Testing

### Test in Sandbox Mode

1. **Set sandbox mode:**
   ```env
   USAEPAY_SANDBOX=true
   ```

2. **Use test cards:**
   - Success: `4111111111111111`
   - Decline: `4000000000000002`

3. **Trigger webhooks manually:**
   - Use USAePay sandbox dashboard to simulate recurring payments
   - Check console logs for webhook processing
   - Verify revenue records are created

### Verify Integration

```bash
# Check webhook endpoint is accessible
curl https://yourdomain.com/api/webhooks/usaepay

# Should return:
{
  "message": "USAePay Webhook Endpoint",
  "status": "Active",
  "note": "Configure this URL in your USAePay account settings"
}
```

## Troubleshooting

### Webhooks Not Received

1. Check webhook URL is configured in USAePay
2. Verify URL is publicly accessible (not localhost)
3. Check USAePay webhook logs for errors
4. Verify SSL certificate is valid (production)

### Revenue Records Not Created

1. Check server logs for webhook errors
2. Verify Prisma schema is up to date: `npx prisma db push`
3. Ensure company has `consultantId` set (or NULL for direct)
4. Check subscription exists in database

### Signature Verification Failing

1. Verify `USAEPAY_WEBHOOK_SECRET` matches USAePay settings
2. Check webhook signature header name: `x-usaepay-signature`
3. Temporarily disable verification in sandbox for testing

## Security Best Practices

✅ **Always verify webhook signatures in production**
✅ **Use HTTPS for webhook endpoints**
✅ **Log all webhook events for audit trail**
✅ **Monitor for unusual patterns (high refund rate, etc.)**
✅ **Set up alerts for failed payments**

## Next Steps

### Future Enhancements

1. **Automated Email Notifications:**
   - Payment confirmation emails
   - Failed payment alerts
   - Consultant monthly statement emails

2. **1099 Tax Reporting:**
   - Export consultant earnings for year
   - Generate 1099-MISC forms
   - Track by consultant tax ID

3. **Automated Payables:**
   - Auto-generate consultant payables monthly
   - Scheduled job (cron) on 1st of month
   - Auto-send payment notifications

4. **Advanced Analytics:**
   - Revenue forecasting
   - Churn analysis
   - Consultant performance metrics

## Support

For USAePay API documentation:
- API Docs: https://docs.usaepay.com
- Sandbox: https://sandbox.usaepay.com
- Support: support@usaepay.com

