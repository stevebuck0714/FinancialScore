/**
 * Invoice generation utilities
 */

/**
 * Generates a unique invoice number
 * Format: INV-YYYYMMDD-XXXXX
 */
export function generateInvoiceNumber(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  
  return `INV-${year}${month}${day}-${random}`;
}

/**
 * Calculates billing period dates based on plan type
 */
export function calculateBillingPeriod(
  startDate: Date,
  planType: 'monthly' | 'quarterly' | 'annual'
): { start: Date; end: Date } {
  const start = new Date(startDate);
  const end = new Date(startDate);
  
  switch (planType) {
    case 'monthly':
      end.setMonth(end.getMonth() + 1);
      break;
    case 'quarterly':
      end.setMonth(end.getMonth() + 3);
      break;
    case 'annual':
      end.setFullYear(end.getFullYear() + 1);
      break;
  }
  
  // Subtract one day to get the last day of the period
  end.setDate(end.getDate() - 1);
  
  return { start, end };
}

/**
 * Calculates the next billing date based on plan type
 */
export function calculateNextBillingDate(
  lastBillingDate: Date,
  planType: 'monthly' | 'quarterly' | 'annual'
): Date {
  const nextDate = new Date(lastBillingDate);
  
  switch (planType) {
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'annual':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }
  
  return nextDate;
}

/**
 * Calculates due date (typically 7 days after invoice creation)
 */
export function calculateDueDate(invoiceDate: Date, daysUntilDue: number = 7): Date {
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + daysUntilDue);
  return dueDate;
}

/**
 * Checks if an invoice is overdue
 */
export function isInvoiceOverdue(dueDate: Date, status: string): boolean {
  if (status === 'paid' || status === 'cancelled') {
    return false;
  }
  return new Date() > new Date(dueDate);
}

/**
 * Gets the amount for a specific plan type
 */
export function getPlanAmount(
  company: {
    subscriptionMonthlyPrice?: number | null;
    subscriptionQuarterlyPrice?: number | null;
    subscriptionAnnualPrice?: number | null;
  },
  planType: 'monthly' | 'quarterly' | 'annual'
): number {
  switch (planType) {
    case 'monthly':
      return company.subscriptionMonthlyPrice || 0;
    case 'quarterly':
      return company.subscriptionQuarterlyPrice || 0;
    case 'annual':
      return company.subscriptionAnnualPrice || 0;
    default:
      return 0;
  }
}

