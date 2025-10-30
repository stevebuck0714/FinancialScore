import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { processPayment, PaymentDetails } from '@/lib/usaepay';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

    // Verify the company belongs to the user or user is admin
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        users: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    const userBelongsToCompany = company.users.some(u => u.id === session.user.id);
    const isAdmin = session.user.role === 'SITEADMIN';

    if (!userBelongsToCompany && !isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to process payment for this company' },
        { status: 403 }
      );
    }

    // Prepare payment details
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
      description: `${subscriptionPlan} - ${billingPeriod} subscription`,
      invoice: `SUB-${companyId}-${Date.now()}`,
      customerId: companyId,
    };

    // Process payment through USAePay
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

    // Payment successful - update company subscription
    await prisma.company.update({
      where: { id: companyId },
      data: {
        selectedSubscriptionPlan: billingPeriod,
        updatedAt: new Date(),
      },
    });

    // TODO: Store payment transaction in database for record keeping
    // You may want to create a PaymentTransaction model in your schema

    // Return success response
    return NextResponse.json({
      success: true,
      transactionId: paymentResult.transactionId,
      authCode: paymentResult.authCode,
      message: paymentResult.message || 'Payment processed successfully',
      amount: paymentResult.amount,
      cardType: paymentResult.cardType,
      last4: paymentResult.last4,
    });

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
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

