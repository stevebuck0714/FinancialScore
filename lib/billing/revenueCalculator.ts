/**
 * Revenue calculation utilities
 */

interface Company {
  id: string;
  name: string;
  selectedSubscriptionPlan?: string | null;
  subscriptionMonthlyPrice?: number | null;
  subscriptionQuarterlyPrice?: number | null;
  subscriptionAnnualPrice?: number | null;
  subscriptionStatus?: string | null;
}

interface Invoice {
  amount: number;
  status: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
}

/**
 * Calculates Monthly Recurring Revenue (MRR) from a company's subscription
 */
export function calculateMRR(company: Company): number {
  if (company.subscriptionStatus !== 'active') {
    return 0;
  }

  const plan = company.selectedSubscriptionPlan?.toLowerCase();
  
  if (plan === 'monthly' && company.subscriptionMonthlyPrice) {
    return company.subscriptionMonthlyPrice;
  } else if (plan === 'quarterly' && company.subscriptionQuarterlyPrice) {
    return company.subscriptionQuarterlyPrice / 3;
  } else if (plan === 'annual' && company.subscriptionAnnualPrice) {
    return company.subscriptionAnnualPrice / 12;
  }
  
  return 0;
}

/**
 * Calculates Annual Recurring Revenue (ARR) from a company's subscription
 */
export function calculateARR(company: Company): number {
  return calculateMRR(company) * 12;
}

/**
 * Calculates total MRR from an array of companies
 */
export function calculateTotalMRR(companies: Company[]): number {
  return companies.reduce((total, company) => total + calculateMRR(company), 0);
}

/**
 * Calculates total ARR from an array of companies
 */
export function calculateTotalARR(companies: Company[]): number {
  return companies.reduce((total, company) => total + calculateARR(company), 0);
}

/**
 * Calculates total outstanding amount from unpaid invoices
 */
export function calculateOutstandingAmount(invoices: Invoice[]): number {
  return invoices
    .filter(inv => inv.status === 'pending' || inv.status === 'overdue')
    .reduce((total, inv) => total + inv.amount, 0);
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

/**
 * Calculates revenue growth percentage
 */
export function calculateRevenueGrowth(currentRevenue: number, previousRevenue: number): number {
  if (previousRevenue === 0) {
    return currentRevenue > 0 ? 100 : 0;
  }
  return ((currentRevenue - previousRevenue) / previousRevenue) * 100;
}

/**
 * Groups companies by consultant and calculates revenue per consultant
 */
export function calculateRevenueByConsultant(companies: Company[]): {
  consultantId: string;
  companyCount: number;
  mrr: number;
  arr: number;
  companies: Company[];
}[] {
  const grouped = companies.reduce((acc, company) => {
    const consultantId = company['consultantId' as keyof Company] as string;
    if (!acc[consultantId]) {
      acc[consultantId] = [];
    }
    acc[consultantId].push(company);
    return acc;
  }, {} as Record<string, Company[]>);

  return Object.entries(grouped).map(([consultantId, consultantCompanies]) => {
    const mrr = calculateTotalMRR(consultantCompanies);
    const arr = calculateTotalARR(consultantCompanies);
    
    return {
      consultantId,
      companyCount: consultantCompanies.length,
      mrr,
      arr,
      companies: consultantCompanies
    };
  });
}

