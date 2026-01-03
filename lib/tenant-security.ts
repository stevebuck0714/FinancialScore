import { headers } from 'next/headers'
import prisma from './prisma'

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
}

/**
 * Get the current authenticated user's context from request headers
 * Headers are set by middleware.ts after validating JWT token
 */
export async function getUserContext(): Promise<UserContext | null> {
  const headersList = headers()
  
  const userId = headersList.get('x-user-id')
  const email = headersList.get('x-user-email')
  const role = headersList.get('x-user-role')
  const companyId = headersList.get('x-company-id')
  const consultantId = headersList.get('x-consultant-id')
  
  if (!userId || !email || !role) {
    return null
  }
  
  return {
    userId,
    email,
    role: role as 'SITEADMIN' | 'CONSULTANT' | 'USER',
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
 * Check if user has consultant role
 */
export async function isConsultant(): Promise<boolean> {
  const context = await getUserContext()
  return context?.role === 'CONSULTANT'
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
    return context.companyId === targetCompanyId
  }
  
  // Consultants can access their companies
  if (context.role === 'CONSULTANT' && context.consultantId) {
    const company = await prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { consultantId: true }
    })
    
    return company?.consultantId === context.consultantId
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
  if (context.role === 'USER' && context.companyId) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { companyId: true }
    })
    
    return targetUser?.companyId === context.companyId
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
 * Require consultant access or throw 403
 */
export async function requireConsultantAccess(consultantId: string): Promise<UserContext> {
  const context = await requireAuth()
  
  const hasAccess = await validateConsultantAccess(consultantId)
  
  if (!hasAccess) {
    throw new Error('Forbidden: Access to this consultant denied')
  }
  
  return context
}

/**
 * Require user access or throw 403
 */
export async function requireUserAccess(userId: string): Promise<UserContext> {
  const context = await requireAuth()
  
  const hasAccess = await validateUserAccess(userId)
  
  if (!hasAccess) {
    throw new Error('Forbidden: Access to this user denied')
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
    const companies = await prisma.company.findMany({
      where: { consultantId: context.consultantId },
      select: { id: true }
    })
    return companies.map(c => c.id)
  }
  
  // Users have access to their own company only
  if (context.role === 'USER' && context.companyId) {
    return [context.companyId]
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

