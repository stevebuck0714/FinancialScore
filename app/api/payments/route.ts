import { NextRequest, NextResponse } from 'next/server';
import { processPayment, PaymentDetails, addCustomerToVault, createRecurringBilling } from '@/lib/usaepay';
import prisma from '@/lib/prisma';
import { calculateBillingPeriod } from '@/lib/billing/invoiceGenerator';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const {
      amount,
      companyId,
      subscriptionPlan,
      billingPeriod,
      cardNumber,
      cardholderName,
      expirationMonth,
      expirationYear,
      cvv,
      billingAddress,
      email,
      phone,
      createSubscription = true, // By default, create recurring subscription
    } = body;

    // Validate required fields
    if (!amount || !companyId || !subscriptionPlan || !billingPeriod) {
      return NextResponse.json(
        { success: false, error: 'Missing required payment information' },
        { status: 400 }
      );
    }

    if (!cardNumber || !cardholderName || !expirationMonth || !expirationYear || !cvv) {
      return NextResponse.json(
        { success: false, error: 'Missing required card information' },
        { status: 400 }
      );
    }

    if (!billingAddress?.street || !billingAddress?.city || !billingAddress?.state || !billingAddress?.zip) {
      return NextResponse.json(
        { success: false, error: 'Missing required billing address' },
        { status: 400 }
      );
    }

    // Verify the company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    // Check if subscription already exists
    const existingSubscription = await prisma.subscription.findUnique({
      where: { companyId },
    });

    if (existingSubscription && createSubscription) {
      return NextResponse.json(
        { success: false, error: 'Subscription already exists for this company' },
        { status: 409 }
      );
    }

    if (createSubscription) {
      // === RECURRING SUBSCRIPTION FLOW (USAePay Recommended Approach) ===
      
      // Step 1: Process initial sale with customer save flags
      console.log(`💳 Processing initial sale with customer vault for company: ${company.name}`);
      
      const paymentDetails: PaymentDetails = {
        amount: parseFloat(amount),
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
        description: `${company.name} - Initial ${billingPeriod} payment`,
        invoice: `SUB-${companyId}-${Date.now()}`,
        customerId: companyId,
        companyName: company.name, // Include company name in customer profile
        saveCustomer: true, // Save customer and payment method to vault
      };

      const paymentResult = await processPayment(paymentDetails);

      if (!paymentResult.success || !paymentResult.custkey) {
        return NextResponse.json(
          {
            success: false,
            error: paymentResult.error || 'Payment processing failed',
            message: paymentResult.message,
          },
          { status: 400 }
        );
      }

      const usaepayCustomerId = paymentResult.custkey!;
      const cardLast4 = paymentResult.last4;
      const cardType = paymentResult.cardType;

      console.log(`✅ Payment successful. Customer ID: ${usaepayCustomerId}`);

      // Step 2: Retrieve payment method key
      console.log(`🔍 Retrieving payment method for customer: ${usaepayCustomerId}`);
      
      const { getCustomerPaymentMethod } = await import('@/lib/usaepay');
      const paymentMethodResult = await getCustomerPaymentMethod(usaepayCustomerId);

      if (!paymentMethodResult.success || !paymentMethodResult.paymentMethodKey) {
        console.error('⚠️ Failed to retrieve payment method, but payment was successful');
        return NextResponse.json(
          {
            success: false,
            error: 'Payment processed but recurring billing setup incomplete',
            message: `Payment was approved (Transaction ID: ${paymentResult.transactionId}). However, we could not set up automatic recurring billing. Please contact support to complete your subscription setup.`,
            transactionId: paymentResult.transactionId,
            authCode: paymentResult.authCode,
          },
          { status: 400 }
        );
      }

      const paymentMethodKey = paymentMethodResult.paymentMethodKey;
      console.log(`✅ Payment method key retrieved: ${paymentMethodKey}`);

      // Step 3: Create recurring billing schedule
      const billingResult = await createRecurringBilling({
        customerId: usaepayCustomerId,
        paymentMethodId: paymentMethodKey,
        amount: parseFloat(amount),
        schedule: billingPeriod as 'monthly' | 'quarterly' | 'annual',
        description: `${company.name} - ${billingPeriod} subscription`,
      });

      if (!billingResult.success || !billingResult.billingId) {
        console.error('⚠️ Failed to create recurring billing, but payment was successful');
        return NextResponse.json(
          {
            success: false,
            error: 'Payment processed but recurring billing setup incomplete',
            message: `Payment was approved (Transaction ID: ${paymentResult.transactionId}). However, we could not set up automatic recurring billing. Please contact support to complete your subscription setup. Error: ${billingResult.error}`,
            transactionId: paymentResult.transactionId,
            authCode: paymentResult.authCode,
          },
          { status: 400 }
        );
      }

      // Step 4: Calculate next billing date
      const now = new Date();
      const nextBillingDate = new Date(now);
      if (billingPeriod === 'monthly') {
        nextBillingDate.setMonth(now.getMonth() + 1);
      } else if (billingPeriod === 'quarterly') {
        nextBillingDate.setMonth(now.getMonth() + 3);
      } else if (billingPeriod === 'annual') {
        nextBillingDate.setFullYear(now.getFullYear() + 1);
      }

      // Step 5: Create subscription record in database
      const subscription = await prisma.subscription.create({
        data: {
          companyId,
          usaepayCustomerId: usaepayCustomerId,
          usaepayBillingId: billingResult.billingId,
          plan: billingPeriod,
          amount: parseFloat(amount),
          status: 'ACTIVE',
          nextBillingDate: billingResult.nextBillingDate || nextBillingDate,
          lastPaymentDate: now,
          billingStartDate: now,
          cardLast4: cardLast4,
          cardType: cardType,
          cardExpMonth: expirationMonth,
          cardExpYear: expirationYear,
        },
      });

      // Step 6: Create initial transaction record
      await prisma.paymentTransaction.create({
        data: {
          subscriptionId: subscription.id,
          companyId,
          amount: parseFloat(amount),
          status: 'SUCCESS',
          type: 'INITIAL',
          transactionId: paymentResult.transactionId,
          authCode: paymentResult.authCode,
          cardLast4: cardLast4,
          cardType: cardType,
          description: `Initial ${billingPeriod} subscription payment`,
          invoice: paymentDetails.invoice,
        },
      });

      // Step 6b: Create revenue record for initial payment
      const now = new Date();
      const planType = billingPeriod as 'monthly' | 'quarterly' | 'annual';
      const { start, end } = calculateBillingPeriod(now, planType);
      
      const companyDetails = await prisma.company.findUnique({
        where: { id: companyId },
        select: { consultantId: true, name: true }
      });

      await prisma.revenueRecord.create({
        data: {
          transactionId: paymentResult.transactionId!,
          companyId,
          consultantId: companyDetails?.consultantId || null,
          amount: parseFloat(amount),
          paymentDate: now,
          paymentStatus: 'received',
          subscriptionPlan: billingPeriod,
          billingPeriodStart: start,
          billingPeriodEnd: end,
          notes: `Initial subscription payment - ${companyDetails?.name || 'Unknown company'}`
        }
      });

      // Step 7: Update company's selected plan
      await prisma.company.update({
        where: { id: companyId },
        data: {
          selectedSubscriptionPlan: billingPeriod,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        subscription,
        transactionId: paymentResult.transactionId,
        authCode: paymentResult.authCode,
        message: 'Payment successful! Your subscription is now active and will renew automatically.',
        cardType: cardType,
        last4: cardLast4,
      });

    } else {
      // === ONE-TIME PAYMENT FLOW (Legacy) ===
      
      const paymentDetails: PaymentDetails = {
        amount: parseFloat(amount),
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
        description: `${subscriptionPlan} - ${billingPeriod} payment`,
        invoice: `PAY-${companyId}-${Date.now()}`,
        customerId: companyId,
      };

      const paymentResult = await processPayment(paymentDetails);

      if (!paymentResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: paymentResult.error || 'Payment processing failed',
            message: paymentResult.message,
          },
          { status: 400 }
        );
      }

      // Store transaction record
      await prisma.paymentTransaction.create({
        data: {
          companyId,
          amount: parseFloat(amount),
          status: 'SUCCESS',
          type: 'MANUAL',
          transactionId: paymentResult.transactionId,
          authCode: paymentResult.authCode,
          cardLast4: paymentResult.last4,
          cardType: paymentResult.cardType,
          description: `One-time ${billingPeriod} payment`,
          invoice: paymentDetails.invoice,
        },
      });

      // Create revenue record for one-time payment
      const now = new Date();
      const planType = billingPeriod as 'monthly' | 'quarterly' | 'annual';
      const { start, end } = calculateBillingPeriod(now, planType);
      
      const companyDetails = await prisma.company.findUnique({
        where: { id: companyId },
        select: { consultantId: true, name: true }
      });

      await prisma.revenueRecord.create({
        data: {
          transactionId: paymentResult.transactionId!,
          companyId,
          consultantId: companyDetails?.consultantId || null,
          amount: parseFloat(amount),
          paymentDate: now,
          paymentStatus: 'received',
          subscriptionPlan: billingPeriod,
          billingPeriodStart: start,
          billingPeriodEnd: end,
          notes: `One-time payment - ${companyDetails?.name || 'Unknown company'}`
        }
      });

      await prisma.company.update({
        where: { id: companyId },
        data: {
          selectedSubscriptionPlan: billingPeriod,
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        transactionId: paymentResult.transactionId,
        authCode: paymentResult.authCode,
        message: paymentResult.message || 'Payment processed successfully',
        amount: paymentResult.amount,
        cardType: paymentResult.cardType,
        last4: paymentResult.last4,
      });
    }

  } catch (error) {
    console.error('Payment API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check payment configuration status
export async function GET(request: NextRequest) {
  try {
    // Check if USAePay is configured
    const isConfigured = !!(process.env.USAEPAY_API_KEY && process.env.USAEPAY_PIN);
    const isSandbox = process.env.USAEPAY_SANDBOX === 'true';

    return NextResponse.json({
      configured: isConfigured,
      sandbox: isSandbox,
      message: isConfigured
        ? `Payment processing is configured (${isSandbox ? 'Sandbox' : 'Production'} mode)`
        : 'Payment processing is not configured',
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

