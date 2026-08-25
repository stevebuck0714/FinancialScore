import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getCompanyInvites,
  hashInviteToken,
  upsertCompanyInvites,
  type CompanyUserInvite,
} from '@/lib/company-invites';
import { validatePassword } from '@/lib/password-validator';
import { hashPassword } from '@/lib/auth';
import { grantUserCompanyAccess } from '@/lib/user-company-access';

type InviteLookup = {
  company: {
    id: string;
    name: string | null;
    consultantId: string | null;
    userDefinedAllocations: unknown;
  };
  invite: CompanyUserInvite;
};

async function findInviteByTokenHash(tokenHash: string): Promise<InviteLookup | null> {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      consultantId: true,
      userDefinedAllocations: true,
    },
  });

  for (const company of companies) {
    const invites = getCompanyInvites(company.userDefinedAllocations);
    const invite = invites.find((i) => String(i?.tokenHash || '') === tokenHash);
    if (invite) return { company, invite };
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const token = String(new URL(request.url).searchParams.get('token') || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const lookup = await findInviteByTokenHash(hashInviteToken(token));
    if (!lookup) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const invite = lookup.invite;
    const now = Date.now();
    const expired = new Date(invite.expiresAt).getTime() < now;
    if (invite.status !== 'pending' || expired) {
      return NextResponse.json({ error: 'Invite is no longer valid' }, { status: 410 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
      select: { id: true },
    });

    return NextResponse.json({
      company: { id: lookup.company.id, name: lookup.company.name },
      invite: {
        email: invite.email,
        name: invite.name,
        userType: invite.userType,
        expiresAt: invite.expiresAt,
        accountExists: Boolean(existingUser),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to read invite' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body?.token || '').trim();
    const name = String(body?.name || '').trim();
    const password = String(body?.password || '');
    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const lookup = await findInviteByTokenHash(hashInviteToken(token));
    if (!lookup) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    const { company, invite } = lookup;
    const nowIso = new Date().toISOString();
    const expired = new Date(invite.expiresAt).getTime() < Date.now();
    if (invite.status !== 'pending' || expired) {
      return NextResponse.json({ error: 'Invite is no longer valid' }, { status: 410 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!existingUser) {
      if (!name) {
        return NextResponse.json({ error: 'name is required for new users' }, { status: 400 });
      }
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return NextResponse.json(
          { error: 'Password does not meet requirements', details: passwordValidation.errors },
          { status: 400 },
        );
      }
    }

    const passwordHash = existingUser ? null : await hashPassword(password);
    const result = await prisma.$transaction(async (tx) => {
      let userId = existingUser?.id || '';
      if (!existingUser) {
        const created = await tx.user.create({
          data: {
            email: invite.email.toLowerCase(),
            name,
            passwordHash: passwordHash as string,
            role: 'USER',
            userType: invite.userType,
            companyId: company.id,
            consultantId: company.consultantId || null,
            companyRole: invite.userType === 'COMPANY' ? 'user' : null,
          },
          select: { id: true },
        });
        userId = created.id;
      }

      await grantUserCompanyAccess({
        userId,
        companyId: company.id,
        companyRole: invite.userType === 'COMPANY' ? 'user' : undefined,
        db: tx as typeof prisma,
      });

      const invites = getCompanyInvites(company.userDefinedAllocations);
      const nextInvites = invites.map((i) => {
        if (String(i?.id || '') !== String(invite.id)) return i;
        return {
          ...i,
          status: 'accepted' as const,
          acceptedAt: nowIso,
          acceptedByUserId: userId,
        };
      });
      const updatedUDA = upsertCompanyInvites(company.userDefinedAllocations, nextInvites);
      await tx.company.update({
        where: { id: company.id },
        data: { userDefinedAllocations: updatedUDA as any },
      });

      return { userId, existingAccount: Boolean(existingUser) };
    });

    return NextResponse.json({
      success: true,
      companyId: company.id,
      email: invite.email,
      existingAccount: result.existingAccount,
      message: result.existingAccount
        ? 'Invite accepted. Sign in with your existing credentials.'
        : 'Invite accepted. Sign in with your new credentials.',
    });
  } catch (error: any) {
    console.error('Accept invite failed:', error);
    const raw = String(error?.message || '');
    const message = /Foreign key constraint|prisma\.userCompanyAccess/i.test(raw)
      ? 'Failed to accept invite. Please try again.'
      : raw || 'Failed to accept invite';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

