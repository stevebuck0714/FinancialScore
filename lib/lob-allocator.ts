/**
 * LOB (Line of Business) Allocation Processor
 * 
 * This module handles the allocation of QuickBooks account values across
 * multiple Lines of Business based on percentage splits defined in account mappings.
 */

export interface AccountValue {
  accountName: string;
  accountId: string;
  value: number;
}

export interface AccountMapping {
  qbAccount: string;
  qbAccountId?: string | null;
  targetField: string;
  lobAllocations?: any; // { "LOB Name": percentage, ... }
}

export interface LOBBreakdown {
  [lobName: string]: number;
}

export interface FieldBreakdowns {
  [fieldName: string]: LOBBreakdown;
}

export interface MonthlyLOBData {
  // Totals by field
  totals: {
    [fieldName: string]: number;
  };
  // LOB breakdown for each field
  breakdowns: FieldBreakdowns;
  // Specific breakdowns for quick access
  revenueBreakdown?: LOBBreakdown;
  expenseBreakdown?: LOBBreakdown;
  cogsBreakdown?: LOBBreakdown;
}

/**
 * Process account values and apply LOB allocations
 * 
 * @param accountValues - Array of account values for a specific month
 * @param accountMappings - Array of account mappings with LOB allocations
 * @returns Processed data with totals and LOB breakdowns
 */
export function applyLOBAllocations(
  accountValues: AccountValue[],
  accountMappings: AccountMapping[]
): MonthlyLOBData {
  // Initialize result structure
  const totals: { [fieldName: string]: number } = {};
  const breakdowns: FieldBreakdowns = {};

  // Create a map for quick lookup of mappings by account name
  const mappingMap = new Map<string, AccountMapping>();
  for (const mapping of accountMappings) {
    mappingMap.set(mapping.qbAccount, mapping);
  }

  // Process each account value
  for (const accountValue of accountValues) {
    const mapping = mappingMap.get(accountValue.accountName);
    
    if (!mapping) {
      // No mapping found - skip this account
      console.warn(`No mapping found for QB account: "${accountValue.accountName}"`);
      continue;
    }

    const targetField = mapping.targetField;
    const amount = accountValue.value;

    // Skip if no target field or amount is zero
    if (!targetField || amount === 0) {
      continue;
    }

    // Initialize totals and breakdowns for this field if not exists
    if (!totals[targetField]) {
      totals[targetField] = 0;
    }
    if (!breakdowns[targetField]) {
      breakdowns[targetField] = {};
    }

    // Add to total
    totals[targetField] += amount;

    // Apply LOB allocations if they exist
    if (mapping.lobAllocations && typeof mapping.lobAllocations === 'object') {
      const lobAllocations = mapping.lobAllocations as { [lob: string]: number };
      
      // Validate that percentages add up to 100 (with small tolerance for rounding)
      const totalPercentage = Object.values(lobAllocations).reduce((sum, pct) => sum + pct, 0);
      if (Math.abs(totalPercentage - 100) > 0.01 && totalPercentage > 0) {
        console.warn(
          `LOB allocations for "${accountValue.accountName}" sum to ${totalPercentage}% instead of 100%`
        );
      }

      // Apply percentage splits
      for (const [lobName, percentage] of Object.entries(lobAllocations)) {
        if (percentage > 0) {
          const lobAmount = (amount * percentage) / 100;
          
          if (!breakdowns[targetField][lobName]) {
            breakdowns[targetField][lobName] = 0;
          }
          breakdowns[targetField][lobName] += lobAmount;
        }
      }
    } else {
      // No LOB allocation - this amount goes to "unallocated" or could be distributed equally
      // For now, we'll just track it in totals but not in any specific LOB
      // Alternatively, you could add it to a default "General" LOB
      
      // Option: Add to "Unallocated" LOB
      const unallocatedLOB = 'Unallocated';
      if (!breakdowns[targetField][unallocatedLOB]) {
        breakdowns[targetField][unallocatedLOB] = 0;
      }
      breakdowns[targetField][unallocatedLOB] += amount;
    }
  }

  // Extract specific breakdowns for convenience
  const result: MonthlyLOBData = {
    totals,
    breakdowns,
  };

  if (breakdowns.revenue) {
    result.revenueBreakdown = breakdowns.revenue;
  }

  // Calculate total expense breakdown by summing all expense field LOB breakdowns
  if (Object.keys(breakdowns).some(field => isExpenseField(field))) {
    result.expenseBreakdown = {};
    for (const [field, lobBreakdown] of Object.entries(breakdowns)) {
      if (isExpenseField(field)) {
        for (const [lobName, amount] of Object.entries(lobBreakdown)) {
          if (!result.expenseBreakdown[lobName]) {
            result.expenseBreakdown[lobName] = 0;
          }
          result.expenseBreakdown[lobName] += amount;
        }
      }
    }
  }

  // Calculate total COGS breakdown
  if (Object.keys(breakdowns).some(field => isCOGSField(field))) {
    result.cogsBreakdown = {};
    for (const [field, lobBreakdown] of Object.entries(breakdowns)) {
      if (isCOGSField(field)) {
        for (const [lobName, amount] of Object.entries(lobBreakdown)) {
          if (!result.cogsBreakdown[lobName]) {
            result.cogsBreakdown[lobName] = 0;
          }
          result.cogsBreakdown[lobName] += amount;
        }
      }
    }
  }

  return result;
}

/**
 * Check if a field name represents an expense field
 */
function isExpenseField(fieldName: string): boolean {
  const expenseFields = [
    'payroll', 'ownerBasePay', 'benefits', 'insurance', 'professionalFees',
    'subcontractors', 'rent', 'taxLicense', 'phoneComm', 'infrastructure',
    'autoTravel', 'salesExpense', 'marketing', 'trainingCert', 'mealsEntertainment',
    'interestExpense', 'depreciationAmortization', 'otherExpense'
  ];
  return expenseFields.includes(fieldName);
}

/**
 * Check if a field name represents a COGS field
 */
function isCOGSField(fieldName: string): boolean {
  const cogsFields = [
    'cogsPayroll', 'cogsOwnerPay', 'cogsContractors', 'cogsMaterials',
    'cogsCommissions', 'cogsOther'
  ];
  return cogsFields.includes(fieldName);
}

/**
 * Round all LOB breakdown amounts to 2 decimal places
 */
export function roundBreakdown(breakdown: LOBBreakdown): LOBBreakdown {
  const rounded: LOBBreakdown = {};
  for (const [lobName, amount] of Object.entries(breakdown)) {
    rounded[lobName] = Math.round(amount * 100) / 100;
  }
  return rounded;
}

/**
 * Round all field breakdowns
 */
export function roundAllBreakdowns(breakdowns: FieldBreakdowns): FieldBreakdowns {
  const rounded: FieldBreakdowns = {};
  for (const [fieldName, lobBreakdown] of Object.entries(breakdowns)) {
    rounded[fieldName] = roundBreakdown(lobBreakdown);
  }
  return rounded;
}


