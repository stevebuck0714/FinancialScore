import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateBillingPeriod } from '@/lib/billing/invoiceGenerator';
import { verifyWebhookSignature } from '@/lib/usaepay';

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

    // Verify webhook signature for security
    const signature = request.headers.get('x-usaepay-signature');
    const webhookSecret = process.env.USAEPAY_WEBHOOK_SECRET;
    
    if (!verifyWebhookSignature(body, signature || undefined, webhookSecret)) {
      console.error('[USAePay Webhook] ⚠️ Invalid signature - webhook rejected');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

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
    } else if (type === 'refund' || type === 'void') {
      // Refund or void transaction
      await handleRefund(subscription, {
        transactionId: key || refnum,
        amount: parseFloat(amount || '0'),
        notes: result || error,
      });
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
    // Get company details to find consultant
    const company = await prisma.company.findUnique({
      where: { id: subscription.companyId },
      select: {
        id: true,
        name: true,
        consultantId: true,
        selectedSubscriptionPlan: true
      }
    });

    if (!company) {
      console.error('[USAePay Webhook] Company not found:', subscription.companyId);
      return;
    }

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

    // Calculate billing period
    const planType = subscription.plan as 'monthly' | 'quarterly' | 'annual';
    const { start, end } = calculateBillingPeriod(now, planType);

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

    // 🆕 CREATE REVENUE RECORD for revenue tracking & consultant payables
    await prisma.revenueRecord.create({
      data: {
        transactionId: paymentData.transactionId,
        companyId: company.id,
        consultantId: company.consultantId, // NULL for direct businesses
        amount: paymentData.amount,
        paymentDate: now,
        paymentStatus: 'received',
        subscriptionPlan: subscription.plan,
        billingPeriodStart: start,
        billingPeriodEnd: end,
        notes: `Automatic payment via USAePay - ${company.name}`
      }
    });

    // Log event
    await prisma.subscriptionEvent.create({
      data: {
        companyId: company.id,
        eventType: 'payment_received',
        newValue: paymentData.transactionId,
        notes: `Payment received: $${paymentData.amount} for ${subscription.plan} plan`
      }
    });

    console.log('[USAePay Webhook] ✅ Successful payment recorded for subscription:', subscription.id);
    console.log('[USAePay Webhook] 💰 Revenue record created for', company.consultantId ? 'consultant company' : 'direct business');
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
    // Get company details
    const company = await prisma.company.findUnique({
      where: { id: subscription.companyId },
      select: {
        id: true,
        name: true,
        consultantId: true
      }
    });

    if (!company) {
      console.error('[USAePay Webhook] Company not found:', subscription.companyId);
      return;
    }

    const failedCount = subscription.failedPaymentCount + 1;
    
    // Determine subscription status based on failure count
    let newStatus = subscription.status;
    if (failedCount >= 3) {
      newStatus = 'SUSPENDED'; // Suspend after 3 failures
    }

    const now = new Date();
    const planType = subscription.plan as 'monthly' | 'quarterly' | 'annual';
    const { start, end } = calculateBillingPeriod(now, planType);

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

    // 🆕 CREATE REVENUE RECORD with failed status for tracking
    if (paymentData.transactionId) {
      await prisma.revenueRecord.create({
        data: {
          transactionId: paymentData.transactionId,
          companyId: company.id,
          consultantId: company.consultantId,
          amount: paymentData.amount,
          paymentDate: now,
          paymentStatus: 'failed',
          subscriptionPlan: subscription.plan,
          billingPeriodStart: start,
          billingPeriodEnd: end,
          notes: `Failed payment: ${paymentData.errorMessage || 'Payment declined'}`
        }
      });
    }

    // Log event
    await prisma.subscriptionEvent.create({
      data: {
        companyId: company.id,
        eventType: 'payment_failed',
        newValue: paymentData.transactionId || 'unknown',
        notes: `Payment failed (attempt ${failedCount}): ${paymentData.errorMessage || 'Payment declined'}`
      }
    });

    console.log('[USAePay Webhook] ❌ Failed payment recorded for subscription:', subscription.id, 'Failure count:', failedCount);
    
    // TODO: Send email notification to customer about failed payment
  } catch (error) {
    console.error('[USAePay Webhook] Error recording failed payment:', error);
    throw error;
  }
}

// Helper: Handle refund
async function handleRefund(
  subscription: any,
  refundData: {
    transactionId: string;
    amount: number;
    notes?: string;
  }
) {
  try {
    // Get company details
    const company = await prisma.company.findUnique({
      where: { id: subscription.companyId },
      select: {
        id: true,
        name: true,
        consultantId: true
      }
    });

    if (!company) {
      console.error('[USAePay Webhook] Company not found:', subscription.companyId);
      return;
    }

    const now = new Date();
    const planType = subscription.plan as 'monthly' | 'quarterly' | 'annual';
    const { start, end } = calculateBillingPeriod(now, planType);

    // Create refund transaction record
    await prisma.paymentTransaction.create({
      data: {
        subscriptionId: subscription.id,
        companyId: subscription.companyId,
        amount: refundData.amount,
        status: 'REFUNDED',
        type: 'REFUND',
        transactionId: refundData.transactionId,
        description: `Refund for ${subscription.plan} payment`,
        errorMessage: refundData.notes,
      },
    });

    // Create revenue record with refunded status
    await prisma.revenueRecord.create({
      data: {
        transactionId: `REFUND-${refundData.transactionId}`,
        companyId: company.id,
        consultantId: company.consultantId,
        amount: -refundData.amount, // Negative amount for refund
        paymentDate: now,
        paymentStatus: 'refunded',
        subscriptionPlan: subscription.plan,
        billingPeriodStart: start,
        billingPeriodEnd: end,
        notes: `Refund: ${refundData.notes || 'Payment refunded'}`
      }
    });

    // Log event
    await prisma.subscriptionEvent.create({
      data: {
        companyId: company.id,
        eventType: 'payment_refunded',
        newValue: refundData.transactionId,
        notes: `Payment refunded: $${refundData.amount}`
      }
    });

    console.log('[USAePay Webhook] 💸 Refund recorded for subscription:', subscription.id);
  } catch (error) {
    console.error('[USAePay Webhook] Error recording refund:', error);
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

