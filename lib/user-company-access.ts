import prisma from '@/lib/prisma';

export type AccessibleCompany = {
  companyId: string;
  name: string;
  companyRole: string | null;
  sidebarAccess: unknown;
};

export async function listAccessibleCompaniesForUser(userId: string): Promise<AccessibleCompany[]> {
  const memberships = await prisma.userCompanyAccess.findMany({
    where: { userId },
    select: {
      companyId: true,
      companyRole: true,
      sidebarAccess: true,
      company: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return memberships.map((m) => ({
    companyId: m.companyId,
    name: m.company.name,
    companyRole: m.companyRole,
    sidebarAccess: m.sidebarAccess,
  }));
}

export async function ensureLegacyCompanyAccess(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      companyId: true,
      companyRole: true,
      sidebarAccess: true,
    },
  });

  if (!user?.companyId) return;

  await prisma.userCompanyAccess.upsert({
    where: {
      userId_companyId: {
        userId,
        companyId: user.companyId,
      },
    },
    update: {},
    create: {
      userId,
      companyId: user.companyId,
      companyRole: user.companyRole || 'user',
      sidebarAccess: user.sidebarAccess ?? undefined,
    },
  });
}

export async function grantUserCompanyAccess(params: {
  userId: string;
  companyId: string;
  companyRole?: string;
  sidebarAccess?: unknown;
}): Promise<{ created: boolean }> {
  const existing = await prisma.userCompanyAccess.findUnique({
    where: {
      userId_companyId: {
        userId: params.userId,
        companyId: params.companyId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return { created: false };
  }

  await prisma.userCompanyAccess.create({
    data: {
      userId: params.userId,
      companyId: params.companyId,
      companyRole: params.companyRole || 'user',
      sidebarAccess:
        params.sidebarAccess === undefined ? undefined : (params.sidebarAccess as any),
    },
  });

  return { created: true };
}
