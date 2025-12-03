import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';

// GET all consultants (site admin only) or single consultant by ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('id');

    // If ID is provided, fetch single consultant
    if (consultantId) {
      const consultant = await prisma.consultant.findUnique({
        where: { id: consultantId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true
            }
          }
        }
      });

      if (!consultant) {
        return NextResponse.json(
          { error: 'Consultant not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        id: consultant.id,
        fullName: consultant.fullName,
        companyName: consultant.companyName,
        email: consultant.user.email,
        phone: consultant.phone,
        address: consultant.address,
        type: consultant.type,
        userId: consultant.userId
      });
    }

    // Otherwise, fetch all consultants
    const consultants = await prisma.consultant.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        companies: {
          select: {
            id: true,
            name: true,
            consultantId: true,
            industrySector: true,
            addressStreet: true,
            addressCity: true,
            addressState: true,
            addressZip: true,
            addressCountry: true,
            subscriptionMonthlyPrice: true,
            subscriptionQuarterlyPrice: true,
            subscriptionAnnualPrice: true,
            _count: {
              select: {
                users: true
              }
            }
          }
        },
        _count: {
          select: {
            companies: true
          }
        }
      },
      orderBy: { fullName: 'asc' }
    });

    return NextResponse.json({ consultants });
  } catch (error) {
    console.error('Error fetching consultants:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create new consultant
export async function POST(request: NextRequest) {
  try {
    const { 
      fullName, email, password, address, phone, type,
      companyName, companyAddress1, companyAddress2, companyCity, companyState, companyZip, companyWebsite
    } = await request.json();

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Full name, email, and password required' },
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

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: fullName,
          passwordHash,
          role: 'CONSULTANT',
          isPrimaryContact: true // New consultants are primary contacts
        }
      });

      const consultant = await tx.consultant.create({
        data: {
          userId: user.id,
          fullName,
          address: address || '',
          phone: phone || '',
          type: type || '',
          companyName: companyName || '',
          companyAddress1: companyAddress1 || '',
          companyAddress2: companyAddress2 || '',
          companyCity: companyCity || '',
          companyState: companyState || '',
          companyZip: companyZip || '',
          companyWebsite: companyWebsite || ''
        }
      });

      // Update user to link to consultant firm for team member queries
      await tx.user.update({
        where: { id: user.id },
        data: { consultantId: consultant.id }
      });

      return { user, consultant };
    });

    return NextResponse.json({
      consultant: {
        id: result.consultant.id,
        fullName: result.consultant.fullName,
        email: result.user.email,
        phone: result.consultant.phone,
        address: result.consultant.address,
        type: result.consultant.type,
        companyName: result.consultant.companyName,
        companyAddress1: result.consultant.companyAddress1,
        companyAddress2: result.consultant.companyAddress2,
        companyCity: result.consultant.companyCity,
        companyState: result.consultant.companyState,
        companyZip: result.consultant.companyZip,
        companyWebsite: result.consultant.companyWebsite
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating consultant:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT update consultant
export async function PUT(request: NextRequest) {
  try {
    const { 
      id, fullName, email, address, phone, type,
      companyName, companyAddress1, companyAddress2, companyCity, companyState, companyZip, companyWebsite,
      revenueSharePercentage
    } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Consultant ID required' },
        { status: 400 }
      );
    }

    // Get the consultant with user info
    const consultant = await prisma.consultant.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!consultant) {
      return NextResponse.json(
        { error: 'Consultant not found' },
        { status: 404 }
      );
    }

    // Normalize email to lowercase if provided
    const normalizedEmail = email ? email.toLowerCase().trim() : undefined;

    // Check if email is being changed and if it's already taken by another user
    if (normalizedEmail && normalizedEmail !== consultant.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail }
      });

      if (existingUser && existingUser.id !== consultant.userId) {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
    }

    // Update consultant and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update user email, name, and phone if provided
      const updateData: any = {};
      if (normalizedEmail) updateData.email = normalizedEmail;
      if (fullName) updateData.name = fullName;
      if (phone !== undefined) updateData.phone = phone;

      if (Object.keys(updateData).length > 0) {
        await tx.user.update({
          where: { id: consultant.userId },
          data: updateData
        });
      }

      // Update consultant info
      const consultantUpdateData: any = {};
      if (fullName !== undefined) consultantUpdateData.fullName = fullName;
      if (address !== undefined) consultantUpdateData.address = address;
      if (phone !== undefined) consultantUpdateData.phone = phone;
      if (type !== undefined) consultantUpdateData.type = type;
      if (companyName !== undefined) consultantUpdateData.companyName = companyName;
      if (companyAddress1 !== undefined) consultantUpdateData.companyAddress1 = companyAddress1;
      if (companyAddress2 !== undefined) consultantUpdateData.companyAddress2 = companyAddress2;
      if (companyCity !== undefined) consultantUpdateData.companyCity = companyCity;
      if (companyState !== undefined) consultantUpdateData.companyState = companyState;
      if (companyZip !== undefined) consultantUpdateData.companyZip = companyZip;
      if (companyWebsite !== undefined) consultantUpdateData.companyWebsite = companyWebsite;
      if (revenueSharePercentage !== undefined) consultantUpdateData.revenueSharePercentage = revenueSharePercentage;

      const updatedConsultant = await tx.consultant.update({
        where: { id },
        data: consultantUpdateData,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      });

      return updatedConsultant;
    });

    return NextResponse.json({ consultant: result });
  } catch (error) {
    console.error('Error updating consultant:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE consultant
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Consultant ID required' },
        { status: 400 }
      );
    }

    // This will cascade delete companies, users, records, etc.
    await prisma.consultant.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting consultant:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


