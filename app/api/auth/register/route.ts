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
    let resolvedAffiliateId = affiliateId;
    
    // Look up affiliate code if provided (with or without affiliateId)
    if (affiliateCode) {
      const whereClause: any = {
        code: affiliateCode.toUpperCase(),
        isActive: true
      };
      
      // If affiliateId provided, use it for filtering
      if (affiliateId) {
        whereClause.affiliateId = affiliateId;
      }
      
      // Fetch affiliate code pricing
      const affiliateCodeRecord = await prisma.affiliateCode.findFirst({
        where: whereClause,
        include: {
          affiliate: true
        }
      });
      
      if (affiliateCodeRecord) {
        pricingToUse = {
          businessMonthlyPrice: affiliateCodeRecord.monthlyPrice,
          businessQuarterlyPrice: affiliateCodeRecord.quarterlyPrice,
          businessAnnualPrice: affiliateCodeRecord.annualPrice,
          businessSetupFee: affiliateCodeRecord.setupFee
        };
        // Store the affiliate ID from the code record
        resolvedAffiliateId = affiliateCodeRecord.affiliateId;
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
          businessSetupFee: 0,
          consultantMonthlyPrice: 195,
          consultantQuarterlyPrice: 500,
          consultantAnnualPrice: 1750,
          consultantSetupFee: 0
        };
      } else {
        pricingToUse = defaultPricing;
      }
    }

    // Create user and either consultant OR company based on registration type
    const result = await prisma.$transaction(async (tx) => {
      // Standalone business registration - no consultant record needed
      if (type === 'business') {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            passwordHash,
            role: 'USER', // Business users get USER role, not CONSULTANT
            phone: phone || undefined,
            isPrimaryContact: true
          }
        });

        // STORE FINAL PRICING DIRECTLY - NO AFFILIATE CODE REFERENCES
        const finalPricing = {
          monthly: pricingToUse?.businessMonthlyPrice ?? 195,
          quarterly: pricingToUse?.businessQuarterlyPrice ?? 500,
          annual: pricingToUse?.businessAnnualPrice ?? 1750,
          setupFee: pricingToUse?.businessSetupFee ?? 0,
          requiresPayment: !affiliateCode || (pricingToUse?.businessMonthlyPrice ?? 195) > 0 ||
                          (pricingToUse?.businessQuarterlyPrice ?? 500) > 0 ||
                          (pricingToUse?.businessAnnualPrice ?? 1750) > 0 ||
                          (pricingToUse?.businessSetupFee ?? 0) > 0
        };

        // STORE FINAL PRICING PERMANENTLY - This is the pricing the company was registered with
        // New companies get CURRENT default pricing from SystemSettings (or affiliate code pricing)
        // This pricing is permanent and can only be changed by admin
        const companyData: any = {
          name: companyName || name, // Use company name from form, fallback to user name
          consultantId: null, // Standalone business - no consultant
          // Store pricing permanently - this is the pricing at registration time
          subscriptionMonthlyPrice: finalPricing.monthly,
          subscriptionQuarterlyPrice: finalPricing.quarterly,
          subscriptionAnnualPrice: finalPricing.annual,
          subscriptionSetupFee: finalPricing.setupFee,
          subscriptionStatus: finalPricing.requiresPayment ? "active" : "free",
          // DO NOT set selectedSubscriptionPlan - they must pay first
        };

        // DO NOT store affiliate code or affiliate ID with company
        // Affiliate codes are used ONLY to determine pricing, then discarded
        
        const company = await tx.company.create({
          data: companyData
        });

        // Link user to their company and set userType to 'COMPANY' for business users
        // Also set companyRole to 'admin' since they're creating their own company
        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { 
            companyId: company.id,
            userType: 'COMPANY', // Business users are company users
            companyRole: 'admin' // Company owner is admin
          }
        });
        
        console.log('✅ Business user registered with companyRole:', updatedUser.companyRole);
        
        // If affiliate code was used, increment its usage counter
        if (resolvedAffiliateId && affiliateCode) {
          await tx.affiliateCode.updateMany({
            where: {
              affiliateId: resolvedAffiliateId,
              code: affiliateCode.toUpperCase()
            },
            data: {
              currentUses: {
                increment: 1
              }
            }
          });
        }

        return { user: updatedUser, consultant: null, company };
      }

      // Consultant registration
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

      return { user, consultant, company: null };
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
        userType: result.user.userType || null,
        companyRole: result.user.companyRole || null,
        consultantId: result.consultant?.id || null,
        companyId: result.company?.id || null,
        consultantType: result.consultant?.type || null,
        consultantCompanyName: result.consultant?.companyName || null,
        isPrimaryContact: result.user.isPrimaryContact
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


