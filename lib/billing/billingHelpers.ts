/**
 * General billing helper functions
 */

/**
 * Formats currency amount
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Formats date for display
 */
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(d);
}

/**
 * Formats date range
 */
export function formatDateRange(startDate: Date | string, endDate: Date | string): string {
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

/**
 * Gets status color for UI
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'paid': '#10b981',      // green
    'pending': '#f59e0b',   // amber
    'overdue': '#ef4444',   // red
    'failed': '#ef4444',    // red
    'cancelled': '#6b7280', // gray
    'active': '#10b981',    // green
    'paused': '#f59e0b',    // amber
    'inactive': '#6b7280'   // gray
  };
  return colors[status.toLowerCase()] || '#6b7280';
}

/**
 * Gets status display text
 */
export function getStatusText(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * Calculates percentage change
 */
export function calculatePercentageChange(current: number, previous: number): {
  value: number;
  isPositive: boolean;
  formatted: string;
} {
  if (previous === 0) {
    const value = current > 0 ? 100 : 0;
    return {
      value,
      isPositive: value >= 0,
      formatted: `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    };
  }
  
  const value = ((current - previous) / previous) * 100;
  return {
    value,
    isPositive: value >= 0,
    formatted: `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  };
}

/**
 * Gets the first and last day of current month
 */
export function getCurrentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

/**
 * Gets the first and last day of previous month
 */
export function getPreviousMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start, end };
}

/**
 * Gets date range for a specific period type
 */
export function getDateRangeForPeriod(
  periodType: 'month' | 'quarter' | 'year',
  offset: number = 0
): { start: Date; end: Date } {
  const now = new Date();
  
  if (periodType === 'month') {
    const month = now.getMonth() + offset;
    const start = new Date(now.getFullYear(), month, 1);
    const end = new Date(now.getFullYear(), month + 1, 0);
    return { start, end };
  } else if (periodType === 'quarter') {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const targetQuarter = currentQuarter + offset;
    const startMonth = targetQuarter * 3;
    const start = new Date(now.getFullYear(), startMonth, 1);
    const end = new Date(now.getFullYear(), startMonth + 3, 0);
    return { start, end };
  } else { // year
    const year = now.getFullYear() + offset;
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return { start, end };
  }
}

/**
 * Exports data to CSV format
 */
export function exportToCSV(data: any[], filename: string): void {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes in values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Validates email address
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

