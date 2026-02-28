import prisma from '@/lib/prisma';

export type AccessibleCompany = {
  companyId: string;
  name: string;
  companyRole: string | null;
  sidebarAccess: unknown;
};

function getUserCompanyAccessDelegate():
  | {
      findMany: (...args: any[]) => Promise<any[]>;
      upsert: (...args: any[]) => Promise<any>;
      findUnique: (...args: any[]) => Promise<any>;
      create: (...args: any[]) => Promise<any>;
    }
  | null {
  const delegate = (prisma as any).userCompanyAccess;
  if (!delegate) return null;
  if (
    typeof delegate.findMany !== 'function' ||
    typeof delegate.upsert !== 'function' ||
    typeof delegate.findUnique !== 'function' ||
    typeof delegate.create !== 'function'
  ) {
    return null;
  }
  return delegate;
}

export async function listAccessibleCompaniesForUser(userId: string): Promise<AccessibleCompany[]> {
  const userCompanyAccess = getUserCompanyAccessDelegate();
  if (userCompanyAccess) {
    const memberships = await userCompanyAccess.findMany({
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

  // Compatibility fallback for environments where Prisma client was generated
  // before UserCompanyAccess model existed.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      companyId: true,
      companyRole: true,
      sidebarAccess: true,
      consultantId: true,
      role: true,
      consultantFirm: {
        select: {
          companies: {
            select: { id: true, name: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
      primaryConsultant: {
        select: {
          companies: {
            select: { id: true, name: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });
  if (!user) return [];

  const idSet = new Set<string>();
  const fallbackCompanies: AccessibleCompany[] = [];
  const pushCompany = (companyId: string, name: string) => {
    if (idSet.has(companyId)) return;
    idSet.add(companyId);
    fallbackCompanies.push({
      companyId,
      name,
      companyRole: user.companyRole || 'user',
      sidebarAccess: user.sidebarAccess,
    });
  };

  if (user.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { id: true, name: true },
    });
    if (company) pushCompany(company.id, company.name);
  }

  const consultantCompanies =
    user.consultantFirm?.companies || user.primaryConsultant?.companies || [];
  consultantCompanies.forEach((company) => pushCompany(company.id, company.name));

  if (fallbackCompanies.length > 0) return fallbackCompanies;
  return [];
}

export async function ensureLegacyCompanyAccess(userId: string): Promise<void> {
  const userCompanyAccess = getUserCompanyAccessDelegate();
  if (!userCompanyAccess) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      companyId: true,
      companyRole: true,
      sidebarAccess: true,
    },
  });

  if (!user?.companyId) return;

  await userCompanyAccess.upsert({
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
  const userCompanyAccess = getUserCompanyAccessDelegate();
  if (!userCompanyAccess) {
    return { created: false };
  }

  const existing = await userCompanyAccess.findUnique({
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

  await userCompanyAccess.create({
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
