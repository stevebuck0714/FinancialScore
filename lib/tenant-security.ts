import { headers } from 'next/headers'
import prisma from './prisma'
import { ensureLegacyCompanyAccess } from './user-company-access'

/**
 * Tenant Security & Authorization Helpers
 * 
 * These functions enforce multi-tenant data isolation and prevent
 * cross-tenant data access in API routes.
 */

export interface UserContext {
  userId: string
  email: string
  role: 'SITEADMIN' | 'CONSULTANT' | 'USER'
  companyId: string | null
  consultantId: string | null
  companyRole?: string | null
}

const DEV_AUTH_BYPASS_ENABLED =
  process.env.NODE_ENV !== 'production' &&
  process.env.DISABLE_AUTH_SIGNIN === '1'

function normalizeRole(value: string | null): UserContext['role'] | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'SITEADMIN' || normalized === 'CONSULTANT' || normalized === 'USER') {
    return normalized
  }
  return null
}

function getUserCompanyAccessDelegate():
  | {
      findUnique: (...args: unknown[]) => Promise<unknown>;
      findMany: (...args: unknown[]) => Promise<unknown[]>;
    }
  | null {
  const delegate = (prisma as unknown as Record<string, unknown>).userCompanyAccess as Record<string, unknown> | undefined
  if (!delegate) return null
  if (typeof delegate.findUnique !== 'function' || typeof delegate.findMany !== 'function') return null
  return delegate as unknown as {
    findUnique: (...args: unknown[]) => Promise<unknown>;
    findMany: (...args: unknown[]) => Promise<unknown[]>;
  }
}

function membershipCompanyIds(rows: unknown[]): string[] {
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') return ''
      const companyId = (row as Record<string, unknown>).companyId
      return String(companyId || '').trim()
    })
    .filter(Boolean)
}

/**
 * Get the current authenticated user's context from request headers
 * Headers are set by middleware.ts after validating JWT token
 */
export async function getUserContext(): Promise<UserContext | null> {
  if (DEV_AUTH_BYPASS_ENABLED) {
    return {
      userId: 'dev-bypass-user',
      email: 'dev-bypass@localhost',
      role: 'SITEADMIN',
      companyId: null,
      consultantId: null,
    }
  }

  const headersList = headers()
  
  const userId = headersList.get('x-user-id')
  const email = headersList.get('x-user-email')
  const roleFromHeader = normalizeRole(headersList.get('x-user-role'))
  const activeCompanyId = headersList.get('x-active-company-id')
  const companyIdFromHeader = headersList.get('x-company-id')
  const consultantIdFromHeader = headersList.get('x-consultant-id')
  
  if (!userId || !email) {
    return null
  }

  let role = roleFromHeader
  let companyId = activeCompanyId || companyIdFromHeader
  let consultantId = consultantIdFromHeader

  // Backward-compatible fallback: older JWTs may miss role/company claims.
  // Hydrate from DB so authenticated users do not get rejected by strict header checks.
  if (!role) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        companyId: true,
        consultantId: true,
      },
    })

    const fallbackRole = normalizeRole(user?.role || null)
    if (!fallbackRole) {
      return null
    }
    role = fallbackRole
    companyId = companyId || user?.companyId || null
    consultantId = consultantId || user?.consultantId || null
  }
  
  return {
    userId,
    email,
    role,
    companyId: companyId || null,
    consultantId: consultantId || null,
  }
}

/**
 * Require user context or throw 401
 */
export async function requireAuth(): Promise<UserContext> {
  const context = await getUserContext()
  
  if (!context) {
    throw new Error('Unauthorized: Authentication required')
  }
  
  return context
}

/**
 * Check if user has site admin role
 */
export async function isSiteAdmin(): Promise<boolean> {
  const context = await getUserContext()
  return context?.role === 'SITEADMIN'
}

/**
 * Validate that the current user has access to a specific company
 * 
 * Access rules:
 * - Site admins can access any company
 * - Consultants can access their own companies
 * - Users can only access their own company
 */
export async function validateCompanyAccess(targetCompanyId: string): Promise<boolean> {
  const context = await getUserContext()
  
  if (!context) {
    return false
  }
  
  // Site admins have access to everything
  if (context.role === 'SITEADMIN') {
    return true
  }
  
  // Users can only access their own company
  if (context.role === 'USER') {
    if (context.companyId === targetCompanyId) return true
    await ensureLegacyCompanyAccess(context.userId)
    const userCompanyAccess = getUserCompanyAccessDelegate()
    if (!userCompanyAccess) return false
    const membership = await userCompanyAccess.findUnique({
      where: {
        userId_companyId: {
          userId: context.userId,
          companyId: targetCompanyId,
        },
      },
      select: { id: true },
    })
    return Boolean(membership)
  }
  
  // Consultants can access their companies
  if (context.role === 'CONSULTANT' && context.consultantId) {
    const company = await prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { consultantId: true }
    })
    if (company?.consultantId === context.consultantId) {
      return true
    }
    await ensureLegacyCompanyAccess(context.userId)
    const userCompanyAccess = getUserCompanyAccessDelegate()
    if (!userCompanyAccess) return false
    const membership = await userCompanyAccess.findUnique({
      where: {
        userId_companyId: {
          userId: context.userId,
          companyId: targetCompanyId,
        },
      },
      select: { id: true },
    })
    return Boolean(membership)
  }
  
  return false
}

/**
 * Validate that the current user has access to a specific consultant
 */
export async function validateConsultantAccess(targetConsultantId: string): Promise<boolean> {
  const context = await getUserContext()
  
  if (!context) {
    return false
  }
  
  // Site admins have access to everything
  if (context.role === 'SITEADMIN') {
    return true
  }
  
  // Consultants can only access their own data
  if (context.role === 'CONSULTANT') {
    return context.consultantId === targetConsultantId
  }
  
  // Regular users cannot access consultant data
  return false
}

/**
 * Validate that the current user has access to a specific user record
 */
export async function validateUserAccess(targetUserId: string): Promise<boolean> {
  const context = await getUserContext()
  
  if (!context) {
    return false
  }
  
  // Site admins have access to everything
  if (context.role === 'SITEADMIN') {
    return true
  }
  
  // Users can access their own record
  if (context.userId === targetUserId) {
    return true
  }
  
  // Consultants can access users in their companies
  if (context.role === 'CONSULTANT' && context.consultantId) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { consultantId: true, companyId: true }
    })
    
    if (targetUser?.consultantId === context.consultantId) {
      return true
    }
    
    // Also check if user belongs to one of consultant's companies
    if (targetUser?.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: targetUser.companyId },
        select: { consultantId: true }
      })
      
      return company?.consultantId === context.consultantId
    }
  }
  
  // Users in same company can access each other (e.g., for team features)
  if (context.role === 'USER') {
    await ensureLegacyCompanyAccess(context.userId)
    const userCompanyAccess = getUserCompanyAccessDelegate()
    const myMemberships = userCompanyAccess
      ? await userCompanyAccess.findMany({
          where: { userId: context.userId },
          select: { companyId: true },
        })
      : []
    const myCompanyIds = new Set(membershipCompanyIds(myMemberships))
    if (context.companyId) myCompanyIds.add(context.companyId)

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { companyId: true, id: true }
    })
    if (!targetUser) return false

    const targetMemberships = userCompanyAccess
      ? await userCompanyAccess.findMany({
          where: { userId: targetUser.id },
          select: { companyId: true },
        })
      : []
    const targetCompanyIds = new Set(membershipCompanyIds(targetMemberships))
    if (targetUser.companyId) targetCompanyIds.add(targetUser.companyId)

    for (const companyId of myCompanyIds) {
      if (targetCompanyIds.has(companyId)) return true
    }
    return false
  }
  
  return false
}

/**
 * Require site admin role or throw 403
 */
export async function requireSiteAdmin(): Promise<UserContext> {
  const context = await requireAuth()
  
  if (context.role !== 'SITEADMIN') {
    throw new Error('Forbidden: Site admin access required')
  }
  
  return context
}

/**
 * Require company access or throw 403
 */
export async function requireCompanyAccess(companyId: string): Promise<UserContext> {
  const context = await requireAuth()
  
  const hasAccess = await validateCompanyAccess(companyId)
  
  if (!hasAccess) {
    throw new Error('Forbidden: Access to this company denied')
  }
  
  return context
}

/**
 * Get companies that the current user has access to (for filtering queries)
 */
export async function getAccessibleCompanyIds(): Promise<string[]> {
  const context = await getUserContext()
  
  if (!context) {
    return []
  }
  
  // Site admins have access to all companies
  if (context.role === 'SITEADMIN') {
    const companies = await prisma.company.findMany({
      select: { id: true }
    })
    return companies.map(c => c.id)
  }
  
  // Consultants have access to their companies
  if (context.role === 'CONSULTANT' && context.consultantId) {
    const consultantCompanies = await prisma.company.findMany({
      where: { consultantId: context.consultantId },
      select: { id: true }
    })
    await ensureLegacyCompanyAccess(context.userId)
    const userCompanyAccess = getUserCompanyAccessDelegate()
    const memberships = userCompanyAccess
      ? await userCompanyAccess.findMany({
          where: { userId: context.userId },
          select: { companyId: true },
        })
      : []
    const idSet = new Set([
      ...consultantCompanies.map(c => c.id),
      ...membershipCompanyIds(memberships),
    ])
    return Array.from(idSet)
  }
  
  // Users have access to their own company only
  if (context.role === 'USER') {
    await ensureLegacyCompanyAccess(context.userId)
    const userCompanyAccess = getUserCompanyAccessDelegate()
    const memberships = userCompanyAccess
      ? await userCompanyAccess.findMany({
          where: { userId: context.userId },
          select: { companyId: true },
        })
      : []
    const ids = membershipCompanyIds(memberships)
    if (ids.length > 0) return ids
    if (context.companyId) return [context.companyId]
  }
  
  return []
}

/**
 * Build a Prisma where clause for company filtering based on user access
 */
export async function getCompanyAccessFilter(): Promise<{ id: { in: string[] } } | {}> {
  const companyIds = await getAccessibleCompanyIds()
  
  if (companyIds.length === 0) {
    // No access - return filter that matches nothing
    return { id: { in: [] } }
  }
  
  const context = await getUserContext()
  
  // Site admins get no filter (access all)
  if (context?.role === 'SITEADMIN') {
    return {}
  }
  
  // Everyone else gets filtered list
  return { id: { in: companyIds } }
}

