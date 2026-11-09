import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { ensureLegacyCompanyAccess, listAccessibleCompaniesForUser } from '@/lib/user-company-access';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const context = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: context.userId },
      select: { id: true, role: true, isAccountManager: true },
    });
    if (!user || user.role !== 'USER') {
      await auditForbiddenAccess('AccountManagerAccounts', context.userId, 'READ');
      return NextResponse.json(
        { error: 'Forbidden: company user access required' },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }

    await ensureLegacyCompanyAccess(user.id);
    const accessible = await listAccessibleCompaniesForUser(user.id);
    const accountManager = user.isAccountManager;
    // Other company users only see My Accounts when they can switch between companies.
    if (!accountManager && accessible.length < 2) {
      await auditForbiddenAccess('AccountManagerAccounts', context.userId, 'READ');
      return NextResponse.json(
        { error: 'Forbidden: My Accounts requires access to more than one company' },
        { status: 403, headers: NO_STORE_HEADERS },
      );
    }
    const companyIds = accessible.map((c) => c.companyId).filter(Boolean);
    if (companyIds.length === 0) {
      return NextResponse.json(
        { accounts: [], activeCompanyId: null, accountManager },
        { headers: NO_STORE_HEADERS },
      );
    }

    const companies = await prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        accountingSystem: true,
        consultant: { select: { companyName: true, fullName: true } },
        accountingConnections: {
          select: { lastSyncAt: true },
          orderBy: { lastSyncAt: { sort: 'desc', nulls: 'last' } },
          take: 1,
        },
      },
    });
    const companyById = new Map(companies.map((company) => [company.id, company]));

    const accounts = accessible
      .map((entry) => {
        const company = companyById.get(entry.companyId);
        if (!company || company.name.includes(' (DELETED)')) return null;
        const summary = {
          companyId: company.id,
          name: company.name,
          companyRole: String(entry.companyRole || 'user').toLowerCase() === 'admin' ? 'admin' : 'user',
        };
        if (!accountManager) return summary;
        return {
          ...summary,
          owner: company.consultant?.companyName || company.consultant?.fullName || 'Standalone business',
          subscriptionStatus: company.subscriptionStatus || null,
          accountingSystem: company.accountingSystem || null,
          lastSyncAt: company.accountingConnections[0]?.lastSyncAt?.toISOString() || null,
        };
      })
      .filter((account): account is NonNullable<typeof account> => account !== null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const activeCompanyId =
      context.companyId && accounts.some((account) => account.companyId === context.companyId)
        ? context.companyId
        : null;

    return NextResponse.json({ accounts, activeCompanyId, accountManager }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401, headers: NO_STORE_HEADERS });
    }
    console.error('Error loading Account Manager accounts:', error);
    return NextResponse.json(
      { error: 'Failed to load accounts' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
