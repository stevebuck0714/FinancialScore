import prisma from './prisma'
import { getUserContext } from './tenant-security'
import { headers } from 'next/headers'

/**
 * Audit Logging System
 * 
 * Logs all sensitive operations for security, compliance, and forensics.
 * Required for SOC 2, GDPR, HIPAA compliance.
 */

export type AuditAction =
  // Authentication
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'
  | 'PASSWORD_CHANGED'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_VERIFIED'
  | 'MFA_FAILED'
  
  // Financial Data
  | 'FINANCIAL_RECORD_CREATED'
  | 'FINANCIAL_RECORD_VIEWED'
  | 'FINANCIAL_RECORD_UPDATED'
  | 'FINANCIAL_RECORD_DELETED'
  | 'FINANCIAL_DATA_EXPORTED'
  
  // Company Management
  | 'COMPANY_CREATED'
  | 'COMPANY_VIEWED'
  | 'COMPANY_UPDATED'
  | 'COMPANY_DELETED'
  | 'COMPANY_PRICING_UPDATED'
  
  // User Management
  | 'USER_CREATED'
  | 'USER_VIEWED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_ROLE_CHANGED'
  | 'USER_COMPANY_ACCESS_GRANTED'
  | 'USER_COMPANY_ACCESS_REVOKED'
  
  // Payments
  | 'PAYMENT_PROCESSED'
  | 'PAYMENT_FAILED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_UPDATED'
  
  // Integrations
  | 'QUICKBOOKS_CONNECTED'
  | 'QUICKBOOKS_DISCONNECTED'
  | 'QUICKBOOKS_SYNC_STARTED'
  | 'QUICKBOOKS_SYNC_COMPLETED'
  | 'QUICKBOOKS_SYNC_FAILED'
  
  // Access Control
  | 'UNAUTHORIZED_ACCESS_ATTEMPT'
  | 'FORBIDDEN_ACCESS_ATTEMPT'
  | 'RATE_LIMIT_EXCEEDED'
  
  // Data Access
  | 'ASSESSMENT_CREATED'
  | 'ASSESSMENT_VIEWED'
  | 'ASSESSMENT_UPDATED'
  | 'ASSESSMENT_DELETED'

export interface AuditLogEntry {
  action: AuditAction
  entityType: string
  entityId?: string
  changes?: Record<string, any>
  metadata?: Record<string, any>
  success?: boolean
  errorMessage?: string
}

/**
 * Log an audit event
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    // Get user context
    const context = await getUserContext()
    
    // Get request metadata
    const headersList = await headers()
    const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0] || 
                      headersList.get('x-real-ip') || 
                      'unknown'
    const userAgent = headersList.get('user-agent') || 'unknown'
    
    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        userId: context?.userId || null,
        userEmail: context?.email || 'anonymous',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || null,
        changes: entry.changes || null,
        ipAddress,
        userAgent,
        createdAt: new Date(),
      }
    })
    
    // Log to console for monitoring (in production, send to logging service)
    console.log('[AUDIT]', {
      timestamp: new Date().toISOString(),
      user: context?.email || 'anonymous',
      userId: context?.userId || 'unknown',
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ipAddress,
      success: entry.success !== false,
    })
  } catch (error) {
    // Never fail the request due to audit logging errors
    console.error('[AUDIT] Failed to log audit event:', error)
    console.error('[AUDIT] Entry that failed:', entry)
  }
}

/**
 * Log successful authentication
 */
export async function auditLoginSuccess(userId: string): Promise<void> {
  await auditLog({
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: userId,
    success: true,
  })
}

/**
 * Log failed authentication
 */
export async function auditLoginFailed(email: string, reason: string): Promise<void> {
  await auditLog({
    action: 'LOGIN_FAILED',
    entityType: 'User',
    metadata: { email, reason },
    success: false,
    errorMessage: reason,
  })
}

/**
 * Log financial data access
 */
export async function auditFinancialAccess(
  action: 'FINANCIAL_RECORD_CREATED' | 'FINANCIAL_RECORD_VIEWED' | 'FINANCIAL_RECORD_UPDATED' | 'FINANCIAL_RECORD_DELETED',
  recordId: string,
  companyId: string,
  changes?: Record<string, any>
): Promise<void> {
  await auditLog({
    action,
    entityType: 'FinancialRecord',
    entityId: recordId,
    changes,
    metadata: { companyId },
    success: true,
  })
}

/**
 * Log forbidden access attempt (authenticated but not authorized)
 */
export async function auditForbiddenAccess(
  resource: string,
  resourceId: string,
  attemptedAction: string
): Promise<void> {
  await auditLog({
    action: 'FORBIDDEN_ACCESS_ATTEMPT',
    entityType: resource,
    entityId: resourceId,
    metadata: { attemptedAction },
    success: false,
    errorMessage: 'Forbidden: Insufficient permissions',
  })
}

/**
 * Log company operations
 */
export async function auditCompanyOperation(
  action: 'COMPANY_CREATED' | 'COMPANY_VIEWED' | 'COMPANY_UPDATED' | 'COMPANY_DELETED' | 'COMPANY_PRICING_UPDATED',
  companyId: string,
  changes?: Record<string, any>
): Promise<void> {
  await auditLog({
    action,
    entityType: 'Company',
    entityId: companyId,
    changes,
    success: true,
  })
}

/**
 * Log user management operations
 */
export async function auditUserOperation(
  action:
    | 'USER_CREATED'
    | 'USER_VIEWED'
    | 'USER_UPDATED'
    | 'USER_DELETED'
    | 'USER_ROLE_CHANGED'
    | 'USER_COMPANY_ACCESS_GRANTED'
    | 'USER_COMPANY_ACCESS_REVOKED',
  userId: string,
  changes?: Record<string, any>
): Promise<void> {
  await auditLog({
    action,
    entityType: 'User',
    entityId: userId,
    changes,
    success: true,
  })
}

/**
 * Log MFA operations
 */
export async function auditMFAOperation(
  action: 'MFA_ENABLED' | 'MFA_DISABLED' | 'MFA_VERIFIED' | 'MFA_FAILED',
  userId: string,
  success: boolean = true
): Promise<void> {
  await auditLog({
    action,
    entityType: 'User',
    entityId: userId,
    success,
  })
}

/**
 * Log assessment operations
 */
export async function auditAssessmentOperation(
  action: 'ASSESSMENT_CREATED' | 'ASSESSMENT_VIEWED' | 'ASSESSMENT_UPDATED' | 'ASSESSMENT_DELETED',
  assessmentId: string,
  companyId: string,
  changes?: Record<string, any>
): Promise<void> {
  await auditLog({
    action,
    entityType: 'AssessmentRecord',
    entityId: assessmentId,
    changes,
    metadata: { companyId },
    success: true,
  })
}

