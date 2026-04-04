/**
 * Revenue calculation utilities
 */

interface Invoice {
  amount: number;
  status: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
}

/**
 * Calculates total revenue for a specific period from paid invoices
 */
export function calculatePeriodRevenue(
  invoices: Invoice[],
  startDate: Date,
  endDate: Date
): number {
  return invoices
    .filter(inv => 
      inv.status === 'paid' &&
      new Date(inv.billingPeriodStart) >= startDate &&
      new Date(inv.billingPeriodEnd) <= endDate
    )
    .reduce((total, inv) => total + inv.amount, 0);
}

