import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';

// GET users for a company
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const userType = searchParams.get('userType');

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID required' },
        { status: 400 }
      );
    }

    const where: any = { companyId };
    if (userType) {
      where.userType = userType;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        title: true,
        phone: true,
        email: true,
        userType: true,
        role: true,
        companyId: true,
        createdAt: true
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST create new user
export async function POST(request: NextRequest) {
  try {
    const { name, title, phone, email, password, companyId, userType } = await request.json();

    if (!name || !email || !password || !companyId || !userType) {
      return NextResponse.json(
        { error: 'All fields required: name, email, password, companyId, userType' },
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

    // Check assessment user limit (max 5)
    if (userType === 'ASSESSMENT') {
      const assessmentUserCount = await prisma.user.count({
        where: {
          companyId,
          userType: 'ASSESSMENT'
        }
      });

      if (assessmentUserCount >= 5) {
        return NextResponse.json(
          { error: 'Maximum 5 assessment users per company' },
          { status: 400 }
        );
      }
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        title,
        phone,
        passwordHash,
        role: 'USER',
        userType,
        companyId
      },
      select: {
        id: true,
        name: true,
        title: true,
        phone: true,
        email: true,
        userType: true,
        role: true,
        companyId: true,
        createdAt: true
      }
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE user
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

