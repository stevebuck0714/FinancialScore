import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';

export async function PATCH(req: NextRequest) {
  try {
    const context = await requireAuth(); // Get authenticated user context
    
    const body = await req.json();
    const { userId, companyId, companyRole, sidebarAccess } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Fetch the user whose permissions are being modified
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyId: true, role: true, companyRole: true }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      );
    }

    const targetCompanyId = String(companyId || context.companyId || targetUser.companyId || '').trim();
    if (!targetCompanyId) {
      return NextResponse.json(
        { error: 'Company ID is required for permission updates' },
        { status: 400 }
      );
    }

    // Authorization check:
    // 1. Site Admins can modify anyone.
    // 2. Consultants can modify users in companies they manage.
    // 3. Company Admins can modify users in their own company.
    let hasPermission = false;
    if (context.role === 'SITEADMIN') {
      hasPermission = true;
    } else if (context.role === 'CONSULTANT') {
      hasPermission = await validateCompanyAccess(targetCompanyId);
    } else if (context.role === 'USER' && context.companyRole === 'admin') {
      // Company Admins can only modify users within their own company
      hasPermission = context.companyId === targetCompanyId;
    }

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions: Only Consultants, Site Admins, and Company Admins can modify user permissions' },
        { status: 403 }
      );
    }

    // Update the user's permissions
    await prisma.userCompanyAccess.upsert({
      where: {
        userId_companyId: {
          userId,
          companyId: targetCompanyId,
        },
      },
      update: {
        companyRole: companyRole || 'user',
        sidebarAccess: sidebarAccess || [],
      },
      create: {
        userId,
        companyId: targetCompanyId,
        companyRole: companyRole || 'user',
        sidebarAccess: sidebarAccess || [],
      },
    });

    // Keep legacy fields aligned for currently active company.
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        companyRole: companyRole || 'user',
        sidebarAccess: sidebarAccess || [],
      },
      select: {
        id: true,
        email: true,
        name: true,
        companyRole: true,
        sidebarAccess: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error('Error updating user permissions:', error);
    return NextResponse.json(
      { error: 'Failed to update user permissions' },
      { status: 500 }
    );
  }
}

