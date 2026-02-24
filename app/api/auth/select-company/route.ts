import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { ensureLegacyCompanyAccess } from '@/lib/user-company-access';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { companyId?: string };
    const companyId = String(body.companyId || '').trim();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    const sessionUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        consultantId: true,
        companyId: true,
      },
    });
    if (!sessionUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await ensureLegacyCompanyAccess(sessionUser.id);

    let hasAccess = false;
    if (sessionUser.role === 'SITEADMIN') {
      hasAccess = true;
    } else if (sessionUser.role === 'USER') {
      if (sessionUser.companyId === companyId) {
        hasAccess = true;
      } else {
        const membership = await prisma.userCompanyAccess.findUnique({
          where: {
            userId_companyId: {
              userId: sessionUser.id,
              companyId,
            },
          },
          select: { id: true },
        });
        hasAccess = Boolean(membership);
      }
    } else if (sessionUser.role === 'CONSULTANT') {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { consultantId: true },
      });
      if (company?.consultantId === sessionUser.consultantId) {
        hasAccess = true;
      } else {
        const membership = await prisma.userCompanyAccess.findUnique({
          where: {
            userId_companyId: {
              userId: sessionUser.id,
              companyId,
            },
          },
          select: { id: true },
        });
        hasAccess = Boolean(membership);
      }
    }
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Forbidden: Access to this company denied' },
        { status: 403 }
      );
    }

    const response = NextResponse.json({ ok: true, activeCompanyId: companyId });
    response.cookies.set('fs_active_company', companyId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    console.error('Error selecting active company:', error);
    return NextResponse.json(
      { error: 'Failed to set active company' },
      { status: 500 }
    );
  }
}
