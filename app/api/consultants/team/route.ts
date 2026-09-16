import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { validatePassword } from '@/lib/password-validator';
import { requireAuth } from '@/lib/tenant-security';

async function requireTeamAdministrator(consultantId: string) {
  const context = await requireAuth();
  if (context.role === 'SITEADMIN') return context;
  if (
    context.role !== 'CONSULTANT' ||
    context.consultantId !== consultantId ||
    !context.isPrimaryContact
  ) {
    throw new Error('Forbidden: Consultant primary contact access required');
  }
  return context;
}

function authorizationErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unauthorized';
  const status = message.startsWith('Unauthorized') ? 401 : 403;
  return NextResponse.json({ error: message }, { status });
}

// GET all team members for a consultant
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const consultantId = searchParams.get('consultantId');

    if (!consultantId) {
      return NextResponse.json(
        { error: 'Consultant ID is required' },
        { status: 400 }
      );
    }
    try {
      await requireTeamAdministrator(consultantId);
    } catch (error) {
      return authorizationErrorResponse(error);
    }

    // Get all team members for this consultant
    const teamMembers = await prisma.user.findMany({
      where: {
        consultantId: consultantId,
        role: 'CONSULTANT'
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        title: true,
        isPrimaryContact: true,
        createdAt: true,
        mfaEnabled: true,
        companyAccess: {
          where: { company: { consultantId } },
          select: { companyId: true },
        },
      },
      orderBy: [
        { isPrimaryContact: 'desc' }, // Primary contact first
        { name: 'asc' }
      ]
    });

    return NextResponse.json({
      teamMembers: teamMembers.map(({ companyAccess, ...teamMember }) => ({
        ...teamMember,
        assignedCompanyIds: companyAccess.map((access) => access.companyId),
      })),
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add new team member to consultant firm
export async function POST(request: NextRequest) {
  try {
    const { consultantId, name, email, phone, title, password } = await request.json();

    // Validate required fields
    if (!consultantId || !name || !email || !password) {
      return NextResponse.json(
        { error: 'Consultant ID, name, email, and password are required' },
        { status: 400 }
      );
    }
    try {
      await requireTeamAdministrator(consultantId);
    } catch (error) {
      return authorizationErrorResponse(error);
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

    // Verify consultant exists
    const consultant = await prisma.consultant.findUnique({
      where: { id: consultantId }
    });

    if (!consultant) {
      return NextResponse.json(
        { error: 'Consultant not found' },
        { status: 404 }
      );
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create new team member
    const newTeamMember = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        phone: phone || undefined,
        title: title || undefined,
        role: 'CONSULTANT',
        consultantId,
        isPrimaryContact: false
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        title: true,
        isPrimaryContact: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      message: 'Team member added successfully',
      teamMember: newTeamMember
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding team member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove team member from consultant firm
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const consultantId = searchParams.get('consultantId');

    if (!userId || !consultantId) {
      return NextResponse.json(
        { error: 'User ID and Consultant ID are required' },
        { status: 400 }
      );
    }
    try {
      await requireTeamAdministrator(consultantId);
    } catch (error) {
      return authorizationErrorResponse(error);
    }

    // Get the user to check if they're primary contact
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user belongs to this consultant
    if (user.consultantId !== consultantId) {
      return NextResponse.json(
        { error: 'User does not belong to this consultant' },
        { status: 403 }
      );
    }

    // Prevent deletion of primary contact
    if (user.isPrimaryContact) {
      return NextResponse.json(
        { error: 'Cannot remove primary contact. Transfer primary contact role first.' },
        { status: 403 }
      );
    }

    // Delete the user
    await prisma.user.delete({
      where: { id: userId }
    });

    return NextResponse.json({
      message: 'Team member removed successfully'
    });
  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update team member or transfer primary contact
export async function PATCH(request: NextRequest) {
  try {
    const { userId, consultantId, name, email, phone, title, transferPrimary, companyIds } = await request.json();

    if (!userId || !consultantId) {
      return NextResponse.json(
        { error: 'User ID and Consultant ID are required' },
        { status: 400 }
      );
    }
    try {
      await requireTeamAdministrator(consultantId);
    } catch (error) {
      return authorizationErrorResponse(error);
    }

    // Get the user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user belongs to this consultant
    if (user.consultantId !== consultantId) {
      return NextResponse.json(
        { error: 'User does not belong to this consultant' },
        { status: 403 }
      );
    }

    // Handle primary contact transfer
    if (transferPrimary === true) {
      // Use a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Remove primary contact flag from current primary
        await tx.user.updateMany({
          where: {
            consultantId,
            isPrimaryContact: true
          },
          data: {
            isPrimaryContact: false
          }
        });

        // Set this user as primary contact
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: {
            isPrimaryContact: true
          }
        });

        return updatedUser;
      });

      return NextResponse.json({
        message: 'Primary contact transferred successfully',
        user: result
      });
    }

    if (companyIds !== undefined) {
      if (user.isPrimaryContact) {
        return NextResponse.json(
          { error: 'Primary contact has access to all firm companies and cannot have assignments changed.' },
          { status: 400 }
        );
      }
      if (!Array.isArray(companyIds) || companyIds.some((id) => typeof id !== 'string')) {
        return NextResponse.json({ error: 'companyIds must be an array of company IDs' }, { status: 400 });
      }

      const normalizedCompanyIds = [...new Set(companyIds.map((id) => id.trim()).filter(Boolean))];
      const ownedCompanies = await prisma.company.findMany({
        where: { id: { in: normalizedCompanyIds }, consultantId },
        select: { id: true },
      });
      if (ownedCompanies.length !== normalizedCompanyIds.length) {
        return NextResponse.json(
          { error: 'Every assigned company must belong to this consultant firm.' },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.userCompanyAccess.deleteMany({
          where: {
            userId,
            company: { consultantId },
          },
        });
        if (normalizedCompanyIds.length > 0) {
          await tx.userCompanyAccess.createMany({
            data: normalizedCompanyIds.map((companyId) => ({
              userId,
              companyId,
              companyRole: 'user',
            })),
            skipDuplicates: true,
          });
        }
      });

      return NextResponse.json({
        message: 'Team member company assignments updated successfully',
        assignedCompanyIds: normalizedCompanyIds,
      });
    }

    // Regular update
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (title !== undefined) updateData.title = title;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        title: true,
        isPrimaryContact: true
      }
    });

    return NextResponse.json({
      message: 'Team member updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

