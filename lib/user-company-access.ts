import prisma from '@/lib/prisma';

export type AccessibleCompany = {
  companyId: string;
  name: string;
  companyRole: string | null;
  sidebarAccess: unknown;
  operationalDashboardAccess: unknown;
};

type CompanyAccessDb = typeof prisma;

function getUserCompanyAccessDelegate(db: CompanyAccessDb = prisma):
  | {
      findMany: (...args: any[]) => Promise<any[]>;
      upsert: (...args: any[]) => Promise<any>;
      findUnique: (...args: any[]) => Promise<any>;
      create: (...args: any[]) => Promise<any>;
    }
  | null {
  const delegate = (db as any).userCompanyAccess;
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
  const userContext = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      companyRole: true,
      sidebarAccess: true,
      operationalDashboardAccess: true,
    },
  });
  if (!userContext) return [];

  const userCompanyAccess = getUserCompanyAccessDelegate();
  if (userCompanyAccess) {
    const memberships = await userCompanyAccess.findMany({
      where: { userId },
      select: {
        companyId: true,
        companyRole: true,
        sidebarAccess: true,
        operationalDashboardAccess: true,
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

    if (userContext.role === 'SITEADMIN') {
      const membershipByCompanyId = new Map(
        memberships.map((m) => [
          m.companyId,
          {
            companyRole: m.companyRole,
            sidebarAccess: m.sidebarAccess,
            operationalDashboardAccess: m.operationalDashboardAccess,
          },
        ])
      );

      const allCompanies = await prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      });

      return allCompanies.map((company) => {
        const membership = membershipByCompanyId.get(company.id);
        return {
          companyId: company.id,
          name: company.name,
          companyRole: membership?.companyRole || userContext.companyRole || 'admin',
          sidebarAccess: membership?.sidebarAccess ?? userContext.sidebarAccess,
          operationalDashboardAccess:
            membership?.operationalDashboardAccess ?? userContext.operationalDashboardAccess,
        };
      });
    }

    return memberships.map((m) => ({
      companyId: m.companyId,
      name: m.company.name,
      companyRole: m.companyRole,
      sidebarAccess: m.sidebarAccess,
      operationalDashboardAccess: m.operationalDashboardAccess,
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
      operationalDashboardAccess: true,
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

  if (user.role === 'SITEADMIN') {
    const allCompanies = await prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    return allCompanies.map((company) => ({
      companyId: company.id,
      name: company.name,
      companyRole: user.companyRole || 'admin',
      sidebarAccess: user.sidebarAccess,
      operationalDashboardAccess: user.operationalDashboardAccess,
    }));
  }

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
      operationalDashboardAccess: user.operationalDashboardAccess,
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
      operationalDashboardAccess: true,
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
      operationalDashboardAccess: user.operationalDashboardAccess ?? undefined,
    },
  });
}

export async function grantUserCompanyAccess(params: {
  userId: string;
  companyId: string;
  companyRole?: string;
  sidebarAccess?: unknown;
  operationalDashboardAccess?: unknown;
  db?: CompanyAccessDb;
}): Promise<{ created: boolean }> {
  const db = params.db ?? prisma;
  const userCompanyAccess = getUserCompanyAccessDelegate(db);
  if (!userCompanyAccess) {
    return { created: false };
  }

  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { id: true },
  });
  if (!user) {
    throw new Error('Cannot grant company access because the user does not exist');
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
      operationalDashboardAccess:
        params.operationalDashboardAccess === undefined
          ? undefined
          : (params.operationalDashboardAccess as any),
    },
  });

  return { created: true };
}
