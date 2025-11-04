import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Webhook handler for USAePay notifications
 * 
 * USAePay sends POST requests to this endpoint when:
 * - Recurring payments are processed
 * - Payments fail
 * - Billing schedules are updated
 * 
 * Webhook URL to configure in USAePay: https://yourdomain.com/api/webhooks/usaepay
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[USAePay Webhook] Received:', JSON.stringify(body, null, 2));

    // USAePay webhook data structure
    const {
      key, // Transaction or billing schedule ID
      type, // Event type: 'recurring', 'transaction', etc.
      customer, // Customer vault ID
      amount,
      status, // 'Approved', 'Declined', 'Error'
      result, // Result message
      error,
      authcode,
      refnum, // Transaction reference number
      cc_number, // Last 4 digits
      cardtype,
      schedule_id, // Recurring billing ID
    } = body;

    // Find subscription by customer ID or billing ID
    let subscription = null;
    
    if (customer) {
      subscription = await prisma.subscription.findFirst({
        where: { usaepayCustomerId: customer },
      });
    }
    
    if (!subscription && schedule_id) {
      subscription = await prisma.subscription.findFirst({
        where: { usaepayBillingId: schedule_id },
      });
    }

    if (!subscription) {
      console.warn('[USAePay Webhook] Subscription not found for customer:', customer, 'or schedule:', schedule_id);
      // Still return 200 to acknowledge receipt
      return NextResponse.json({ received: true });
    }

    // Process based on event type and status
    if (type === 'recurring' || type === 'transaction') {
      if (status === 'Approved') {
        // Successful payment
        await handleSuccessfulPayment(subscription, {
          transactionId: key || refnum,
          amount: parseFloat(amount || '0'),
          authCode: authcode,
          cardLast4: cc_number,
          cardType: cardtype,
        });
      } else if (status === 'Declined' || status === 'Error') {
        // Failed payment
        await handleFailedPayment(subscription, {
          transactionId: key || refnum,
          amount: parseFloat(amount || '0'),
          errorMessage: error || result,
          cardLast4: cc_number,
          cardType: cardtype,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[USAePay Webhook] Error:', error);
    // Still return 200 to prevent USAePay from retrying
    return NextResponse.json({ received: true, error: 'Processing error' });
  }
}

// Helper: Handle successful recurring payment
async function handleSuccessfulPayment(
  subscription: any,
  paymentData: {
    transactionId: string;
    amount: number;
    authCode?: string;
    cardLast4?: string;
    cardType?: string;
  }
) {
  try {
    // Calculate next billing date
    const now = new Date();
    const nextBillingDate = new Date(now);
    if (subscription.plan === 'monthly') {
      nextBillingDate.setMonth(now.getMonth() + 1);
    } else if (subscription.plan === 'quarterly') {
      nextBillingDate.setMonth(now.getMonth() + 3);
    } else if (subscription.plan === 'annual') {
      nextBillingDate.setFullYear(now.getFullYear() + 1);
    }

    // Update subscription
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        lastPaymentDate: now,
        nextBillingDate,
        failedPaymentCount: 0,
        lastFailureReason: null,
      },
    });

    // Create transaction record
    await prisma.paymentTransaction.create({
      data: {
        subscriptionId: subscription.id,
        companyId: subscription.companyId,
        amount: paymentData.amount,
        status: 'SUCCESS',
        type: 'RECURRING',
        transactionId: paymentData.transactionId,
        authCode: paymentData.authCode,
        cardLast4: paymentData.cardLast4,
        cardType: paymentData.cardType,
        description: `Recurring ${subscription.plan} payment`,
        invoice: `REC-${subscription.companyId}-${Date.now()}`,
      },
    });

    console.log('[USAePay Webhook] ✅ Successful payment recorded for subscription:', subscription.id);
  } catch (error) {
    console.error('[USAePay Webhook] Error recording successful payment:', error);
    throw error;
  }
}

// Helper: Handle failed recurring payment
async function handleFailedPayment(
  subscription: any,
  paymentData: {
    transactionId?: string;
    amount: number;
    errorMessage?: string;
    cardLast4?: string;
    cardType?: string;
  }
) {
  try {
    const failedCount = subscription.failedPaymentCount + 1;
    
    // Determine subscription status based on failure count
    let newStatus = subscription.status;
    if (failedCount >= 3) {
      newStatus = 'SUSPENDED'; // Suspend after 3 failures
    }

    // Update subscription
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus,
        failedPaymentCount: failedCount,
        lastFailureReason: paymentData.errorMessage || 'Payment declined',
      },
    });

    // Create failed transaction record
    await prisma.paymentTransaction.create({
      data: {
        subscriptionId: subscription.id,
        companyId: subscription.companyId,
        amount: paymentData.amount,
        status: 'FAILED',
        type: 'RECURRING',
        transactionId: paymentData.transactionId,
        cardLast4: paymentData.cardLast4,
        cardType: paymentData.cardType,
        errorMessage: paymentData.errorMessage,
        description: `Failed ${subscription.plan} payment`,
        invoice: `FAIL-${subscription.companyId}-${Date.now()}`,
      },
    });

    console.log('[USAePay Webhook] ❌ Failed payment recorded for subscription:', subscription.id, 'Failure count:', failedCount);
    
    // TODO: Send email notification to customer about failed payment
  } catch (error) {
    console.error('[USAePay Webhook] Error recording failed payment:', error);
    throw error;
  }
}

// GET endpoint for webhook verification (optional)
export async function GET() {
  return NextResponse.json({
    message: 'USAePay Webhook Endpoint',
    status: 'Active',
    note: 'Configure this URL in your USAePay account settings',
  });
}

