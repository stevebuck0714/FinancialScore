import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { sendConsultantRegistrationNotification, sendBusinessRegistrationNotification } from '@/lib/email';
import { getDemoAffiliateCode, getDemoDurationDays, getDemoExpiryDate, isDemoAffiliateCode } from '@/lib/demo-access';
import { provisionDemoWorkspace } from '@/lib/demo-provisioning';
import { buildCompanyAddOnAllocations } from '@/lib/affiliate-add-ons';

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

    const normalizedAffiliateCode = String(affiliateCode || '').trim().toUpperCase();
    const isDemoSignup = isDemoAffiliateCode(normalizedAffiliateCode);
    const demoStartsAt = isDemoSignup ? new Date() : null;
    const demoExpiresAt = demoStartsAt ? getDemoExpiryDate(demoStartsAt) : null;

    // Get pricing - either from affiliate code/demo code or default
    let pricingToUse = null;
    let resolvedAffiliateId = affiliateId;
    let affiliateAddOnDefaults: unknown = null;

    if (isDemoSignup) {
      pricingToUse = {
        businessMonthlyPrice: 0,
        businessQuarterlyPrice: 0,
        businessAnnualPrice: 0,
        businessSetupFee: 0,
      };
      resolvedAffiliateId = null;
    }

    // Look up affiliate code if provided (with or without affiliateId)
    if (normalizedAffiliateCode && !isDemoSignup) {
      const whereClause: any = {
        code: normalizedAffiliateCode,
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
        affiliateAddOnDefaults = affiliateCodeRecord.addOnDefaults || null;
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
    let dataRoomPricingToUse: { businessMonthlyPrice?: number; businessQuarterlyPrice?: number; businessAnnualPrice?: number } = {};
    try {
      const defaultDataRoomPricing = await prisma.systemSettings.findUnique({
        where: { key: 'default_dataroom_pricing' }
      });
      dataRoomPricingToUse = defaultDataRoomPricing || {};
    } catch (error) {
      console.warn('Could not load default DataRoom pricing during registration, using fallback.', error);
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
          requiresPayment: !normalizedAffiliateCode || (pricingToUse?.businessMonthlyPrice ?? 195) > 0 ||
                          (pricingToUse?.businessQuarterlyPrice ?? 500) > 0 ||
                          (pricingToUse?.businessAnnualPrice ?? 1750) > 0 ||
                          (pricingToUse?.businessSetupFee ?? 0) > 0
        };
        const addOnAllocations = buildCompanyAddOnAllocations({
          addOnDefaults: affiliateAddOnDefaults,
          dataRoomPricing: {
            monthly: Number(dataRoomPricingToUse.businessMonthlyPrice ?? 195),
            quarterly: Number(dataRoomPricingToUse.businessQuarterlyPrice ?? 500),
            annual: Number(dataRoomPricingToUse.businessAnnualPrice ?? 1750),
          },
        });

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
          subscriptionStatus: isDemoSignup
            ? 'demo_active'
            : finalPricing.requiresPayment
              ? "active"
              : "free",
          subscriptionStartDate: isDemoSignup ? demoStartsAt : undefined,
          nextBillingDate: isDemoSignup ? demoExpiresAt : undefined,
          affiliateCode: normalizedAffiliateCode || undefined,
          // Demo mock companies use CAD for multi-currency QA
          ...(isDemoSignup
            ? { baseCurrency: 'CAD', locale: 'en-CA', addressCountry: 'Canada' }
            : {}),
          userDefinedAllocations: {
            ...addOnAllocations,
            demo: isDemoSignup
              ? {
                  enabled: true,
                  affiliateCode: getDemoAffiliateCode(),
                  startedAt: demoStartsAt?.toISOString(),
                  expiresAt: demoExpiresAt?.toISOString(),
                  durationDays: getDemoDurationDays(),
                }
              : undefined,
          },
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
        if (resolvedAffiliateId && normalizedAffiliateCode) {
          await tx.affiliateCode.updateMany({
            where: {
              affiliateId: resolvedAffiliateId,
              code: normalizedAffiliateCode
            },
            data: {
              currentUses: {
                increment: 1
              }
            }
          });
        }

        if (isDemoSignup) {
          await tx.auditLog.create({
            data: {
              userId: updatedUser.id,
              userEmail: updatedUser.email,
              action: 'DEMO_SIGNUP_COMPLETED',
              entityType: 'Company',
              entityId: company.id,
              changes: {
                affiliateCode: getDemoAffiliateCode(),
                demoStartedAt: demoStartsAt?.toISOString(),
                demoExpiresAt: demoExpiresAt?.toISOString(),
                durationDays: getDemoDurationDays(),
              },
            },
          });
        }

        return { user: updatedUser, consultant: null, company, isDemoSignup };
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

      return { user, consultant, company: null, isDemoSignup: false };
    });

    // Provision seeded financial + operational data for active demo signups.
    if (type === 'business' && (result as any).isDemoSignup && result.company?.id) {
      const autoProvisionEnabled = process.env.DEMO_AUTOPROVISION_ENABLED !== '0';
      if (autoProvisionEnabled) {
        try {
          await provisionDemoWorkspace({
            companyId: result.company.id,
            userId: result.user.id,
            userEmail: result.user.email,
            companyName: result.company.name,
          });
        } catch (provisionError) {
          console.error('❌ Demo workspace provisioning failed:', provisionError);
          // Demo signup must still succeed even if seed job has a transient failure.
        }
      }
    }

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
          affiliateCode: normalizedAffiliateCode || undefined
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
        isPrimaryContact: result.user.isPrimaryContact,
        isDemoSignup: Boolean((result as any).isDemoSignup),
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


