import { z } from 'zod';

/**
 * Input Validation Schemas
 * 
 * Validates and sanitizes all API inputs to prevent injection attacks,
 * data corruption, and ensure data integrity.
 */

// ============= Common Schemas =============

export const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim()
  .max(255, 'Email too long');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const uuidSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid ID format')
  .min(20, 'ID too short')
  .max(30, 'ID too long');

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name required')
  .max(200, 'Name too long')
  .regex(/^[a-zA-Z0-9\s\-'.,&()]+$/, 'Name contains invalid characters');

export const phoneSchema = z
  .string()
  .regex(/^[\d\s\-+()]+$/, 'Invalid phone number format')
  .min(10, 'Phone number too short')
  .max(20, 'Phone number too long')
  .optional()
  .or(z.literal(''));

// ============= Authentication Schemas =============

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  businessType: z.enum(['business', 'consultant']),
  companyName: nameSchema.optional(),
  affiliateCode: z.string().trim().toUpperCase().max(50).optional(),
});

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32, 'Invalid token').max(128, 'Invalid token'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: passwordSchema,
});

export const mfaVerifySchema = z.object({
  userId: uuidSchema,
  token: z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits').or(
    z.string().regex(/^[A-Z0-9]{8}$/, 'Backup code must be 8 characters')
  ),
  isBackupCode: z.boolean().optional(),
});

// ============= Company Schemas =============

export const createCompanySchema = z.object({
  name: nameSchema,
  consultantId: uuidSchema,
  addressStreet: z.string().trim().max(200).optional(),
  addressCity: z.string().trim().max(100).optional(),
  addressState: z.string().trim().length(2, 'State must be 2 characters').optional(),
  addressZip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code').optional(),
  addressCountry: z.string().trim().length(2, 'Country must be 2 characters').optional(),
  industrySector: z.number().int().min(0).max(999).optional(),
  affiliateCode: z.string().trim().toUpperCase().max(50).optional(),
  linesOfBusiness: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    headcountPercentage: z.number().min(0).max(100),
  })).optional(),
});

export const updateCompanySchema = z.object({
  id: uuidSchema,
  name: nameSchema.optional(),
  addressStreet: z.string().trim().max(200).optional(),
  addressCity: z.string().trim().max(100).optional(),
  addressState: z.string().trim().length(2).optional(),
  addressZip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  addressCountry: z.string().trim().length(2).optional(),
  industrySector: z.number().int().min(0).max(999).optional(),
  linesOfBusiness: z.array(z.object({
    name: z.string().trim().min(1).max(100),
    headcountPercentage: z.number().min(0).max(100),
  })).optional(),
  headcountAllocations: z.record(z.number()).optional(),
  userDefinedAllocations: z.any().optional(), // JSON field
});

// ============= User Schemas =============

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema.optional(),
  title: z.string().trim().max(100).optional(),
  phone: phoneSchema,
  companyId: uuidSchema,
  userType: z.enum(['COMPANY', 'ASSESSMENT']),
});

export const updateUserSchema = z.object({
  id: uuidSchema,
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  title: z.string().trim().max(100).optional(),
  phone: phoneSchema,
  role: z.enum(['SITEADMIN', 'CONSULTANT', 'USER']).optional(),
});

// ============= Financial Schemas =============

export const createFinancialRecordSchema = z.object({
  companyId: uuidSchema,
  uploadedByUserId: uuidSchema,
  fileName: z.string().trim().min(1).max(500),
  rawData: z.any(), // JSON field
  columnMapping: z.any(), // JSON field
  monthlyData: z.array(z.object({
    monthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
    revenue: z.number().min(0).default(0),
    expense: z.number().min(0).default(0),
    cogsTotal: z.number().min(0).default(0),
    // ... other fields with defaults
  })).min(1, 'At least one month of data required'),
});

export const financialQuerySchema = z.object({
  companyId: uuidSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ============= Payment Schemas =============

export const paymentSchema = z.object({
  amount: z.number().positive('Amount must be positive').max(100000, 'Amount too large'),
  companyId: uuidSchema,
  subscriptionPlan: z.enum(['monthly', 'quarterly', 'annual']),
  billingPeriod: z.enum(['monthly', 'quarterly', 'annual']),
  
  // Card data (should be tokenized on client-side in production)
  cardNumber: z.string().regex(/^\d{13,19}$/, 'Invalid card number'),
  cardholderName: nameSchema,
  expirationMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Invalid month'),
  expirationYear: z.string().regex(/^\d{2,4}$/, 'Invalid year'),
  cvv: z.string().regex(/^\d{3,4}$/, 'Invalid CVV'),
  
  billingAddress: z.object({
    street: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().length(2),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  }),
  
  email: emailSchema.optional(),
  phone: phoneSchema,
  createSubscription: z.boolean().default(true),
});

// ============= Assessment Schemas =============

export const createAssessmentSchema = z.object({
  userId: uuidSchema,
  companyId: uuidSchema,
  responses: z.record(z.any()), // JSON field with dynamic structure
  notes: z.record(z.string()).default({}),
  overallScore: z.number().min(0).max(100),
  isCompleted: z.boolean().default(false),
});

export const updateAssessmentSchema = z.object({
  id: uuidSchema,
  responses: z.record(z.any()).optional(),
  notes: z.record(z.string()).optional(),
  overallScore: z.number().min(0).max(100).optional(),
  isCompleted: z.boolean().optional(),
});

// ============= QuickBooks Schemas =============

export const quickbooksSyncSchema = z.object({
  companyId: uuidSchema,
  userId: uuidSchema,
});

export const quickbooksCallbackSchema = z.object({
  code: z.string().min(1),
  state: uuidSchema, // This is the companyId
  realmId: z.string().min(1),
});

// ============= Consultant Schemas =============

export const createConsultantSchema = z.object({
  userId: uuidSchema,
  fullName: nameSchema,
  type: z.enum(['business', 'consultant']).optional(),
  companyName: nameSchema.optional(),
  address: z.string().trim().max(200).optional(),
  phone: phoneSchema,
  revenueSharePercentage: z.number().min(0).max(100).default(50),
  paymentMethod: z.string().trim().max(50).optional(),
  taxId: z.string().regex(/^\d{2}-\d{7}$|^\d{3}-\d{2}-\d{4}$/, 'Invalid Tax ID format').optional(),
});

// ============= Validation Helper =============

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const issues = (result.error as any).issues || (result.error as any).errors || [];
    const errors = issues.map((err: any) => `${(err.path || []).join('.')}: ${err.message}`);
    return { success: false, errors };
  }
}

/**
 * Express/Next.js middleware wrapper for validation
 */
export function validate<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    const result = schema.safeParse(data);
    
    if (!result.success) {
      const issues = (result.error as any).issues || (result.error as any).errors || [];
      const errors = issues
        .map((err: any) => `${(err.path || []).join('.')}: ${err.message}`)
        .join(', ');
      
      throw new Error(`Validation failed: ${errors}`);
    }
    
    return result.data;
  };
}

