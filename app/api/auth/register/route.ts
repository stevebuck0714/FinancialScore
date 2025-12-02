import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { sendConsultantRegistrationNotification, sendBusinessRegistrationNotification } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { 
      name, email, password, fullName, address, phone, type,
      companyName, companyAddress1, companyAddress2, companyCity, companyState, companyZip, companyWebsite,
      affiliateId, affiliateCode
    } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { 
          error: 'Password does not meet requirements',
          details: passwordValidation.errors
        },
        { status: 400 }
      );
    }

    // Normalize email to lowercase for consistency
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Get pricing - either from affiliate code or default
    let pricingToUse = null;
    
    if (affiliateId && affiliateCode) {
      // Fetch affiliate code pricing
      const affiliateCodeRecord = await prisma.affiliateCode.findFirst({
        where: {
          affiliateId: affiliateId,
          code: affiliateCode.toUpperCase(),
          isActive: true
        }
      });
      
      if (affiliateCodeRecord) {
        pricingToUse = {
          businessMonthlyPrice: affiliateCodeRecord.monthlyPrice,
          businessQuarterlyPrice: affiliateCodeRecord.quarterlyPrice,
          businessAnnualPrice: affiliateCodeRecord.annualPrice
        };
      }
    }
    
    // If no affiliate pricing, get default pricing from settings
    if (!pricingToUse) {
      let defaultPricing = await prisma.systemSettings.findUnique({
        where: { key: 'default_pricing' }
      });

      // If no settings exist, use fallback defaults
      if (!defaultPricing) {
        pricingToUse = {
          businessMonthlyPrice: 195,
          businessQuarterlyPrice: 500,
          businessAnnualPrice: 1750,
          consultantMonthlyPrice: 195,
          consultantQuarterlyPrice: 500,
          consultantAnnualPrice: 1750
        };
      } else {
        pricingToUse = defaultPricing;
      }
    }

    // Create user, consultant, and company (for business users) in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          passwordHash,
          role: 'CONSULTANT',
          phone: phone || undefined,
          isPrimaryContact: true // New consultants are primary contacts
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

      // Update user to link to consultant firm for team member queries
      await tx.user.update({
        where: { id: user.id },
        data: { consultantId: consultant.id }
      });

      // Automatically create a company for business users
      let company = null;
      if (type === 'business') {
        const companyData: any = {
          name: name, // Use the business name as company name
          consultantId: consultant.id,
          subscriptionMonthlyPrice: pricingToUse?.businessMonthlyPrice ?? 0,
          subscriptionQuarterlyPrice: pricingToUse?.businessQuarterlyPrice ?? 0,
          subscriptionAnnualPrice: pricingToUse?.businessAnnualPrice ?? 0
          // DO NOT set selectedSubscriptionPlan - they must pay first
        };
        
        // If affiliate code was used, save it to the company
        if (affiliateId && affiliateCode) {
          companyData.affiliateId = affiliateId;
          companyData.affiliateCode = affiliateCode.toUpperCase();
        }
        
        company = await tx.company.create({
          data: companyData
        });
        
        // If affiliate code was used, increment its usage counter
        if (affiliateId && affiliateCode) {
          await tx.affiliateCode.updateMany({
            where: {
              affiliateId: affiliateId,
              code: affiliateCode.toUpperCase()
            },
            data: {
              currentUses: {
                increment: 1
              }
            }
          });
        }
      }

      return { user, consultant, company };
    });

    // Send email notification to support (don't block the response on this)
    try {
      const fullAddress = [companyAddress1, companyAddress2, companyCity, companyState, companyZip]
        .filter(Boolean)
        .join(', ');

      if (type === 'business') {
        // Business registration notification
        await sendBusinessRegistrationNotification({
          businessName: name,
          businessEmail: normalizedEmail,
          businessPhone: phone,
          industry: undefined, // Not collected during registration
          consultantName: undefined, // Self-registered businesses don't have a consultant yet
          affiliateCode: affiliateCode ? affiliateCode.toUpperCase() : undefined
        });
      } else {
        // Consultant registration notification
        await sendConsultantRegistrationNotification({
          consultantName: fullName || name,
          consultantEmail: normalizedEmail,
          consultantPhone: phone,
          companyName: companyName,
          companyAddress: fullAddress || undefined,
          registrationType: 'consultant'
        });
      }
      
      console.log('✅ Registration notification email sent to support');
    } catch (emailError) {
      // Log error but don't fail the registration
      console.error('❌ Failed to send registration notification email:', emailError);
    }

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


