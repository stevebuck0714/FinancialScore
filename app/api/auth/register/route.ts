import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { 
      name, email, password, fullName, address, phone, type,
      companyName, companyAddress1, companyAddress2, companyCity, companyState, companyZip, companyWebsite
    } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Get default pricing from settings
    let defaultPricing = await prisma.systemSettings.findUnique({
      where: { key: 'default_pricing' }
    });

    // If no settings exist, use fallback defaults
    if (!defaultPricing) {
      defaultPricing = {
        businessMonthlyPrice: 195,
        businessQuarterlyPrice: 500,
        businessAnnualPrice: 1750,
        consultantMonthlyPrice: 195,
        consultantQuarterlyPrice: 500,
        consultantAnnualPrice: 1750
      } as any;
    }

    // Create user, consultant, and company (for business users) in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'CONSULTANT',
          phone: phone || undefined
        }
      });

      const consultant = await tx.consultant.create({
        data: {
          userId: user.id,
          fullName: fullName || name,
          address: address || undefined,
          phone: phone || undefined,
          type: type || undefined,
          companyName: companyName || undefined,
          companyAddress1: companyAddress1 || undefined,
          companyAddress2: companyAddress2 || undefined,
          companyCity: companyCity || undefined,
          companyState: companyState || undefined,
          companyZip: companyZip || undefined,
          companyWebsite: companyWebsite || undefined
        }
      });

      // Automatically create a company for business users
      let company = null;
      if (type === 'business') {
        company = await tx.company.create({
          data: {
            name: name, // Use the business name as company name
            consultantId: consultant.id,
            subscriptionMonthlyPrice: defaultPricing.businessMonthlyPrice ?? 195,
            subscriptionQuarterlyPrice: defaultPricing.businessQuarterlyPrice ?? 500,
            subscriptionAnnualPrice: defaultPricing.businessAnnualPrice ?? 1750
            // DO NOT set selectedSubscriptionPlan - they must pay first
          }
        });
      }

      return { user, consultant, company };
    });

    return NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        consultantId: result.consultant.id,
        companyId: result.company?.id,
        consultantType: result.consultant.type
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


