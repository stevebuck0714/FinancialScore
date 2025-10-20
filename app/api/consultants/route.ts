import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

// GET all consultants (site admin only)
export async function GET(request: NextRequest) {
  try {
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
    const { fullName, email, password, address, phone, type } = await request.json();

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Full name, email, and password required' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
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
          email,
          name: fullName,
          passwordHash,
          role: 'CONSULTANT'
        }
      });

      const consultant = await tx.consultant.create({
        data: {
          userId: user.id,
          fullName,
          address: address || '',
          phone: phone || '',
          type: type || ''
        }
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
        type: result.consultant.type
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
    const { id, fullName, email, address, phone, type } = await request.json();

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

    // Check if email is being changed and if it's already taken by another user
    if (email && email !== consultant.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email }
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
      // Update user email and name if provided
      const updateData: any = {};
      if (email) updateData.email = email;
      if (fullName) updateData.name = fullName;

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


