import { z } from 'zod';

// Type definitions for master data
export interface MasterDataMonthly {
  date?: Date | string;
  month?: Date | string;
  revenue: number;
  // Flat structure with COGS and expense fields
  [key: string]: unknown;
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

type MasterDataFetchResult = {
  success: boolean;
  data?: MasterDataResponse;
  error?: string;
};

type MasterDataCacheEntry = {
  expiresAt: number;
  result: MasterDataFetchResult;
};

export class MasterDataStore {
  private static instance: MasterDataStore;
  private readonly cache = new Map<string, MasterDataCacheEntry>();
  private readonly inFlight = new Map<string, Promise<MasterDataFetchResult>>();
  private readonly ttlByScope: Record<'published' | 'all', number> = {
    published: 120_000,
    all: 30_000,
  };

  private constructor() {}

  static getInstance(): MasterDataStore {
    if (!MasterDataStore.instance) {
      MasterDataStore.instance = new MasterDataStore();
    }
    return MasterDataStore.instance;
  }

  async fetchMasterData(
    companyId: string,
    scope: 'published' | 'all' = 'published',
  ): Promise<MasterDataFetchResult> {
    const cacheKey = `${companyId}:${scope}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`🎯 Master data cache hit for company: ${companyId} (scope=${scope})`);
      return cached.result;
    }

    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const requestPromise = this.fetchMasterDataFresh(companyId, scope, cacheKey);
    this.inFlight.set(cacheKey, requestPromise);
    requestPromise.finally(() => this.inFlight.delete(cacheKey));
    return requestPromise;
  }

  private async fetchMasterDataFresh(
    companyId: string,
    scope: 'published' | 'all',
    cacheKey: string,
  ): Promise<MasterDataFetchResult> {
    try {
      console.log(`🎯 Fetching master data for company: ${companyId} (scope=${scope})`);
      const controller = new AbortController();
      const timeoutMs = 20000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(
        `/api/master-data?companyId=${companyId}&scope=${scope}`,
        {
          cache: 'no-store',
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timeoutId));

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

      console.log(`✅ Master data loaded: ${validatedData.months} months`);
      const result = { success: true, data: validatedData };
      this.cache.set(cacheKey, {
        expiresAt: Date.now() + this.ttlByScope[scope],
        result,
      });
      return result;

    } catch (error) {
      console.error('❌ Master data fetch error:', error);

      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Data validation error: ${error.message}`
        };
      }

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Master data request timed out after 20s. Please retry.'
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
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  }

  private getLast6Months(monthlyData: MasterDataMonthly[]): { month: string; date: Date }[] {
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();

    return monthlyData
      .filter((month) => {
        const date = month.date || month.month;
        const dateObj = date instanceof Date ? date : new Date(date as string);
        if (Number.isNaN(dateObj.getTime())) return false;
        const year = dateObj.getUTCFullYear();
        const monthIndex = dateObj.getUTCMonth();
        return year < currentYear || (year === currentYear && monthIndex < currentMonth);
      })
      .slice(-6)
      .map(month => {
        const date = month.date || month.month;
        const dateObj = date instanceof Date ? date : new Date(date as string);
        // UTC label and accessors — see lib/date-utils.ts.
        return {
          month: dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
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
      // UTC accessors so monthly buckets match across browser TZ and server TZ.
      const monthData = monthlyData.find(m => {
        const mDate = m.date || m.month;
        const mDateObj = mDate instanceof Date ? mDate : new Date(mDate as string);
        return mDateObj.getUTCMonth() === date.getUTCMonth() &&
               mDateObj.getUTCFullYear() === date.getUTCFullYear();
      });

      if (!monthData) {
        return { month, percentage: 0 };
      }

      const revenue = monthData.revenue || 0;
      let expenseValue = 0;

      if (category.masterDataPath && monthData) {
        // For flat structure, just access the property directly
        const rawExpenseValue = monthData[category.masterDataPath];
        const parsedExpenseValue = Number(rawExpenseValue);
        expenseValue = Number.isFinite(parsedExpenseValue) ? parsedExpenseValue : 0;
      }

      const percentage = revenue > 0 ? (expenseValue / revenue) * 100 : 0;

      // Ensure percentage is always a valid number
      const safePercentage = isNaN(percentage) || !isFinite(percentage) ? 0 : percentage;

      return { month, percentage: safePercentage };
    });
  }

  private getNestedValue(obj: unknown, path: string): number {
    const value = path.split('.').reduce<unknown>((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, obj);
    return Number(value || 0);
  }

  clearCache(): void {
    this.cache.clear();
    this.inFlight.clear();
    console.log('🔄 Master data cache cleared');
  }

  // Clear cache on category extraction changes
  clearAllCaches(): void {
    this.clearCache();
  }

  clearCompanyCache(companyId: string): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(`${companyId}:`)) this.cache.delete(key);
    }
    for (const key of Array.from(this.inFlight.keys())) {
      if (key.startsWith(`${companyId}:`)) this.inFlight.delete(key);
    }
    console.log(`🔄 Master data cache cleared for company: ${companyId}`);
  }
}

// Export singleton instance
export const masterDataStore = MasterDataStore.getInstance();

// React hook for using master data in components.
//
// scope:
//   'published' (default) - month-end financial reports. Only completed,
//                           published months are returned. Use for every
//                           Reports / Valuation / MDA / KPI surface.
//   'all'                 - includes the in-progress current month. Use only
//                           for Operations and Data Review.
export function useMasterData(
  companyId: string | null,
  scope: 'published' | 'all' = 'published',
) {
  const [data, setData] = React.useState<{
    cogsCategories: GoalCategory[];
    expenseCategories: GoalCategory[];
    last6Months: { month: string; date: Date }[];
  } | null>(null);

  const [monthlyData, setMonthlyData] = React.useState<MasterDataMonthly[] | null>(null);
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
        const result = await masterDataStore.fetchMasterData(companyId, scope);

        if (result.success && result.data) {
          const transformed = masterDataStore.transformForGoals(result.data);
          setData(transformed);
          setMonthlyData(result.data.monthlyData);
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
  }, [companyId, scope]);

  return {
    data,
    monthlyData,
    loading,
    error,
    refetch: () => {
      if (companyId) {
        // Force re-fetch by clearing cache (though caching is disabled now)
        masterDataStore.clearCompanyCache(companyId);
        // Re-trigger the useEffect by updating companyId dependency
        // This will cause a fresh fetch
        setLoading(true);
        setError(null);
        masterDataStore.fetchMasterData(companyId, scope).then(result => {
          if (result.success && result.data) {
            const transformed = masterDataStore.transformForGoals(result.data);
            setData(transformed);
            setMonthlyData(result.data.monthlyData);
          } else {
            setError(result.error || 'Failed to load master data');
          }
          setLoading(false);
        }).catch(err => {
          setError(err instanceof Error ? err.message : 'Unknown error');
          setLoading(false);
        });
      }
    }
  };
}

// Explicit, typed wrappers so callers cannot ambiguously pick a scope.
// Every month-end financial report uses usePublishedMasterData.
// Only Operations and Data Review use useAllMasterData.
export function usePublishedMasterData(companyId: string | null) {
  return useMasterData(companyId, 'published');
}

export function useAllMasterData(companyId: string | null) {
  return useMasterData(companyId, 'all');
}

// Import React for the hook
import React from 'react';
