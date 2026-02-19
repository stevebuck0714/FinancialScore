import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { createRecurringBilling, getCustomerPaymentMethod } from '@/lib/usaepay';
import { addMonthsClamped, billingIntervalMonths } from '@/lib/billing/dateMath';

// POST /api/subscriptions/schedule
// Idempotent: creates the recurring billing schedule if missing.
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = body?.companyId as string | undefined;

    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company ID required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'Subscription not found' }, { status: 404 });
    }

    if (subscription.usaepayBillingId) {
      return NextResponse.json({ success: true, subscription, scheduled: true });
    }

    if (!subscription.usaepayCustomerId) {
      return NextResponse.json(
        { success: false, error: 'Subscription is missing USAePay customer ID; cannot schedule recurring billing' },
        { status: 400 }
      );
    }

    const schedule = subscription.plan as 'monthly' | 'quarterly' | 'annual';
    if (!['monthly', 'quarterly', 'annual'].includes(schedule)) {
      return NextResponse.json(
        { success: false, error: `Invalid subscription plan: ${subscription.plan}` },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    const anchorDate = subscription.setupFeePaidAt || subscription.billingAnchorDate || new Date();
    const firstRecurringBillDate =
      subscription.firstRecurringBillDate || addMonthsClamped(anchorDate, billingIntervalMonths(schedule));

    const pm = await getCustomerPaymentMethod(subscription.usaepayCustomerId);
    if (!pm.success || !pm.paymentMethodKey) {
      await prisma.subscriptionEvent.create({
        data: {
          companyId,
          eventType: 'recurring_schedule_failed',
          newValue: 'none',
          notes: `Retry failed: could not retrieve payment method from vault (${pm.error || 'unknown error'})`,
        },
      });
      return NextResponse.json(
        { success: false, error: pm.error || 'Failed to retrieve payment method' },
        { status: 400 }
      );
    }

    const billingResult = await createRecurringBilling({
      customerId: subscription.usaepayCustomerId,
      paymentMethodId: pm.paymentMethodKey,
      amount: subscription.amount,
      schedule,
      description: `${company?.name || 'Company'} - ${schedule} subscription`,
      startDate: firstRecurringBillDate,
    });

    if (!billingResult.success || !billingResult.billingId) {
      await prisma.subscriptionEvent.create({
        data: {
          companyId,
          eventType: 'recurring_schedule_failed',
          newValue: 'none',
          notes: `Retry failed: schedule creation error (${billingResult.error || 'unknown error'})`,
        },
      });
      return NextResponse.json(
        { success: false, error: billingResult.error || 'Failed to create recurring schedule' },
        { status: 400 }
      );
    }

    const updated = await prisma.subscription.update({
      where: { companyId },
      data: {
        usaepayBillingId: billingResult.billingId,
        status: 'ACTIVE',
        billingAnchorDate: subscription.billingAnchorDate || anchorDate,
        firstRecurringBillDate,
        nextBillingDate: billingResult.nextBillingDate || firstRecurringBillDate,
        lastFailureReason: null,
      },
    });

    await prisma.subscriptionEvent.create({
      data: {
        companyId,
        eventType: 'recurring_scheduled',
        newValue: billingResult.billingId,
        notes: `Recurring scheduled via retry: ${schedule} $${subscription.amount.toFixed(2)}`,
      },
    });

    return NextResponse.json({ success: true, subscription: updated, scheduled: true });
  } catch (error) {
    console.error('Recurring schedule retry error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to schedule recurring billing',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

