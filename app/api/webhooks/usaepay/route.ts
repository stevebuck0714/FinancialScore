import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateBillingPeriod } from '@/lib/billing/invoiceGenerator';
import { verifyWebhookSignature } from '@/lib/usaepay';
import { addMonthsClamped, billingIntervalMonths } from '@/lib/billing/dateMath';
import { sendDataRoomPastDueNotification } from '@/lib/email';

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

    // Find primary platform subscription by customer ID or billing ID
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

    const dataRoomContext = !subscription
      ? await findDataRoomCompanyByProcessorIds({
          scheduleId: schedule_id || null,
          customerId: customer || null,
        })
      : null;

    const digitalPresenceContext = !subscription && !dataRoomContext
      ? await findDigitalPresenceCompanyByProcessorIds({
          scheduleId: schedule_id || null,
          customerId: customer || null,
        })
      : null;

    if (!subscription && !dataRoomContext && !digitalPresenceContext) {
      console.warn('[USAePay Webhook] Subscription not found for customer:', customer, 'or schedule:', schedule_id);
      // Still return 200 to acknowledge receipt
      return NextResponse.json({ received: true });
    }

    // Process based on event type and status.
    // Important: one-time setup fee charges can arrive as type='transaction' without schedule_id.
    const isRecurringEvent = type === 'recurring' || !!schedule_id;
    const isStandaloneTransaction = type === 'transaction' && !schedule_id;

    if (isStandaloneTransaction) {
      const txnId = key || refnum;
      if (subscription && txnId && subscription.setupFeeTransactionId && txnId === subscription.setupFeeTransactionId) {
        console.log('[USAePay Webhook] ℹ️ Setup fee transaction webhook received; already recorded:', txnId);
      } else if (dataRoomContext) {
        console.log('[USAePay Webhook] ℹ️ DataRoom standalone transaction ignored:', {
          companyId: dataRoomContext.company.id,
          transactionId: txnId,
          status,
          amount,
        });
      } else if (digitalPresenceContext) {
        console.log('[USAePay Webhook] ℹ️ Digital Presence standalone transaction ignored:', {
          companyId: digitalPresenceContext.company.id,
          transactionId: txnId,
          status,
          amount,
        });
      } else {
        console.log('[USAePay Webhook] ℹ️ Non-recurring transaction webhook ignored (no schedule_id):', {
          transactionId: txnId,
          status,
          amount,
        });
      }
      return NextResponse.json({ received: true });
    }

    if (isRecurringEvent && dataRoomContext) {
      const txnAmount = parseFloat(amount || '0');
      const transactionId = key || refnum || `DR-${dataRoomContext.company.id}-${Date.now()}`;
      const errMessage = error || result || 'Payment declined';

      if (status === 'Approved') {
        await handleDataRoomSuccessfulPayment(dataRoomContext, {
          transactionId,
          amount: txnAmount,
          cardLast4: cc_number,
          cardType: cardtype,
        });
      } else if (status === 'Declined' || status === 'Error') {
        await handleDataRoomFailedPayment(dataRoomContext, {
          transactionId,
          amount: txnAmount,
          errorMessage: errMessage,
          cardLast4: cc_number,
          cardType: cardtype,
        });
      }
    } else if (isRecurringEvent && digitalPresenceContext) {
      const txnAmount = parseFloat(amount || '0');
      const transactionId = key || refnum || `DP-${digitalPresenceContext.company.id}-${Date.now()}`;
      const errMessage = error || result || 'Payment declined';

      if (status === 'Approved') {
        await handleDigitalPresenceSuccessfulPayment(digitalPresenceContext, {
          transactionId,
          amount: txnAmount,
          cardLast4: cc_number,
          cardType: cardtype,
        });
      } else if (status === 'Declined' || status === 'Error') {
        await handleDigitalPresenceFailedPayment(digitalPresenceContext, {
          transactionId,
          amount: txnAmount,
          errorMessage: errMessage,
          cardLast4: cc_number,
          cardType: cardtype,
        });
      }
    } else if (isRecurringEvent && subscription) {
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
    } else if ((type === 'refund' || type === 'void') && subscription) {
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

    // Calculate next billing date (calendar-clamped).
    const now = new Date();
    const nextBillingDate = addMonthsClamped(
      now,
      billingIntervalMonths(subscription.plan as 'monthly' | 'quarterly' | 'annual')
    );

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
        serviceType: 'core',
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
          serviceType: 'core',
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
        serviceType: 'core',
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

type DataRoomCompanyContext = {
  company: {
    id: string;
    name: string;
    consultantId: string | null;
    userDefinedAllocations: any;
  };
  dataRoom: any;
};

async function findDataRoomCompanyByProcessorIds(params: {
  scheduleId: string | null;
  customerId: string | null;
}): Promise<DataRoomCompanyContext | null> {
  const { scheduleId, customerId } = params;
  if (!scheduleId && !customerId) return null;

  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; consultantId: string | null; userDefinedAllocations: any }>>`
    SELECT id, name, "consultantId", "userDefinedAllocations"
    FROM "Company"
    WHERE (
      (${scheduleId} IS NOT NULL AND ("userDefinedAllocations"->'dataRoom'->'subscription'->>'usaepayBillingId') = ${scheduleId})
      OR
      (${customerId} IS NOT NULL AND ("userDefinedAllocations"->'dataRoom'->'subscription'->>'usaepayCustomerId') = ${customerId})
    )
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const root = row.userDefinedAllocations && typeof row.userDefinedAllocations === 'object' ? row.userDefinedAllocations : {};
  const dataRoom = root?.dataRoom && typeof root.dataRoom === 'object' ? root.dataRoom : {};
  return {
    company: row,
    dataRoom,
  };
}

async function handleDataRoomSuccessfulPayment(
  context: DataRoomCompanyContext,
  paymentData: {
    transactionId: string;
    amount: number;
    cardLast4?: string;
    cardType?: string;
  },
) {
  const companyId = context.company.id;
  const now = new Date();
  const currentPlan = String(context.dataRoom?.subscription?.plan || 'monthly') as 'monthly' | 'quarterly' | 'annual';
  const plan = ['monthly', 'quarterly', 'annual'].includes(currentPlan) ? currentPlan : 'monthly';
  const nextBillingDate = addMonthsClamped(now, billingIntervalMonths(plan));
  const existingFailedCount = Number(context.dataRoom?.subscription?.failedPaymentCount || 0);

  const updatedUDA = {
    ...(context.company.userDefinedAllocations || {}),
    dataRoom: {
      ...(context.dataRoom || {}),
      enabledByAdmin: true,
      subscription: {
        ...(context.dataRoom?.subscription || {}),
        status: 'active',
        plan,
        amount: Number(paymentData.amount || context.dataRoom?.subscription?.amount || 0),
        lastPaymentDate: now.toISOString(),
        nextBillingDate: nextBillingDate.toISOString(),
        pastDueSince: null,
        graceEndsAt: null,
        lastFailureReason: null,
        failedPaymentCount: Math.max(0, existingFailedCount - 1),
      },
    },
  };

  await prisma.company.update({
    where: { id: companyId },
    data: { userDefinedAllocations: updatedUDA },
  });

  await prisma.paymentTransaction.create({
    data: {
      companyId,
      amount: Number(paymentData.amount || 0),
      status: 'SUCCESS',
      type: 'RECURRING',
      transactionId: paymentData.transactionId,
      cardLast4: paymentData.cardLast4,
      cardType: paymentData.cardType,
      description: `DataRoom ${plan} recurring payment`,
      invoice: `DATAROOM-REC-${companyId}-${Date.now()}`,
    },
  });

  const { start, end } = calculateBillingPeriod(now, plan);
  await prisma.revenueRecord.create({
    data: {
      transactionId: paymentData.transactionId,
      companyId,
      consultantId: context.company.consultantId,
      serviceType: 'dataroom',
      amount: Number(paymentData.amount || 0),
      paymentDate: now,
      paymentStatus: 'received',
      subscriptionPlan: plan,
      billingPeriodStart: start,
      billingPeriodEnd: end,
      notes: `DataRoom recurring payment - ${context.company.name}`,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      companyId,
      eventType: 'dataroom_payment_received',
      newValue: paymentData.transactionId,
      notes: `DataRoom recurring payment received: $${Number(paymentData.amount || 0).toFixed(2)} (${plan})`,
    },
  });
}

async function handleDataRoomFailedPayment(
  context: DataRoomCompanyContext,
  paymentData: {
    transactionId?: string;
    amount: number;
    errorMessage?: string;
    cardLast4?: string;
    cardType?: string;
  },
) {
  const companyId = context.company.id;
  const now = new Date();
  const currentPlan = String(context.dataRoom?.subscription?.plan || 'monthly') as 'monthly' | 'quarterly' | 'annual';
  const plan = ['monthly', 'quarterly', 'annual'].includes(currentPlan) ? currentPlan : 'monthly';
  const failedCount = Number(context.dataRoom?.subscription?.failedPaymentCount || 0) + 1;
  const pastDueSince = context.dataRoom?.subscription?.pastDueSince || now.toISOString();
  const graceEndsAt = new Date(now);
  graceEndsAt.setDate(graceEndsAt.getDate() + 30);

  const updatedUDA = {
    ...(context.company.userDefinedAllocations || {}),
    dataRoom: {
      ...(context.dataRoom || {}),
      enabledByAdmin: true,
      subscription: {
        ...(context.dataRoom?.subscription || {}),
        status: 'past_due',
        plan,
        amount: Number(context.dataRoom?.subscription?.amount || paymentData.amount || 0),
        pastDueSince,
        graceEndsAt: graceEndsAt.toISOString(),
        lastFailureReason: paymentData.errorMessage || 'Payment declined',
        failedPaymentCount: failedCount,
      },
    },
  };

  await prisma.company.update({
    where: { id: companyId },
    data: { userDefinedAllocations: updatedUDA },
  });

  await prisma.paymentTransaction.create({
    data: {
      companyId,
      amount: Number(paymentData.amount || 0),
      status: 'FAILED',
      type: 'RECURRING',
      transactionId: paymentData.transactionId,
      cardLast4: paymentData.cardLast4,
      cardType: paymentData.cardType,
      errorMessage: paymentData.errorMessage || 'DataRoom recurring payment failed',
      description: `Failed DataRoom ${plan} recurring payment`,
      invoice: `DATAROOM-FAIL-${companyId}-${Date.now()}`,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      companyId,
      eventType: 'dataroom_payment_failed',
      newValue: paymentData.transactionId || 'unknown',
      notes: `DataRoom payment failed: ${paymentData.errorMessage || 'Payment declined'}`,
    },
  });

  const primaryRecipients = await prisma.user.findMany({
    where: {
      companyId,
      userType: 'COMPANY',
      OR: [{ companyRole: 'admin' }, { isPrimaryContact: true }],
    },
    select: { email: true },
  });

  const fallbackRecipients =
    primaryRecipients.length === 0
      ? await prisma.user.findMany({
          where: { companyId, userType: 'COMPANY' },
          select: { email: true },
        })
      : [];

  const recipients = (primaryRecipients.length > 0 ? primaryRecipients : fallbackRecipients)
    .map((u) => u.email)
    .filter(Boolean);

  if (recipients.length > 0) {
    await sendDataRoomPastDueNotification({
      recipients,
      companyName: context.company.name,
      companyId,
      plan,
      amount: Number(context.dataRoom?.subscription?.amount || paymentData.amount || 0),
      graceDays: 30,
      reason: paymentData.errorMessage || 'Payment declined by processor',
    });
  }
}

type DigitalPresenceCompanyContext = {
  company: {
    id: string;
    name: string;
    consultantId: string | null;
    userDefinedAllocations: any;
  };
  digitalPresence: any;
};

async function findDigitalPresenceCompanyByProcessorIds(params: {
  scheduleId: string | null;
  customerId: string | null;
}): Promise<DigitalPresenceCompanyContext | null> {
  const { scheduleId, customerId } = params;
  if (!scheduleId && !customerId) return null;

  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; consultantId: string | null; userDefinedAllocations: any }>>`
    SELECT id, name, "consultantId", "userDefinedAllocations"
    FROM "Company"
    WHERE (
      (${scheduleId} IS NOT NULL AND ("userDefinedAllocations"->'digitalPresence'->'subscription'->>'usaepayBillingId') = ${scheduleId})
      OR
      (${customerId} IS NOT NULL AND ("userDefinedAllocations"->'digitalPresence'->'subscription'->>'usaepayCustomerId') = ${customerId})
    )
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const root = row.userDefinedAllocations && typeof row.userDefinedAllocations === 'object' ? row.userDefinedAllocations : {};
  const digitalPresence = root?.digitalPresence && typeof root.digitalPresence === 'object' ? root.digitalPresence : {};
  return {
    company: row,
    digitalPresence,
  };
}

async function handleDigitalPresenceSuccessfulPayment(
  context: DigitalPresenceCompanyContext,
  paymentData: {
    transactionId: string;
    amount: number;
    cardLast4?: string;
    cardType?: string;
  },
) {
  const companyId = context.company.id;
  const now = new Date();
  const currentPlan = String(context.digitalPresence?.subscription?.plan || 'monthly') as 'monthly' | 'quarterly' | 'annual';
  const plan = ['monthly', 'quarterly', 'annual'].includes(currentPlan) ? currentPlan : 'monthly';
  const nextBillingDate = addMonthsClamped(now, billingIntervalMonths(plan));
  const existingFailedCount = Number(context.digitalPresence?.subscription?.failedPaymentCount || 0);

  const updatedUDA = {
    ...(context.company.userDefinedAllocations || {}),
    digitalPresence: {
      ...(context.digitalPresence || {}),
      enabledByAdmin: true,
      subscription: {
        ...(context.digitalPresence?.subscription || {}),
        status: 'active',
        plan,
        amount: Number(paymentData.amount || context.digitalPresence?.subscription?.amount || 0),
        lastPaymentDate: now.toISOString(),
        nextBillingDate: nextBillingDate.toISOString(),
        pastDueSince: null,
        graceEndsAt: null,
        lastFailureReason: null,
        failedPaymentCount: Math.max(0, existingFailedCount - 1),
      },
    },
  };

  await prisma.company.update({
    where: { id: companyId },
    data: { userDefinedAllocations: updatedUDA },
  });

  await prisma.paymentTransaction.create({
    data: {
      companyId,
      amount: Number(paymentData.amount || 0),
      status: 'SUCCESS',
      type: 'RECURRING',
      transactionId: paymentData.transactionId,
      cardLast4: paymentData.cardLast4,
      cardType: paymentData.cardType,
      description: `Digital Presence ${plan} recurring payment`,
      invoice: `DIGITAL-PRESENCE-REC-${companyId}-${Date.now()}`,
    },
  });

  const { start, end } = calculateBillingPeriod(now, plan);
  await prisma.revenueRecord.create({
    data: {
      transactionId: paymentData.transactionId,
      companyId,
      consultantId: context.company.consultantId,
      serviceType: 'digital_presence',
      amount: Number(paymentData.amount || 0),
      paymentDate: now,
      paymentStatus: 'received',
      subscriptionPlan: plan,
      billingPeriodStart: start,
      billingPeriodEnd: end,
      notes: `Digital Presence recurring payment - ${context.company.name}`,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      companyId,
      eventType: 'digital_presence_payment_received',
      newValue: paymentData.transactionId,
      notes: `Digital Presence recurring payment received: $${Number(paymentData.amount || 0).toFixed(2)} (${plan})`,
    },
  });
}

async function handleDigitalPresenceFailedPayment(
  context: DigitalPresenceCompanyContext,
  paymentData: {
    transactionId?: string;
    amount: number;
    errorMessage?: string;
    cardLast4?: string;
    cardType?: string;
  },
) {
  const companyId = context.company.id;
  const now = new Date();
  const currentPlan = String(context.digitalPresence?.subscription?.plan || 'monthly') as 'monthly' | 'quarterly' | 'annual';
  const plan = ['monthly', 'quarterly', 'annual'].includes(currentPlan) ? currentPlan : 'monthly';
  const failedCount = Number(context.digitalPresence?.subscription?.failedPaymentCount || 0) + 1;
  const pastDueSince = context.digitalPresence?.subscription?.pastDueSince || now.toISOString();
  const graceEndsAt = new Date(now);
  graceEndsAt.setDate(graceEndsAt.getDate() + 30);

  const updatedUDA = {
    ...(context.company.userDefinedAllocations || {}),
    digitalPresence: {
      ...(context.digitalPresence || {}),
      enabledByAdmin: true,
      subscription: {
        ...(context.digitalPresence?.subscription || {}),
        status: 'past_due',
        plan,
        amount: Number(context.digitalPresence?.subscription?.amount || paymentData.amount || 0),
        pastDueSince,
        graceEndsAt: graceEndsAt.toISOString(),
        lastFailureReason: paymentData.errorMessage || 'Payment declined',
        failedPaymentCount: failedCount,
      },
    },
  };

  await prisma.company.update({
    where: { id: companyId },
    data: { userDefinedAllocations: updatedUDA },
  });

  await prisma.paymentTransaction.create({
    data: {
      companyId,
      amount: Number(paymentData.amount || 0),
      status: 'FAILED',
      type: 'RECURRING',
      transactionId: paymentData.transactionId,
      cardLast4: paymentData.cardLast4,
      cardType: paymentData.cardType,
      errorMessage: paymentData.errorMessage || 'Digital Presence recurring payment failed',
      description: `Failed Digital Presence ${plan} recurring payment`,
      invoice: `DIGITAL-PRESENCE-FAIL-${companyId}-${Date.now()}`,
    },
  });

  if (paymentData.transactionId) {
    const { start, end } = calculateBillingPeriod(now, plan);
    await prisma.revenueRecord.create({
      data: {
        transactionId: paymentData.transactionId,
        companyId,
        consultantId: context.company.consultantId,
        serviceType: 'digital_presence',
        amount: Number(paymentData.amount || 0),
        paymentDate: now,
        paymentStatus: 'failed',
        subscriptionPlan: plan,
        billingPeriodStart: start,
        billingPeriodEnd: end,
        notes: `Digital Presence payment failed: ${paymentData.errorMessage || 'Payment declined'}`,
      },
    });
  }

  await prisma.subscriptionEvent.create({
    data: {
      companyId,
      eventType: 'digital_presence_payment_failed',
      newValue: paymentData.transactionId || 'unknown',
      notes: `Digital Presence payment failed: ${paymentData.errorMessage || 'Payment declined'}`,
    },
  });
}

// GET endpoint for webhook verification (optional)
export async function GET() {
  return NextResponse.json({
    message: 'USAePay Webhook Endpoint',
    status: 'Active',
    note: 'Configure this URL in your USAePay account settings',
  });
}

