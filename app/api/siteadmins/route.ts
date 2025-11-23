import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { validatePassword } from '@/lib/password-validator';

const prisma = new PrismaClient();

// GET - Fetch all site administrators
export async function GET() {
  try {
    const siteAdmins = await prisma.user.findMany({
      where: {
        role: 'siteadmin'
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(siteAdmins);
  } catch (error) {
    console.error('Error fetching site administrators:', error);
    return NextResponse.json({ error: 'Failed to fetch site administrators' }, { status: 500 });
  }
}

// POST - Create a new site administrator
export async function POST(request: Request) {
  try {
    const { firstName, lastName, email, password } = await request.json();

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      return NextResponse.json(
        { error: 'All fields are required' },
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
        { error: 'Email already exists' },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the site administrator
    const newAdmin = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'siteadmin',
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      }
    });

    return NextResponse.json(newAdmin);
  } catch (error) {
    console.error('Error creating site administrator:', error);
    return NextResponse.json({ error: 'Failed to create site administrator' }, { status: 500 });
  }
}

// DELETE - Delete a site administrator
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting site administrator:', error);
    return NextResponse.json({ error: 'Failed to delete site administrator' }, { status: 500 });
  }
}

