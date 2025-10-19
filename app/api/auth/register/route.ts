import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { name, email, password, fullName, address, phone, type } = await request.json();

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

    // Create user, consultant, and company (for business users) in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'CONSULTANT'
        }
      });

      const consultant = await tx.consultant.create({
        data: {
          userId: user.id,
          fullName: fullName || name,
          address: address || '',
          phone: phone || '',
          type: type || ''
        }
      });

      // Automatically create a company for business users
      let company = null;
      if (type === 'business') {
        company = await tx.company.create({
          data: {
            name: name, // Use the business name as company name
            consultantId: consultant.id
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


