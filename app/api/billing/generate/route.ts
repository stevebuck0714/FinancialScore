import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  generateInvoiceNumber,
  calculateBillingPeriod,
  calculateDueDate,
  getPlanAmount
} from '@/lib/billing/invoiceGenerator';

// POST - Generate invoices for companies
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { consultantId, planType, billingDate } = body;

    const where: any = {
      subscriptionStatus: 'active'
    };

    if (consultantId) {
      where.consultantId = consultantId;
    }

    if (planType) {
      where.selectedSubscriptionPlan = planType;
    }

    // Fetch companies to invoice
    const companies = await prisma.company.findMany({
      where,
      select: {
        id: true,
        name: true,
        consultantId: true,
        selectedSubscriptionPlan: true,
        subscriptionMonthlyPrice: true,
        subscriptionQuarterlyPrice: true,
        subscriptionAnnualPrice: true,
        nextBillingDate: true,
        lastBillingDate: true
      }
    });

    const createdInvoices = [];
    const errors = [];
    const now = billingDate ? new Date(billingDate) : new Date();

    for (const company of companies) {
      try {
        const plan = company.selectedSubscriptionPlan?.toLowerCase() as 'monthly' | 'quarterly' | 'annual';
        
        if (!plan || !['monthly', 'quarterly', 'annual'].includes(plan)) {
          errors.push({
            companyId: company.id,
            companyName: company.name,
            error: 'Invalid subscription plan'
          });
          continue;
        }

        // Check if invoice should be generated
        if (company.nextBillingDate && new Date(company.nextBillingDate) > now) {
          continue; // Not due yet
        }

        const amount = getPlanAmount(company, plan);
        
        if (amount <= 0) {
          errors.push({
            companyId: company.id,
            companyName: company.name,
            error: 'Invalid pricing amount'
          });
          continue;
        }

        // Generate invoice
        const invoiceNumber = generateInvoiceNumber();
        const startDate = company.lastBillingDate ? new Date(company.lastBillingDate) : now;
        const { start, end } = calculateBillingPeriod(startDate, plan);
        const dueDate = calculateDueDate(now);

        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            companyId: company.id,
            consultantId: company.consultantId,
            billingPeriodStart: start,
            billingPeriodEnd: end,
            planType: plan,
            amount,
            status: 'pending',
            dueDate
          }
        });

        // Update company billing dates
        await prisma.company.update({
          where: { id: company.id },
          data: {
            lastBillingDate: start,
            nextBillingDate: end
          }
        });

        // Log event
        await prisma.subscriptionEvent.create({
          data: {
            companyId: company.id,
            eventType: 'invoice_generated',
            newValue: invoiceNumber,
            notes: `Automated invoice generation for ${plan} plan`
          }
        });

        createdInvoices.push(invoice);
      } catch (error: any) {
        errors.push({
          companyId: company.id,
          companyName: company.name,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      invoicesCreated: createdInvoices.length,
      invoices: createdInvoices,
      errors
    }, { status: 201 });
  } catch (error) {
    console.error('Error generating invoices:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

