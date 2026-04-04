import prisma from '@/lib/prisma';

export type AccessibleCompany = {
  companyId: string;
  name: string;
  companyRole: string | null;
  sidebarAccess: unknown;
};

type UserCompanyAccessDelegate = {
  findMany: (...args: unknown[]) => Promise<unknown[]>;
  upsert: (...args: unknown[]) => Promise<unknown>;
  findUnique: (...args: unknown[]) => Promise<unknown>;
  create: (...args: unknown[]) => Promise<unknown>;
};

type MembershipRow = {
  companyId: string;
  companyRole: string | null;
  sidebarAccess: unknown;
  company: {
    name: string;
  };
};

function asSidebarAccess(value: unknown): unknown {
  return value === undefined ? undefined : value;
}

function asMembershipRows(rows: unknown[]): MembershipRow[] {
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const value = row as Record<string, unknown>;
      const company = (value.company && typeof value.company === 'object'
        ? value.company
        : {}) as Record<string, unknown>;
      const companyId = String(value.companyId || '').trim();
      const companyName = String(company.name || '').trim();
      if (!companyId || !companyName) return null;
      return {
        companyId,
        companyRole: value.companyRole ? String(value.companyRole) : null,
        sidebarAccess: value.sidebarAccess,
        company: { name: companyName },
      };
    })
    .filter((row): row is MembershipRow => Boolean(row));
}

async function fetchAllCompanies() {
  return prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
}

const USER_CONTEXT_SELECT = {
  role: true,
  companyRole: true,
  sidebarAccess: true,
} as const;

const FALLBACK_USER_SELECT = {
  companyId: true,
  companyRole: true,
  sidebarAccess: true,
  consultantId: true,
  role: true,
  consultantFirm: {
    select: {
      companies: {
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  primaryConsultant: {
    select: {
      companies: {
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} as const;

const LEGACY_USER_ACCESS_SELECT = {
  companyId: true,
  companyRole: true,
  sidebarAccess: true,
} as const;

function getUserCompanyAccessDelegate():
  | UserCompanyAccessDelegate
  | null {
  const delegate = (prisma as unknown as Record<string, unknown>).userCompanyAccess as Record<string, unknown> | undefined;
  if (!delegate) return null;
  if (
    typeof delegate.findMany !== 'function' ||
    typeof delegate.upsert !== 'function' ||
    typeof delegate.findUnique !== 'function' ||
    typeof delegate.create !== 'function'
  ) {
    return null;
  }
  return delegate as unknown as UserCompanyAccessDelegate;
}

export async function listAccessibleCompaniesForUser(userId: string): Promise<AccessibleCompany[]> {
  const userContext = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_CONTEXT_SELECT,
  });
  if (!userContext) return [];

  const userCompanyAccess = getUserCompanyAccessDelegate();
  if (userCompanyAccess) {
    const membershipsRaw = await userCompanyAccess.findMany({
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
    const memberships = asMembershipRows(membershipsRaw);

    if (userContext.role === 'SITEADMIN') {
      const membershipByCompanyId = new Map(
        memberships.map((m) => [
          m.companyId,
          {
            companyRole: m.companyRole,
            sidebarAccess: m.sidebarAccess,
          },
        ])
      );

      const allCompanies = await fetchAllCompanies();

      return allCompanies.map((company) => {
        const membership = membershipByCompanyId.get(company.id);
        return {
          companyId: company.id,
          name: company.name,
          companyRole: membership?.companyRole || userContext.companyRole || 'admin',
          sidebarAccess: membership?.sidebarAccess ?? userContext.sidebarAccess,
        };
      });
    }

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
    select: FALLBACK_USER_SELECT,
  });
  if (!user) return [];

  if (user.role === 'SITEADMIN') {
    const allCompanies = await fetchAllCompanies();
    return allCompanies.map((company) => ({
      companyId: company.id,
      name: company.name,
      companyRole: user.companyRole || 'admin',
      sidebarAccess: user.sidebarAccess,
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
    select: LEGACY_USER_ACCESS_SELECT,
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
      sidebarAccess: asSidebarAccess(params.sidebarAccess),
    },
  });

  return { created: true };
}
