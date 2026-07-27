import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';
import { validatePassword } from '@/lib/password-validator';

async function requireSiteAdmin() {
  const context = await requireAuth();
  if (context.role !== 'SITEADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

// GET - Fetch all site administrators
export async function GET() {
  try {
    const forbidden = await requireSiteAdmin();
    if (forbidden) return forbidden;

    const siteAdmins = await prisma.user.findMany({
      where: {
        role: 'SITEADMIN'
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
  } catch (error: any) {
    console.error('Error fetching site administrators:', error);
    if (String(error?.message || '').includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch site administrators' }, { status: 500 });
  }
}

// POST - Create a new site administrator
export async function POST(request: Request) {
  try {
    const forbidden = await requireSiteAdmin();
    if (forbidden) return forbidden;

    const body = await request.json().catch(() => ({}));
    const firstName = String(body?.firstName || '').trim();
    const lastName = String(body?.lastName || '').trim();
    const normalizedEmail = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    // Validate required fields
    if (!firstName || !lastName || !normalizedEmail || !password) {
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

    // Check if email already exists. Existing users can be promoted to site admin;
    // the User table has a unique email constraint, so creating a duplicate would fail.
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const promotedAdmin = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: `${firstName} ${lastName}`,
          passwordHash: hashedPassword,
          role: 'SITEADMIN',
          userType: null,
          companyId: null,
          consultantId: null,
          companyRole: 'user',
          sidebarAccess: null,
          operationalDashboardAccess: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        }
      });
      return NextResponse.json(promotedAdmin);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the site administrator
    const newAdmin = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`,
        email: normalizedEmail,
        passwordHash: hashedPassword,
        role: 'SITEADMIN',
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      }
    });

    return NextResponse.json(newAdmin);
  } catch (error: any) {
    console.error('Error creating site administrator:', error);
    if (String(error?.message || '').includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to create site administrator' }, { status: 500 });
  }
}

// DELETE - Delete a site administrator
export async function DELETE(request: Request) {
  try {
    const forbidden = await requireSiteAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting site administrator:', error);
    if (String(error?.message || '').includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete site administrator' }, { status: 500 });
  }
}

