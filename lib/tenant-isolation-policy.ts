/**
 * Pure tenant-isolation authorization policy.
 *
 * Mirrors the access rules enforced by `lib/tenant-security.ts`
 * (`validateCompanyAccess`, `validateConsultantAccess`) so negative tests
 * can run without Next.js request headers or a live database.
 *
 * Keep this policy aligned with `lib/tenant-security.ts` during code review.
 */

export type TenantRole = 'SITEADMIN' | 'CONSULTANT' | 'USER';

export type CompanyAccessDecisionInput = {
  role: TenantRole | null;
  activeCompanyId: string | null;
  consultantId: string | null;
  /** Whether this consultant is the primary contact for their firm. */
  isPrimaryContact?: boolean;
  /** Explicit UserCompanyAccess membership company IDs for the actor. */
  membershipCompanyIds: string[];
  targetCompanyId: string;
  /** Owning consultant for the target company, if any. */
  targetCompanyConsultantId: string | null;
};

export type ConsultantAccessDecisionInput = {
  role: TenantRole | null;
  consultantId: string | null;
  targetConsultantId: string;
};

/**
 * Decide whether an authenticated actor may access a target company.
 * Returns false when unauthenticated / unknown role.
 */
export function decideCompanyAccess(input: CompanyAccessDecisionInput): boolean {
  if (!input.role) return false;

  const targetCompanyId = String(input.targetCompanyId || '').trim();
  if (!targetCompanyId) return false;

  if (input.role === 'SITEADMIN') {
    return true;
  }

  const membershipIds = new Set(
    (input.membershipCompanyIds || []).map((id) => String(id || '').trim()).filter(Boolean)
  );

  if (input.role === 'USER') {
    if (input.activeCompanyId && input.activeCompanyId === targetCompanyId) {
      return true;
    }
    return membershipIds.has(targetCompanyId);
  }

  if (input.role === 'CONSULTANT') {
    if (
      input.isPrimaryContact === true &&
      input.consultantId &&
      input.targetCompanyConsultantId &&
      input.consultantId === input.targetCompanyConsultantId
    ) {
      return true;
    }
    return membershipIds.has(targetCompanyId);
  }

  return false;
}

/**
 * Decide whether an authenticated actor may access a target consultant record.
 */
export function decideConsultantAccess(input: ConsultantAccessDecisionInput): boolean {
  if (!input.role) return false;

  const targetConsultantId = String(input.targetConsultantId || '').trim();
  if (!targetConsultantId) return false;

  if (input.role === 'SITEADMIN') {
    return true;
  }

  if (input.role === 'CONSULTANT') {
    return Boolean(input.consultantId) && input.consultantId === targetConsultantId;
  }

  // Regular company users cannot access consultant-scoped data.
  return false;
}
