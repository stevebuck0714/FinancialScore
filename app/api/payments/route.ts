import { NextRequest, NextResponse } from 'next/server';
import { processPayment, PaymentDetails, addCustomerToVault, createRecurringBilling } from '@/lib/usaepay';
import prisma from '@/lib/prisma';
import { calculateBillingPeriod } from '@/lib/billing/invoiceGenerator';
import { addMonthsClamped, billingIntervalMonths } from '@/lib/billing/dateMath';

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
    // Note: amount may be 0 (e.g., free recurring plan); treat null/undefined as missing.
    if (amount === null || amount === undefined || !companyId || !subscriptionPlan || !billingPeriod) {
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
      // === SETUP FEE + DELAYED RECURRING SUBSCRIPTION FLOW ===
      // Charge a one-time setup fee now, then schedule recurring billing to start
      // one interval after the setup fee payment date (clamped to last day-of-month).

      const schedule = billingPeriod as 'monthly' | 'quarterly' | 'annual';

      // Server-side pricing (authoritative when available).
      const recurringAmount =
        schedule === 'monthly'
          ? (company.subscriptionMonthlyPrice ?? parseFloat(amount))
          : schedule === 'quarterly'
            ? (company.subscriptionQuarterlyPrice ?? parseFloat(amount))
            : (company.subscriptionAnnualPrice ?? parseFloat(amount));

      const setupFeeAmount = company.subscriptionSetupFee ?? 0;

      // Prevent nonsense charges.
      if (!Number.isFinite(recurringAmount) || recurringAmount < 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid recurring amount configured for this company' },
          { status: 400 }
        );
      }
      if (!Number.isFinite(setupFeeAmount) || setupFeeAmount < 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid setup fee configured for this company' },
          { status: 400 }
        );
      }

      const now = new Date();
      const anchorDate = now;
      const firstRecurringBillDate = addMonthsClamped(anchorDate, billingIntervalMonths(schedule));

      let usaepayCustomerId: string | undefined;
      let paymentTransactionId: string | undefined;
      let paymentAuthCode: string | undefined;
      let cardLast4: string | undefined;
      let cardType: string | undefined;
      let paymentMethodKey: string | undefined;

      if (setupFeeAmount > 0) {
        // Step 1: Charge setup fee and save payment method to vault
        console.log(`💳 Charging setup fee with vault save for company: ${company.name}`);

        const paymentDetails: PaymentDetails = {
          amount: setupFeeAmount,
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
          description: `${company.name} - Setup fee`,
          invoice: `SETUP-${companyId}-${Date.now()}`,
          customerId: companyId,
          companyName: company.name,
          saveCustomer: true,
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

        usaepayCustomerId = paymentResult.custkey;
        paymentTransactionId = paymentResult.transactionId;
        paymentAuthCode = paymentResult.authCode;
        cardLast4 = paymentResult.last4;
        cardType = paymentResult.cardType;

        console.log(`✅ Setup fee payment successful. Customer ID: ${usaepayCustomerId}`);

        // Step 2: Retrieve payment method key
        const { getCustomerPaymentMethod } = await import('@/lib/usaepay');
        const paymentMethodResult = await getCustomerPaymentMethod(usaepayCustomerId);
        if (!paymentMethodResult.success || !paymentMethodResult.paymentMethodKey) {
          // We still consider setup fee paid; recurring can be scheduled later.
          paymentMethodKey = undefined;
        } else {
          paymentMethodKey = paymentMethodResult.paymentMethodKey;
        }
      } else {
        // No setup fee: just vault the payment method and proceed to scheduling.
        console.log(`💳 Saving payment method (no setup fee) for company: ${company.name}`);
        const vaultResult = await addCustomerToVault({
          companyId,
          companyName: company.name,
          cardNumber,
          expirationMonth,
          expirationYear,
          cvv,
          cardholderName,
          billingAddress: {
            street: billingAddress.street,
            city: billingAddress.city,
            state: billingAddress.state,
            zip: billingAddress.zip,
          },
          email,
          phone,
        });

        if (!vaultResult.success || !vaultResult.customerId) {
          return NextResponse.json(
            { success: false, error: vaultResult.error || 'Failed to save payment method' },
            { status: 400 }
          );
        }

        usaepayCustomerId = vaultResult.customerId;
        cardLast4 = vaultResult.cardLast4;
        cardType = vaultResult.cardType;

        const { getCustomerPaymentMethod } = await import('@/lib/usaepay');
        const paymentMethodResult = await getCustomerPaymentMethod(usaepayCustomerId);
        if (paymentMethodResult.success && paymentMethodResult.paymentMethodKey) {
          paymentMethodKey = paymentMethodResult.paymentMethodKey;
        }
      }

      if (!usaepayCustomerId) {
        return NextResponse.json(
          { success: false, error: 'Payment method could not be saved to the payment processor' },
          { status: 400 }
        );
      }

      // Step 3: Create subscription record first (so we can track setup fee even if scheduling fails)
      const subscription = await prisma.subscription.create({
        data: {
          companyId,
          usaepayCustomerId,
          // usaepayBillingId set after schedule creation succeeds
          plan: schedule,
          amount: recurringAmount,
          status: 'PENDING',
          setupFeeAmount,
          setupFeeStatus: setupFeeAmount > 0 ? 'PAID' : 'WAIVED',
          setupFeePaidAt: setupFeeAmount > 0 ? now : null,
          setupFeeTransactionId: setupFeeAmount > 0 ? (paymentTransactionId || null) : null,
          billingAnchorDate: now,
          firstRecurringBillDate,
          nextBillingDate: firstRecurringBillDate,
          billingStartDate: now,
          cardLast4,
          cardType,
          cardExpMonth: expirationMonth,
          cardExpYear: expirationYear,
        },
      });

      // Step 3b: Record the setup fee transaction + revenue (if applicable)
      if (setupFeeAmount > 0) {
        await prisma.paymentTransaction.create({
          data: {
            subscriptionId: subscription.id,
            companyId,
            amount: setupFeeAmount,
            status: 'SUCCESS',
            type: 'SETUP_FEE',
            transactionId: paymentTransactionId,
            authCode: paymentAuthCode,
            cardLast4,
            cardType,
            description: `One-time setup fee`,
            invoice: `SETUP-${companyId}-${Date.now()}`,
          },
        });

        // Setup fee is platform revenue (no consultant share).
        await prisma.revenueRecord.create({
          data: {
            transactionId: paymentTransactionId || `SETUP-${companyId}-${Date.now()}`,
            companyId,
            consultantId: null,
            amount: setupFeeAmount,
            paymentDate: now,
            paymentStatus: 'received',
            serviceType: 'setup_fee',
            subscriptionPlan: 'setup_fee',
            billingPeriodStart: now,
            billingPeriodEnd: now,
            notes: `Setup fee - ${company.name}`,
          },
        });
      }

      // Step 4: Create recurring billing schedule (may be retried later if it fails)
      if (paymentMethodKey) {
        const billingResult = await createRecurringBilling({
          customerId: usaepayCustomerId,
          paymentMethodId: paymentMethodKey,
          amount: recurringAmount,
          schedule,
          description: `${company.name} - ${schedule} subscription`,
          startDate: firstRecurringBillDate,
        });

        if (billingResult.success && billingResult.billingId) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              usaepayBillingId: billingResult.billingId,
              status: 'ACTIVE',
              nextBillingDate: billingResult.nextBillingDate || firstRecurringBillDate,
              lastFailureReason: null,
            },
          });

          await prisma.subscriptionEvent.create({
            data: {
              companyId,
              eventType: 'recurring_scheduled',
              newValue: billingResult.billingId,
              notes: `Recurring scheduled: ${schedule} $${recurringAmount.toFixed(2)} starting ${firstRecurringBillDate.toISOString()}`,
            },
          });
        } else {
          // Keep subscription as PENDING; admin can retry schedule creation.
          await prisma.subscriptionEvent.create({
            data: {
              companyId,
              eventType: 'recurring_schedule_failed',
              newValue: 'none',
              notes: `Setup fee paid, but recurring schedule creation failed: ${billingResult.error || 'unknown error'}`,
            },
          });
        }
      } else {
        await prisma.subscriptionEvent.create({
          data: {
            companyId,
            eventType: 'recurring_schedule_failed',
            newValue: 'none',
            notes: `Setup fee paid, but payment method key could not be retrieved from vault. Recurring must be scheduled by admin retry.`,
          },
        });
      }

      // Step 5: Update company's selected plan (for UI display)
      await prisma.company.update({
        where: { id: companyId },
        data: {
          selectedSubscriptionPlan: schedule,
          updatedAt: new Date(),
        },
      });

      const refreshedSubscription = await prisma.subscription.findUnique({
        where: { companyId },
      });

      const recurringScheduled = !!refreshedSubscription?.usaepayBillingId;

      return NextResponse.json({
        success: true,
        subscription: refreshedSubscription,
        transactionId: paymentTransactionId,
        authCode: paymentAuthCode,
        message: recurringScheduled
          ? 'Setup fee paid. Recurring subscription is scheduled and will bill automatically.'
          : 'Setup fee paid. Recurring subscription could not be scheduled automatically; an admin can retry schedule creation.',
        recurringScheduled,
        firstRecurringBillDate,
        cardType,
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
          serviceType: 'core',
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

