import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  addCustomerToVault,
  createRecurringBilling,
  updateCustomerVault,
  updateRecurringBilling,
  cancelRecurringBilling,
  getRecurringBillingStatus,
} from '@/lib/usaepay';

// GET - Get subscription details for a company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
      include: {
        company: {
          select: {
            name: true,
            addressStreet: true,
            addressCity: true,
            addressState: true,
            addressZip: true,
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}

// POST - Create new subscription
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      plan, // 'monthly', 'quarterly', 'annual'
      amount,
      cardNumber,
      cardholderName,
      expirationMonth,
      expirationYear,
      cvv,
      billingAddress,
      email,
      phone,
    } = body;

    // Validate required fields
    if (!companyId || !plan || !amount || !cardNumber || !cardholderName || !expirationMonth || !expirationYear || !cvv) {
      return NextResponse.json(
        { error: 'Missing required payment information' },
        { status: 400 }
      );
    }

    if (!billingAddress?.street || !billingAddress?.city || !billingAddress?.state || !billingAddress?.zip) {
      return NextResponse.json(
        { error: 'Missing required billing address' },
        { status: 400 }
      );
    }

    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Check if subscription already exists
    const existingSubscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (existingSubscription) {
      return NextResponse.json(
        { error: 'Subscription already exists. Use PUT to update.' },
        { status: 409 }
      );
    }

    // Step 1: Add customer to vault
    const vaultResult = await addCustomerToVault({
      companyId,
      cardNumber,
      expirationMonth,
      expirationYear,
      cvv,
      cardholderName,
      billingAddress,
      email,
      phone,
    });

    if (!vaultResult.success || !vaultResult.customerId) {
      return NextResponse.json(
        { error: vaultResult.error || 'Failed to save payment method' },
        { status: 400 }
      );
    }

    // Step 1.5: Get payment method ID from customer vault
    const { getCustomerPaymentMethod } = await import('@/lib/usaepay');
    const paymentMethodResult = await getCustomerPaymentMethod(vaultResult.customerId);
    
    if (!paymentMethodResult.success || !paymentMethodResult.paymentMethodKey) {
      return NextResponse.json(
        { error: paymentMethodResult.error || 'Failed to retrieve payment method' },
        { status: 400 }
      );
    }

    // Step 2: Calculate next billing date based on initial payment date (today)
    const initialPaymentDate = new Date();
    const nextBillingDate = new Date(initialPaymentDate);
    if (plan === 'monthly') {
      nextBillingDate.setMonth(initialPaymentDate.getMonth() + 1);
    } else if (plan === 'quarterly') {
      nextBillingDate.setMonth(initialPaymentDate.getMonth() + 3);
    } else if (plan === 'annual') {
      nextBillingDate.setFullYear(initialPaymentDate.getFullYear() + 1);
    }

    // Step 3: Create recurring billing schedule with proper payment method and start date
    const billingResult = await createRecurringBilling({
      customerId: vaultResult.customerId,
      paymentMethodId: paymentMethodResult.paymentMethodKey,
      amount: parseFloat(amount),
      schedule: plan as 'monthly' | 'quarterly' | 'annual',
      description: `${company.name} - ${plan} subscription`,
      startDate: nextBillingDate, // Set start date to when the next payment should occur
    });

    if (!billingResult.success || !billingResult.billingId) {
      return NextResponse.json(
        { error: billingResult.error || 'Failed to create recurring billing' },
        { status: 400 }
      );
    }

    // Step 4: Create subscription record in database
    const subscription = await prisma.subscription.create({
      data: {
        companyId,
        usaepayCustomerId: vaultResult.customerId,
        usaepayBillingId: billingResult.billingId,
        plan,
        amount: parseFloat(amount),
        status: 'ACTIVE',
        nextBillingDate: nextBillingDate, // Use our calculated date
        lastPaymentDate: initialPaymentDate,
        billingStartDate: initialPaymentDate,
        cardLast4: vaultResult.cardLast4,
        cardType: vaultResult.cardType,
        cardExpMonth: expirationMonth,
        cardExpYear: expirationYear,
      },
    });

    // Step 5: Create initial transaction record
    await prisma.paymentTransaction.create({
      data: {
        subscriptionId: subscription.id,
        companyId,
        amount: parseFloat(amount),
        status: 'SUCCESS',
        type: 'INITIAL',
        cardLast4: vaultResult.cardLast4,
        cardType: vaultResult.cardType,
        description: `Initial ${plan} subscription payment`,
        invoice: `SUB-${companyId}-${Date.now()}`,
      },
    });

    // Update company's selected plan
    await prisma.company.update({
      where: { id: companyId },
      data: {
        selectedSubscriptionPlan: plan,
      },
    });

    return NextResponse.json({
      success: true,
      subscription,
      message: 'Subscription created successfully',
    });
  } catch (error) {
    console.error('Subscription creation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create subscription',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// PUT - Update subscription
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      plan,
      amount,
      cardNumber,
      cardholderName,
      expirationMonth,
      expirationYear,
      cvv,
      billingAddress,
    } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    // Get existing subscription
    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      );
    }

    const updates: any = {};

    // Update payment method if provided
    if (cardNumber && subscription.usaepayCustomerId) {
      const vaultResult = await updateCustomerVault(subscription.usaepayCustomerId, {
        companyId,
        cardNumber,
        cardholderName,
        expirationMonth,
        expirationYear,
        cvv,
        billingAddress,
      });

      if (!vaultResult.success) {
        return NextResponse.json(
          { error: vaultResult.error || 'Failed to update payment method' },
          { status: 400 }
        );
      }

      updates.cardLast4 = vaultResult.cardLast4;
      updates.cardType = vaultResult.cardType;
      if (expirationMonth) updates.cardExpMonth = expirationMonth;
      if (expirationYear) updates.cardExpYear = expirationYear;
    }

    // Update plan or amount if provided
    if ((plan || amount) && subscription.usaepayBillingId) {
      const billingResult = await updateRecurringBilling(subscription.usaepayBillingId, {
        ...(plan && { schedule: plan as 'monthly' | 'quarterly' | 'annual' }),
        ...(amount && { amount: parseFloat(amount) }),
        customerId: subscription.usaepayCustomerId || '',
        description: `Updated subscription`,
      });

      if (!billingResult.success) {
        return NextResponse.json(
          { error: billingResult.error || 'Failed to update billing schedule' },
          { status: 400 }
        );
      }

      if (plan) updates.plan = plan;
      if (amount) updates.amount = parseFloat(amount);
      if (billingResult.nextBillingDate) updates.nextBillingDate = billingResult.nextBillingDate;
    }

    // Update subscription in database
    const updatedSubscription = await prisma.subscription.update({
      where: { companyId },
      data: updates,
    });

    // Update company's selected plan if changed
    if (plan) {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          selectedSubscriptionPlan: plan,
        },
      });
    }

    return NextResponse.json({
      success: true,
      subscription: updatedSubscription,
      message: 'Subscription updated successfully',
    });
  } catch (error) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update subscription',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// DELETE - Cancel subscription
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      );
    }

    // Cancel recurring billing in USAePay
    if (subscription.usaepayBillingId) {
      const cancelResult = await cancelRecurringBilling(
        subscription.usaepayBillingId,
        subscription.usaepayCustomerId || undefined
      );
      if (!cancelResult.success) {
        return NextResponse.json(
          { error: cancelResult.error || 'Failed to cancel billing' },
          { status: 400 }
        );
      }
    }

    // Update subscription status
    await prisma.subscription.update({
      where: { companyId },
      data: {
        status: 'CANCELED',
        billingEndDate: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription canceled successfully',
    });
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to cancel subscription',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

