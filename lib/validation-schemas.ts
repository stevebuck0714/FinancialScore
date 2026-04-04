import { z } from 'zod';

/**
 * Input Validation Schemas
 * 
 * Validates and sanitizes all API inputs to prevent injection attacks,
 * data corruption, and ensure data integrity.
 */

// ============= Common Schemas =============

const emailSchema = z
  .string()
  .email('Invalid email address')
  .toLowerCase()
  .trim()
  .max(255, 'Email too long');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const uuidSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid ID format')
  .min(20, 'ID too short')
  .max(30, 'ID too long');

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name required')
  .max(200, 'Name too long')
  .regex(/^[a-zA-Z0-9\s\-'.,&()]+$/, 'Name contains invalid characters');

const phoneSchema = z
  .string()
  .regex(/^[\d\s\-+()]+$/, 'Invalid phone number format')
  .min(10, 'Phone number too short')
  .max(20, 'Phone number too long')
  .optional()
  .or(z.literal(''));

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

// ============= Financial Schemas =============

export const financialQuerySchema = z.object({
  companyId: uuidSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ============= Validation Helper =============

function formatValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    return { success: false, errors: formatValidationErrors(result.error) };
  }
}

