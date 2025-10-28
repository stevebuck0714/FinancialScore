import { NextRequest, NextResponse } from 'next/server';
import { processPayment, type PaymentRequest } from '@/lib/usaepay';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth.config';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      amount,
      cardDetails,
      billingAddress,
      companyId,
      subscriptionPlan,
      billingPeriod
    } = body;

    // Validate required fields
    if (!amount || !cardDetails || !billingAddress || !companyId || !subscriptionPlan) {
      return NextResponse.json(
        { error: 'Missing required payment information' },
        { status: 400 }
      );
    }

    // Verify company exists and user has access
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { users: true }
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Check if user belongs to this company
    const userHasAccess = company.users.some(u => u.email === session.user.email);
    if (!userHasAccess) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Process payment through USAePay
    const paymentRequest: PaymentRequest = {
      amount: parseFloat(amount),
      cardDetails: {
        cardNumber: cardDetails.cardNumber,
        expirationMonth: cardDetails.expirationMonth,
        expirationYear: cardDetails.expirationYear,
        cvv: cardDetails.cvv,
        cardHolder: cardDetails.cardHolder
      },
      billingAddress: {
        street: billingAddress.street,
        city: billingAddress.city,
        state: billingAddress.state,
        zip: billingAddress.zip,
        country: billingAddress.country || 'US'
      },
      description: `Corelytics ${subscriptionPlan} Subscription - ${company.name}`,
      customerEmail: session.user.email,
      orderId: `SUB-${companyId}-${Date.now()}`
    };

    const paymentResult = await processPayment(paymentRequest);

    if (!paymentResult.success) {
      return NextResponse.json(
        { 
          error: paymentResult.message,
          details: paymentResult.error 
        },
        { status: 400 }
      );
    }

    // Update company with subscription plan
    await prisma.company.update({
      where: { id: companyId },
      data: {
        selectedSubscriptionPlan: billingPeriod,
        updatedAt: new Date()
      }
    });

    // Log the transaction (you might want to create a Payment model in Prisma)
    // For now, we'll just return success
    
    return NextResponse.json({
      success: true,
      message: 'Payment processed successfully',
      transactionId: paymentResult.transactionId,
      authCode: paymentResult.authCode,
      subscriptionPlan: subscriptionPlan,
      amount: amount
    });

  } catch (error: any) {
    console.error('Payment processing error:', error);
    return NextResponse.json(
      { error: 'Payment processing failed', details: error.message },
      { status: 500 }
    );
  }
}

