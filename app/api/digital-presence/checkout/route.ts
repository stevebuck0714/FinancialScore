import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { processPayment, createRecurringBilling, getCustomerPaymentMethod } from '@/lib/usaepay';
import { addMonthsClamped, billingIntervalMonths } from '@/lib/billing/dateMath';
import { calculateBillingPeriod } from '@/lib/billing/invoiceGenerator';

type DigitalPresencePlan = 'monthly' | 'quarterly' | 'annual';

function getSnapshot(raw: unknown): any {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const {
      companyId,
      plan,
      cardNumber,
      cardholderName,
      expirationMonth,
      expirationYear,
      cvv,
      billingAddress,
    } = body || {};

    if (!companyId || !plan) {
      return NextResponse.json({ success: false, error: 'Company ID and plan are required' }, { status: 400 });
    }
    if (!['monthly', 'quarterly', 'annual'].includes(plan)) {
      return NextResponse.json({ success: false, error: 'Invalid plan' }, { status: 400 });
    }
    if (!cardNumber || !cardholderName || !expirationMonth || !expirationYear || !cvv) {
      return NextResponse.json({ success: false, error: 'Missing card information' }, { status: 400 });
    }
    if (!billingAddress?.street || !billingAddress?.city || !billingAddress?.state || !billingAddress?.zip) {
      return NextResponse.json({ success: false, error: 'Missing billing address' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden: Access denied' }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        consultantId: true,
        userDefinedAllocations: true,
      },
    });

    if (!company) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 });
    }

    const base = getSnapshot(company.userDefinedAllocations);
    const existingDigitalPresence = getSnapshot(base.digitalPresence);
    const existingSub = getSnapshot(existingDigitalPresence.subscription);
    const existingPricing = getSnapshot(existingDigitalPresence.pricing);

    if (!existingDigitalPresence.enabledByAdmin) {
      return NextResponse.json({ success: false, error: 'Digital Presence is not enabled for this company' }, { status: 400 });
    }

    if (String(existingSub.status || '').toLowerCase() === 'active' && existingSub.usaepayBillingId) {
      return NextResponse.json({ success: false, error: 'Digital Presence subscription is already active' }, { status: 409 });
    }

    const selectedPlan = plan as DigitalPresencePlan;
    let amount =
      selectedPlan === 'monthly'
        ? Number(existingPricing.monthly ?? 0)
        : selectedPlan === 'quarterly'
          ? Number(existingPricing.quarterly ?? 0)
          : Number(existingPricing.annual ?? 0);

    if (!Number.isFinite(amount) || amount < 0) {
      amount = 0;
    }

    if (amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Digital Presence is configured for free access; payment is not required' },
        { status: 400 },
      );
    }

    const now = new Date();
    const firstRecurringBillDate = addMonthsClamped(now, billingIntervalMonths(selectedPlan));

    const initialPayment = await processPayment({
      amount,
      cardNumber,
      cardholderName,
      expirationMonth,
      expirationYear,
      cvv,
      billingAddress: {
        street: billingAddress.street,
        city: billingAddress.city,
        state: billingAddress.state,
        zip: billingAddress.zip,
      },
      description: `${company.name} - Digital Presence ${selectedPlan} add-on`,
      invoice: `DIGITAL-PRESENCE-${companyId}-${Date.now()}`,
      customerId: `${companyId}-digital-presence`,
      companyName: company.name,
      saveCustomer: true,
    });

    if (!initialPayment.success || !initialPayment.custkey) {
      return NextResponse.json(
        { success: false, error: initialPayment.error || 'Failed to process initial Digital Presence payment' },
        { status: 400 },
      );
    }

    const paymentMethodResult = await getCustomerPaymentMethod(initialPayment.custkey);
    if (!paymentMethodResult.success || !paymentMethodResult.paymentMethodKey) {
      return NextResponse.json({ success: false, error: paymentMethodResult.error || 'Failed to load payment method' }, { status: 400 });
    }

    const recurring = await createRecurringBilling({
      customerId: initialPayment.custkey,
      paymentMethodId: paymentMethodResult.paymentMethodKey,
      amount,
      schedule: selectedPlan,
      description: `${company.name} - Digital Presence ${selectedPlan} add-on`,
      startDate: firstRecurringBillDate,
    });

    if (!recurring.success || !recurring.billingId) {
      return NextResponse.json({ success: false, error: recurring.error || 'Failed to create recurring billing' }, { status: 400 });
    }

    const updatedUserDefinedAllocations = {
      ...base,
      digitalPresence: {
        ...existingDigitalPresence,
        enabledByAdmin: true,
        pricing: {
          monthly: Number.isFinite(Number(existingPricing.monthly)) ? Number(existingPricing.monthly) : 0,
          quarterly: Number.isFinite(Number(existingPricing.quarterly)) ? Number(existingPricing.quarterly) : 0,
          annual: Number.isFinite(Number(existingPricing.annual)) ? Number(existingPricing.annual) : 0,
        },
        subscription: {
          status: 'active',
          plan: selectedPlan,
          amount,
          usaepayCustomerId: initialPayment.custkey,
          usaepayBillingId: recurring.billingId,
          activatedAt: now.toISOString(),
          lastPaymentDate: now.toISOString(),
          nextBillingDate: (recurring.nextBillingDate || firstRecurringBillDate).toISOString(),
          pastDueSince: null,
          graceEndsAt: null,
          lastFailureReason: null,
          failedPaymentCount: 0,
        },
      },
    };

    await prisma.company.update({
      where: { id: companyId },
      data: {
        userDefinedAllocations: updatedUserDefinedAllocations,
      },
    });

    await prisma.paymentTransaction.create({
      data: {
        companyId,
        amount,
        status: 'SUCCESS',
        type: 'MANUAL',
        transactionId: initialPayment.transactionId,
        authCode: initialPayment.authCode,
        cardLast4: initialPayment.last4,
        cardType: initialPayment.cardType,
        description: `Initial Digital Presence ${selectedPlan} payment`,
        invoice: `DIGITAL-PRESENCE-${companyId}-${Date.now()}`,
      },
    });

    const { start, end } = calculateBillingPeriod(now, selectedPlan);
    await prisma.revenueRecord.create({
      data: {
        transactionId: initialPayment.transactionId || `DIGITAL-PRESENCE-${companyId}-${Date.now()}`,
        companyId,
        consultantId: company.consultantId,
        serviceType: 'digital_presence',
        amount,
        paymentDate: now,
        paymentStatus: 'received',
        subscriptionPlan: selectedPlan,
        billingPeriodStart: start,
        billingPeriodEnd: end,
        notes: `Initial Digital Presence ${selectedPlan} payment - ${company.name}`,
      },
    });

    await prisma.subscriptionEvent.create({
      data: {
        companyId,
        eventType: 'digital_presence_subscription_activated',
        newValue: recurring.billingId,
        notes: `Digital Presence add-on ${selectedPlan} activated at $${amount.toFixed(2)}`,
      },
    });

    return NextResponse.json({
      success: true,
      digitalPresence: updatedUserDefinedAllocations.digitalPresence,
      firstRecurringBillDate,
      transactionId: initialPayment.transactionId,
    });
  } catch (error: any) {
    console.error('Digital Presence checkout error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to activate Digital Presence' },
      { status: 500 },
    );
  }
}
