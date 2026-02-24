import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { requireAuth, validateCompanyAccess, isSiteAdmin, requireCompanyAccess } from '@/lib/tenant-security';
import { auditUserOperation, auditForbiddenAccess } from '@/lib/audit-logger';
import { createUserSchema, validateInput } from '@/lib/validation-schemas';
import { grantUserCompanyAccess } from '@/lib/user-company-access';

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

    let users: Array<{
      id: string;
      name: string;
      title: string | null;
      phone: string | null;
      email: string;
      userType: any;
      role: any;
      companyRole: string | null;
      sidebarAccess: any;
      companyId: string | null;
      createdAt: Date;
    }> = [];

    if (companyId) {
      const memberships = await prisma.userCompanyAccess.findMany({
        where: {
          companyId,
          ...(userType ? { user: { userType: userType as any } } : {}),
        },
        select: {
          user: {
            select: {
              id: true,
              name: true,
              title: true,
              phone: true,
              email: true,
              userType: true,
              role: true,
              companyId: true,
              createdAt: true,
              companyRole: true,
              sidebarAccess: true,
            },
          },
          companyRole: true,
          sidebarAccess: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      users = memberships.map((m) => ({
        ...m.user,
        companyId,
        companyRole: m.companyRole || m.user.companyRole,
        sidebarAccess: (m.sidebarAccess ?? m.user.sidebarAccess) as any,
      }));

      if (users.length === 0) {
        const fallbackUsers = await prisma.user.findMany({
          where: {
            companyId,
            ...(userType ? { userType: userType as any } : {}),
          },
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
            createdAt: true,
          },
          orderBy: { name: 'asc' },
        });
        users = fallbackUsers;
      }
    } else {
      users = await prisma.user.findMany({
        where: userType ? { userType: userType as any } : undefined,
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
          createdAt: true,
        },
        orderBy: { name: 'asc' },
      });
    }

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
    // Treat blank password as "not provided" for existing-user linking flow.
    if (typeof body?.password === 'string' && body.password.trim() === '') {
      body.password = undefined;
    }
    
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
      const membership = await prisma.userCompanyAccess.findUnique({
        where: {
          userId_companyId: {
            userId: userContext.userId,
            companyId,
          },
        },
        select: { companyRole: true },
      });
      const requestingUser = membership || (await prisma.user.findUnique({
        where: { id: userContext.userId },
        select: { companyRole: true }
      }));

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
      // Preserve existing identity; if it has no display name yet, fill it from input.
      if ((!existingUser.name || !existingUser.name.trim()) && name.trim()) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { name: name.trim() },
        });
      }

      // Existing identity: grant access to this company (no new password needed).
      const grant = await grantUserCompanyAccess({
        userId: existingUser.id,
        companyId,
        companyRole: userType === 'COMPANY' ? 'user' : undefined,
      });

      if (!grant.created) {
        return NextResponse.json(
          { error: 'User already has access to this company' },
          { status: 409 }
        );
      }

      await auditUserOperation('USER_COMPANY_ACCESS_GRANTED', existingUser.id, {
        email: existingUser.email,
        companyId,
        userType,
      });

      const linkedUser = await prisma.user.findUnique({
        where: { id: existingUser.id },
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
          createdAt: true,
        },
      });

      return NextResponse.json(
        { user: linkedUser, linkedExistingUser: true },
        { status: 201 }
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

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required when creating a new user' },
        { status: 400 }
      );
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        {
          error: 'Password does not meet requirements',
          details: passwordValidation.errors,
        },
        { status: 400 }
      );
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

    await grantUserCompanyAccess({
      userId: user.id,
      companyId,
      companyRole: userType === 'COMPANY' ? 'user' : undefined,
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
    const requestedCompanyId = searchParams.get('companyId');

    if (!id) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // SECURITY: First, check if user exists and get their companyId
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, companyId: true, consultantId: true, role: true }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // SECURITY: Validate caller identity first; action-specific authorization follows.
    const userContext = await requireAuth();

    // SECURITY: Check if user has permission to delete users
    // Only Consultants, Site Admins, and Company Admins can delete users
    const memberships = await prisma.userCompanyAccess.findMany({
      where: { userId: id },
      select: { companyId: true, companyRole: true, sidebarAccess: true },
      orderBy: { createdAt: 'asc' },
    });

    const context = userContext;
    const activeCompanyId = context.companyId || null;
    const targetCompanyForAction =
      requestedCompanyId ||
      activeCompanyId ||
      targetUser.companyId ||
      memberships[0]?.companyId ||
      null;
    const membershipForActionCompany = targetCompanyForAction
      ? memberships.find((m) => m.companyId === targetCompanyForAction)
      : null;

    if (!targetCompanyForAction && context.role !== 'SITEADMIN') {
      await auditForbiddenAccess('User', id, 'DELETE');
      return NextResponse.json(
        { error: 'Forbidden: No company scope for this delete action' },
        { status: 403 }
      );
    }

    if (userContext.role === 'USER') {
      const callerMembership = targetCompanyForAction
        ? await prisma.userCompanyAccess.findUnique({
        where: {
          userId_companyId: {
            userId: userContext.userId,
            companyId: targetCompanyForAction,
          },
        },
        select: { companyRole: true },
      })
        : null;
      if (callerMembership?.companyRole !== 'admin') {
        await auditForbiddenAccess('User', id, 'DELETE');
        return NextResponse.json(
          { error: 'Forbidden: Only Company Admins can delete users' },
          { status: 403 }
        );
      }

      if (
        targetCompanyForAction &&
        !memberships.some((m) => m.companyId === targetCompanyForAction) &&
        targetUser.companyId !== targetCompanyForAction
      ) {
        await auditForbiddenAccess('User', id, 'DELETE');
        return NextResponse.json(
          { error: 'Forbidden: Target user is not in this company' },
          { status: 403 }
        );
      }
    } else if (userContext.role === 'CONSULTANT' && targetCompanyForAction) {
      const hasAccess = await validateCompanyAccess(targetCompanyForAction);
      if (!hasAccess) {
        await auditForbiddenAccess('User', id, 'DELETE');
        return NextResponse.json(
          { error: 'Forbidden: Access to this user denied' },
          { status: 403 }
        );
      }
    }

    // SECURITY: Prevent users from deleting themselves
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

    // In Manage Users, "delete user" means disconnect this user from this company only.
    // Keep the underlying identity (email/password) so the user can be re-granted later.
    if (targetCompanyForAction) {
      if (membershipForActionCompany) {
        await prisma.userCompanyAccess.delete({
          where: {
            userId_companyId: {
              userId: id,
              companyId: membershipForActionCompany.companyId,
            },
          },
        });
      } else if (targetUser.companyId !== targetCompanyForAction) {
        return NextResponse.json(
          { error: 'User is not linked to this company' },
          { status: 404 }
        );
      }

      // Recompute remaining memberships after disconnect for canonical user fields.
      const remainingMemberships = await prisma.userCompanyAccess.findMany({
        where: { userId: id },
        select: { companyId: true, companyRole: true, sidebarAccess: true },
        orderBy: { createdAt: 'asc' },
      });
      const firstRemaining = remainingMemberships[0];

      const shouldClearLegacyCompany = targetUser.companyId === targetCompanyForAction;
      await prisma.user.update({
        where: { id },
        data: shouldClearLegacyCompany
          ? {
              companyId: firstRemaining?.companyId || null,
              companyRole: firstRemaining?.companyRole || null,
              sidebarAccess: (firstRemaining?.sidebarAccess as any) ?? null,
            }
          : {},
      });

      await auditUserOperation('USER_COMPANY_ACCESS_REVOKED', id, {
        email: targetUser.email,
        companyId: targetCompanyForAction,
      });

      return NextResponse.json({ success: true, revokedAccessOnly: true });
    }

    return NextResponse.json(
      { error: 'Company context is required for this action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

