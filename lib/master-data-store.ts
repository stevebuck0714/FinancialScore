import { z } from 'zod';

// Type definitions for master data
export interface MasterDataMonthly {
  date?: Date | string;
  month?: Date | string;
  revenue: number;
  // Flat structure with COGS and expense fields
  [key: string]: any;
}

export interface MasterDataResponse {
  monthlyData: MasterDataMonthly[];
  _source: string;
  months: number;
}

export interface CategoryData {
  key: string;
  label: string;
  category: 'COGS' | 'Expense';
  masterDataKey?: string;
  masterDataPath?: string;
  currentValue?: number;
}

export interface MonthlyPercentage {
  month: string;
  percentage: number;
}

export interface GoalCategory extends CategoryData {
  monthlyPercentages: MonthlyPercentage[];
  averagePercentage: number;
  goalPercentage?: number;
}

// Zod schemas for validation
const MasterDataMonthlySchema = z.object({
  date: z.union([z.date(), z.string()]).optional(),
  month: z.union([z.date(), z.string()]).optional(),
  revenue: z.number(),
}).catchall(z.any()); // Allow any additional properties

const MasterDataResponseSchema = z.object({
  monthlyData: z.array(MasterDataMonthlySchema),
  _source: z.string(),
  months: z.number(),
});

export class MasterDataStore {
  private static instance: MasterDataStore;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): MasterDataStore {
    if (!MasterDataStore.instance) {
      MasterDataStore.instance = new MasterDataStore();
    }
    return MasterDataStore.instance;
  }

  async fetchMasterData(companyId: string): Promise<{
    success: boolean;
    data?: MasterDataResponse;
    error?: string;
  }> {
    try {
      // Check cache first
      const cacheKey = `master-data-${companyId}`;
      const cached = this.cache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
        return { success: true, data: cached.data };
      }

      console.log(`🎯 Fetching master data for company: ${companyId}`);

      const response = await fetch(`/api/master-data?companyId=${companyId}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`
        };
      }

      const rawData = await response.json();

      // Validate the data structure
      const validatedData = MasterDataResponseSchema.parse(rawData);

      // Cache the result
      this.cache.set(cacheKey, { data: validatedData, timestamp: Date.now() });

      console.log(`✅ Master data loaded: ${validatedData.months} months`);
      return { success: true, data: validatedData };

    } catch (error) {
      console.error('❌ Master data fetch error:', error);

      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Data validation error: ${error.message}`
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  transformForGoals(masterData: MasterDataResponse): {
    cogsCategories: GoalCategory[];
    expenseCategories: GoalCategory[];
    last6Months: { month: string; date: Date }[];
  } {
    const categories = this.extractCategories(masterData);
    const last6Months = this.getLast6Months(masterData.monthlyData);

    // Separate COGS and expense categories
    const cogsCategories: GoalCategory[] = [];
    const expenseCategories: GoalCategory[] = [];

    categories.forEach(category => {
      const monthlyPercentages = this.calculateMonthlyPercentages(
        masterData.monthlyData,
        category,
        last6Months
      );

      const goalCategory: GoalCategory = {
        ...category,
        monthlyPercentages,
        averagePercentage: monthlyPercentages.reduce((sum, p) => sum + (isNaN(p.percentage) ? 0 : p.percentage), 0) / monthlyPercentages.length,
      };

      if (category.category === 'COGS') {
        cogsCategories.push(goalCategory);
      } else {
        expenseCategories.push(goalCategory);
      }
    });

    return {
      cogsCategories: cogsCategories.sort((a, b) => a.label.localeCompare(b.label)),
      expenseCategories: expenseCategories.sort((a, b) => a.label.localeCompare(b.label)),
      last6Months,
    };
  }

  private extractCategories(masterData: MasterDataResponse): CategoryData[] {
    const cogsCategories = new Set<string>();
    const expenseCategories = new Set<string>();

    masterData.monthlyData.forEach(month => {
      // Extract COGS categories (fields starting with 'cogs' but not 'cogsTotal')
      Object.keys(month).forEach(key => {
        if (key.startsWith('cogs') && key !== 'cogsTotal' && month[key] && month[key] !== 0) {
          cogsCategories.add(key);
        }
        // Extract operating expense categories (only true operating expenses)
        else if (
          // Only include known operating expense fields
          ['payroll', 'ownerBasePay', 'benefits', 'insurance', 'professionalFees', 'subcontractors',
           'rent', 'taxLicense', 'phoneComm', 'infrastructure', 'autoTravel', 'salesExpense',
           'marketing', 'trainingCert', 'mealsEntertainment', 'interestExpense', 'depreciationAmortization',
           'otherExpense', 'ownersRetirement', 'salesExpense', 'professionalFees', 'autoTravel'].includes(key) &&
          month[key] && month[key] !== 0
        ) {
          expenseCategories.add(key);
        }
      });
    });

    const categories: CategoryData[] = [];

    // Add COGS categories
    Array.from(cogsCategories).forEach(key => {
      categories.push({
        key: key,
        label: `COGS - ${this.formatLabel(key.replace('cogs', ''))}`,
        category: 'COGS',
        masterDataKey: key,
        masterDataPath: key,
      });
    });

    // Add expense categories
    Array.from(expenseCategories).forEach(key => {
      categories.push({
        key: key,
        label: this.formatLabel(key),
        category: 'Expense',
        masterDataKey: key,
        masterDataPath: key,
      });
    });

    return categories;
  }

  private formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  }

  private getLast6Months(monthlyData: MasterDataMonthly[]): { month: string; date: Date }[] {
    return monthlyData
      .slice(-6)
      .map(month => {
        const date = month.date || month.month;
        const dateObj = date instanceof Date ? date : new Date(date as string);
        return {
          month: dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          date: dateObj,
        };
      });
  }

  private calculateMonthlyPercentages(
    monthlyData: MasterDataMonthly[],
    category: CategoryData,
    last6Months: { month: string; date: Date }[]
  ): MonthlyPercentage[] {
    return last6Months.map(({ month, date }) => {
      // Find the corresponding month in master data
      const monthData = monthlyData.find(m => {
        const mDate = m.date || m.month;
        const mDateObj = mDate instanceof Date ? mDate : new Date(mDate as string);
        return mDateObj.getMonth() === date.getMonth() &&
               mDateObj.getFullYear() === date.getFullYear();
      });

      if (!monthData) {
        return { month, percentage: 0 };
      }

      const revenue = monthData.revenue || 0;
      let expenseValue = 0;

      if (category.masterDataPath && monthData) {
        // For flat structure, just access the property directly
        expenseValue = monthData[category.masterDataPath] || 0;
      }

      const percentage = revenue > 0 ? (expenseValue / revenue) * 100 : 0;

      // Ensure percentage is always a valid number
      const safePercentage = isNaN(percentage) || !isFinite(percentage) ? 0 : percentage;

      return { month, percentage: safePercentage };
    });
  }

  private getNestedValue(obj: any, path: string): number {
    return path.split('.').reduce((current, key) => current?.[key], obj) || 0;
  }

  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Master data cache cleared');
  }

  // Clear cache on category extraction changes
  clearAllCaches(): void {
    this.cache.clear();
    console.log('🧹 All master data caches cleared');
  }

  clearCompanyCache(companyId: string): void {
    const cacheKey = `master-data-${companyId}`;
    this.cache.delete(cacheKey);
    console.log(`🧹 Cache cleared for company: ${companyId}`);
  }
}

// Export singleton instance
export const masterDataStore = MasterDataStore.getInstance();

// React hook for using master data in components
export function useMasterData(companyId: string | null) {
  const [data, setData] = React.useState<{
    cogsCategories: GoalCategory[];
    expenseCategories: GoalCategory[];
    last6Months: { month: string; date: Date }[];
  } | null>(null);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!companyId) {
      setData(null);
      setError(null);
      return;
    }

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await masterDataStore.fetchMasterData(companyId);

        if (result.success && result.data) {
          const transformed = masterDataStore.transformForGoals(result.data);
          setData(transformed);
        } else {
          setError(result.error || 'Failed to load master data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [companyId]);

  return { data, loading, error, refetch: () => {
    if (companyId) {
      masterDataStore.clearCompanyCache(companyId);
      // Trigger re-fetch by updating a dependency
    }
  }};
}

// Import React for the hook
import React from 'react';
