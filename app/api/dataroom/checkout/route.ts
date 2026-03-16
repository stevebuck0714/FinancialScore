import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { processPayment, createRecurringBilling, getCustomerPaymentMethod } from '@/lib/usaepay';
import { addMonthsClamped, billingIntervalMonths } from '@/lib/billing/dateMath';
import { DATAROOM_DEFAULT_FOLDERS } from '@/lib/dataroom/constants';

type DataRoomPlan = 'monthly' | 'quarterly' | 'annual';

function getDataRoomSnapshot(raw: unknown): any {
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
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true,
        userDefinedAllocations: true,
      },
    });

    if (!company) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 });
    }

    const base = getDataRoomSnapshot(company.userDefinedAllocations);
    const existingDataRoom = getDataRoomSnapshot(base.dataRoom);
    const existingSub = getDataRoomSnapshot(existingDataRoom.subscription);
    const existingPricing = getDataRoomSnapshot(existingDataRoom.pricing);
    const defaultDataRoomPricing = await prisma.systemSettings.findUnique({
      where: { key: 'default_dataroom_pricing' },
    });
    const isBusinessCompany = company.consultantId === null;
    const resolvedPricing = {
      monthly: Number(
        existingPricing.monthly ??
          (isBusinessCompany ? defaultDataRoomPricing?.businessMonthlyPrice : defaultDataRoomPricing?.consultantMonthlyPrice) ??
          company.subscriptionMonthlyPrice ??
          0
      ),
      quarterly: Number(
        existingPricing.quarterly ??
          (isBusinessCompany ? defaultDataRoomPricing?.businessQuarterlyPrice : defaultDataRoomPricing?.consultantQuarterlyPrice) ??
          company.subscriptionQuarterlyPrice ??
          0
      ),
      annual: Number(
        existingPricing.annual ??
          (isBusinessCompany ? defaultDataRoomPricing?.businessAnnualPrice : defaultDataRoomPricing?.consultantAnnualPrice) ??
          company.subscriptionAnnualPrice ??
          0
      ),
    };

    if (!existingDataRoom.enabledByAdmin) {
      return NextResponse.json({ success: false, error: 'DataRoom is not enabled for this company' }, { status: 400 });
    }

    if (String(existingSub.status || '').toLowerCase() === 'active' && existingSub.usaepayBillingId) {
      return NextResponse.json({ success: false, error: 'DataRoom subscription is already active' }, { status: 409 });
    }

    const selectedPlan = plan as DataRoomPlan;
    let amount =
      selectedPlan === 'monthly'
        ? Number(resolvedPricing.monthly)
        : selectedPlan === 'quarterly'
          ? Number(resolvedPricing.quarterly)
          : Number(resolvedPricing.annual);

    if (!Number.isFinite(amount) || amount < 0) {
      amount = 0;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'DataRoom pricing is not configured for this company' }, { status: 400 });
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
      description: `${company.name} - DataRoom ${selectedPlan} add-on`,
      invoice: `DATAROOM-${companyId}-${Date.now()}`,
      customerId: `${companyId}-dataroom`,
      companyName: company.name,
      saveCustomer: true,
    });

    if (!initialPayment.success || !initialPayment.custkey) {
      return NextResponse.json(
        { success: false, error: initialPayment.error || 'Failed to process initial DataRoom payment' },
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
      description: `${company.name} - DataRoom ${selectedPlan} add-on`,
      startDate: firstRecurringBillDate,
    });

    if (!recurring.success || !recurring.billingId) {
      return NextResponse.json({ success: false, error: recurring.error || 'Failed to create recurring billing' }, { status: 400 });
    }

    const updatedUserDefinedAllocations = {
      ...base,
      dataRoom: {
        ...existingDataRoom,
        enabledByAdmin: true,
        pricing: {
          monthly: Number.isFinite(resolvedPricing.monthly) ? resolvedPricing.monthly : 0,
          quarterly: Number.isFinite(resolvedPricing.quarterly) ? resolvedPricing.quarterly : 0,
          annual: Number.isFinite(resolvedPricing.annual) ? resolvedPricing.annual : 0,
        },
        folders:
          Array.isArray(existingDataRoom.folders) && existingDataRoom.folders.length > 0
            ? existingDataRoom.folders
            : DATAROOM_DEFAULT_FOLDERS,
        documentIndex: Array.isArray(existingDataRoom.documentIndex) ? existingDataRoom.documentIndex : [],
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
          lastFailureReason: null,
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
        description: `Initial DataRoom ${selectedPlan} payment`,
      },
    });

    await prisma.subscriptionEvent.create({
      data: {
        companyId,
        eventType: 'dataroom_subscription_activated',
        newValue: recurring.billingId,
        notes: `DataRoom add-on ${selectedPlan} activated at $${amount.toFixed(2)}`,
      },
    });

    return NextResponse.json({
      success: true,
      dataRoom: updatedUserDefinedAllocations.dataRoom,
      firstRecurringBillDate,
      transactionId: initialPayment.transactionId,
    });
  } catch (error: any) {
    console.error('DataRoom checkout error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to activate DataRoom' },
      { status: 500 },
    );
  }
}

