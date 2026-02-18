import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { requireAuth, validateCompanyAccess, isSiteAdmin, requireCompanyAccess } from '@/lib/tenant-security';
import { auditUserOperation, auditForbiddenAccess } from '@/lib/audit-logger';
import { createUserSchema, validateInput } from '@/lib/validation-schemas';

// GET users for a company (or all users if no companyId provided - for site admin)
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const context = await requireAuth();
    
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const userType = searchParams.get('userType');

    // SECURITY: Validate access to company data
    if (companyId) {
      const hasAccess = await validateCompanyAccess(companyId);
      if (!hasAccess) {
        await auditForbiddenAccess('User', companyId, 'READ_BY_COMPANY');
        return NextResponse.json(
          { error: 'Forbidden: Access to this company denied' },
          { status: 403 }
        );
      }
    } else {
      // Querying all users without companyId filter - only site admins can do this
      const isAdmin = await isSiteAdmin();
      if (!isAdmin) {
        await auditForbiddenAccess('User', 'all', 'READ_ALL');
        return NextResponse.json(
          { error: 'Forbidden: Site admin access required' },
          { status: 403 }
        );
      }
    }

    // Build where clause
    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }
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
        companyRole: true,
        sidebarAccess: true,
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
    const body = await request.json();
    
    // SECURITY: Validate input
    const validation = validateInput(createUserSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }
    
    const { name, title, phone, email, password, companyId, userType } = validation.data;

    // SECURITY: Validate access to company
    let userContext;
    try {
      userContext = await requireCompanyAccess(companyId);
    } catch (error) {
      await auditForbiddenAccess('User', companyId, 'CREATE');
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    // SECURITY: Check if user has permission to add users
    // Only Consultants, Site Admins, and Company Admins can add users
    if (userContext.role === 'USER') {
      // Regular company users must be Company Admins to add users
      const requestingUser = await prisma.user.findUnique({
        where: { id: userContext.userId },
        select: { companyRole: true }
      });

      if (requestingUser?.companyRole !== 'admin') {
        await auditForbiddenAccess('User', companyId, 'CREATE');
        return NextResponse.json(
          { error: 'Forbidden: Only Company Admins can add users' },
          { status: 403 }
        );
      }
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

    // Get company's consultantId to link the user
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { consultantId: true }
    });

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        title,
        phone,
        passwordHash,
        role: 'USER',
        userType,
        companyId,
        consultantId: company?.consultantId || null
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
        consultantId: true,
        createdAt: true
      }
    });

    // AUDIT: Log user creation
    await auditUserOperation('USER_CREATED', user.id, {
      email: user.email,
      role: user.role,
      companyId: user.companyId,
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

    // SECURITY: First, check if user exists and get their companyId
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, companyId: true, role: true }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // SECURITY: Validate access to company or user
    let userContext;
    if (targetUser.companyId) {
      try {
        userContext = await requireCompanyAccess(targetUser.companyId);
      } catch (error) {
        await auditForbiddenAccess('User', id, 'DELETE');
        return NextResponse.json(
          { error: 'Forbidden: Access to this user denied' },
          { status: 403 }
        );
      }
    } else {
      userContext = await requireAuth();
    }

    // SECURITY: Check if user has permission to delete users
    // Only Consultants, Site Admins, and Company Admins can delete users
    if (userContext.role === 'USER' && targetUser.companyId) {
      const requestingUser = await prisma.user.findUnique({
        where: { id: userContext.userId },
        select: { companyRole: true }
      });

      if (requestingUser?.companyRole !== 'admin') {
        await auditForbiddenAccess('User', id, 'DELETE');
        return NextResponse.json(
          { error: 'Forbidden: Only Company Admins can delete users' },
          { status: 403 }
        );
      }
    }

    // SECURITY: Prevent users from deleting themselves
    const context = userContext;
    if (context.userId === id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      );
    }

    // SECURITY: Only site admins can delete other admins
    if (targetUser.role === 'SITEADMIN' && context.role !== 'SITEADMIN') {
      await auditForbiddenAccess('User', id, 'DELETE');
      return NextResponse.json(
        { error: 'Forbidden: Cannot delete admin users' },
        { status: 403 }
      );
    }

    // Delete the user
    await prisma.user.delete({
      where: { id }
    });

    // AUDIT: Log user deletion
    await auditUserOperation('USER_DELETED', id, {
      email: targetUser.email,
      role: targetUser.role,
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

