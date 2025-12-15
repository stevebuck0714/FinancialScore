import { NextRequest, NextResponse } from 'next/server';
import { mappingLearner } from '@/lib/ai-learning/MappingLearner';

// Import existing keyword rules
const keywordRulesPath = '../route';

// Keyword-based mapping rules (same as current system)
const mappingRules = [
  // Income/Revenue Categories
  { keywords: ['sales', 'service revenue', 'product sales', 'consulting income', 'service income', 'gross revenue', 'operating revenue', 'income', 'revenue'], targetField: 'revenue', confidence: 'high' },
  { keywords: ['non-operating income', 'other income', 'interest income', 'dividend income'], targetField: 'nonOperatingIncome', confidence: 'high' },

  // Cost of Goods Sold
  { keywords: ['cogs payroll', 'cost of sales payroll', 'production payroll', 'direct labor', 'employees wages', 'employee wages', 'wages'], targetField: 'cogsPayroll', confidence: 'high' },
  { keywords: ['cogs owner', 'owner draw cogs'], targetField: 'cogsOwnerPay', confidence: 'medium' },
  { keywords: ['cogs contractor', 'subcontractor cogs', 'job cost contractor'], targetField: 'cogsContractors', confidence: 'high' },
  { keywords: ['materials', 'supplies', 'cogs materials', 'job materials', 'raw materials'], targetField: 'cogsMaterials', confidence: 'high' },
  { keywords: ['cogs commission', 'sales commission cogs', 'commission cost'], targetField: 'cogsCommissions', confidence: 'medium' },
  { keywords: ['cost of goods', 'cost of sales', 'direct cost'], targetField: 'cogsOther', confidence: 'medium' },
  { keywords: ['total cogs', 'total cost of goods sold', 'total cost of sales'], targetField: 'cogsTotal', confidence: 'high' },

  // Operating Expenses
  { keywords: ['payroll expense', 'wages', 'salary', 'salaries', 'employee compensation', 'payroll'], targetField: 'payroll', confidence: 'high' },
  { keywords: ['owner compensation', 'owner salary', 'owner wage', 'guaranteed payment', 'owner base'], targetField: 'ownerBasePay', confidence: 'high' },
  { keywords: ['benefits', 'health insurance employee', 'employee benefits'], targetField: 'benefits', confidence: 'high' },
  { keywords: ['insurance', 'liability insurance', 'general insurance', 'business insurance'], targetField: 'insurance', confidence: 'high' },
  { keywords: ['professional', 'legal', 'accounting', 'consulting', 'attorney', 'professional fees', 'professional services'], targetField: 'professionalFees', confidence: 'high' },
  { keywords: ['subcontractors', 'independent contractors', 'contract labor'], targetField: 'subcontractors', confidence: 'high' },
  { keywords: ['rent', 'lease', 'office rent', 'facility'], targetField: 'rent', confidence: 'high' },
  { keywords: ['tax expense', 'license fee', 'business license', 'license renewal', 'tax license', 'occupancy permit', 'property tax', 'real estate tax'], targetField: 'taxLicense', confidence: 'high' },
  { keywords: ['county tax', 'city tax', 'state tax', 'federal tax'], targetField: 'taxLicense', confidence: 'medium' },
  { keywords: ['phone', 'telephone', 'communication', 'internet', 'cell phone'], targetField: 'phoneComm', confidence: 'high' },
  { keywords: ['utilities', 'electric', 'water', 'gas bill'], targetField: 'infrastructure', confidence: 'high' },
  { keywords: ['auto', 'vehicle', 'travel', 'mileage', 'fuel', 'gas', 'transportation', 'parking', 'tolls', 'airfare', 'car rental', 'gasoline'], targetField: 'autoTravel', confidence: 'high' },
  { keywords: ['marketing', 'advertising', 'promotion', 'sales expense'], targetField: 'salesExpense', confidence: 'high' },
  { keywords: ['training', 'education', 'certification', 'professional development'], targetField: 'trainingCert', confidence: 'high' },
  { keywords: ['meals', 'entertainment', 'client meals', 'business meals'], targetField: 'mealsEntertainment', confidence: 'high' },
  { keywords: ['interest expense', 'loan interest', 'credit card interest'], targetField: 'interestExpense', confidence: 'high' },
  { keywords: ['depreciation', 'amortization'], targetField: 'depreciationAmortization', confidence: 'high' },
  { keywords: ['other expense', 'miscellaneous expense', 'other operating expense'], targetField: 'otherExpense', confidence: 'medium' },
  { keywords: ['total expense', 'total expenses'], targetField: 'expense', confidence: 'high' },
  { keywords: ['extraordinary', 'one-time', 'unusual'], targetField: 'extraordinaryItems', confidence: 'medium' },

  // Balance Sheet - Assets
  { keywords: ['checking', 'savings', 'cash', 'money market', 'bank account', 'petty cash'], targetField: 'cash', confidence: 'high' },
  { keywords: ['accounts receivable', 'receivable', 'a/r', 'ar'], targetField: 'ar', confidence: 'high' },
  { keywords: ['inventory', 'stock', 'merchandise'], targetField: 'inventory', confidence: 'high' },
  { keywords: ['prepaid', 'other current asset', 'current asset'], targetField: 'otherCA', confidence: 'medium' },
  { keywords: ['total current asset', 'tca'], targetField: 'tca', confidence: 'high' },
  { keywords: ['fixed asset', 'equipment asset', 'furniture', 'vehicle asset', 'building', 'land', 'property', 'ppe'], targetField: 'fixedAssets', confidence: 'high' },
  { keywords: ['other asset', 'long term asset', 'intangible', 'goodwill'], targetField: 'otherAssets', confidence: 'medium' },
  { keywords: ['total asset', 'total assets'], targetField: 'totalAssets', confidence: 'high' },

  // Balance Sheet - Liabilities
  { keywords: ['accounts payable', 'payable', 'a/p', 'ap'], targetField: 'ap', confidence: 'high' },
  { keywords: ['credit card', 'line of credit', 'other current liability', 'current liability', 'accrued'], targetField: 'otherCL', confidence: 'medium' },
  { keywords: ['total current liab', 'tcl'], targetField: 'tcl', confidence: 'high' },
  { keywords: ['long term debt', 'long-term debt', 'mortgage', 'loan', 'note payable', 'ltd'], targetField: 'ltd', confidence: 'high' },
  { keywords: ['total liab', 'total liabilities'], targetField: 'totalLiab', confidence: 'high' },

  // Balance Sheet - Equity
  { keywords: ["owner's capital", 'owners capital', 'owner capital', 'capital account', 'owner investment'], targetField: 'ownersCapital', confidence: 'high' },
  { keywords: ["owner's draw", 'owners draw', 'owner draw', 'draws', 'owner distribution'], targetField: 'ownersDraw', confidence: 'high' },
  { keywords: ['common stock', 'common shares', 'ordinary shares', 'common equity'], targetField: 'commonStock', confidence: 'high' },
  { keywords: ['preferred stock', 'preferred shares', 'pref stock', 'preferred equity'], targetField: 'preferredStock', confidence: 'high' },
  { keywords: ['retained earnings', 'retained profit', 'accumulated earnings', 'earnings retained'], targetField: 'retainedEarnings', confidence: 'high' },
  { keywords: ['additional paid-in capital', 'paid in capital', 'capital surplus', 'additional capital'], targetField: 'additionalPaidInCapital', confidence: 'high' },
  { keywords: ['treasury stock', 'treasury shares', 'treasury common stock'], targetField: 'treasuryStock', confidence: 'high' },
  { keywords: ['total equity', 'total shareholder equity', 'total owner equity', 'equity total'], targetField: 'totalEquity', confidence: 'high' },
  { keywords: ['total liab and equity', 'total liabilities and equity'], targetField: 'totalLAndE', confidence: 'high' },
];

// Account code ranges based on standard Chart of Accounts numbering
const accountCodeRanges = [
  // Assets (1000-1999)
  { start: 1000, end: 1099, targetField: 'cash', confidence: 'high', category: 'Cash' },
  { start: 1100, end: 1199, targetField: 'ar', confidence: 'high', category: 'Accounts Receivable' },
  { start: 1200, end: 1299, targetField: 'inventory', confidence: 'high', category: 'Inventory' },
  { start: 1300, end: 1499, targetField: 'otherCA', confidence: 'medium', category: 'Other Current Assets' },
  { start: 1500, end: 1799, targetField: 'fixedAssets', confidence: 'high', category: 'Fixed Assets' },
  { start: 1800, end: 1999, targetField: 'otherAssets', confidence: 'medium', category: 'Other Assets' },
  
  // Liabilities (2000-2999)
  { start: 2000, end: 2099, targetField: 'ap', confidence: 'high', category: 'Accounts Payable' },
  { start: 2100, end: 2499, targetField: 'otherCL', confidence: 'medium', category: 'Other Current Liabilities' },
  { start: 2500, end: 2999, targetField: 'ltd', confidence: 'high', category: 'Long Term Debt' },
  
  // Equity (3000-3999)
  { start: 3000, end: 3099, targetField: 'ownersCapital', confidence: 'high', category: 'Owner Capital' },
  { start: 3100, end: 3199, targetField: 'retainedEarnings', confidence: 'high', category: 'Retained Earnings' },
  { start: 3200, end: 3999, targetField: 'totalEquity', confidence: 'medium', category: 'Equity' },
  
  // Revenue/Income (4000-4999)
  { start: 4000, end: 4899, targetField: 'revenue', confidence: 'high', category: 'Revenue' },
  { start: 4900, end: 4999, targetField: 'nonOperatingIncome', confidence: 'medium', category: 'Other Income' },
  
  // Cost of Goods Sold (5000-5999)
  { start: 5000, end: 5099, targetField: 'cogsMaterials', confidence: 'high', category: 'COGS Materials' },
  { start: 5100, end: 5199, targetField: 'cogsPayroll', confidence: 'high', category: 'COGS Labor' },
  { start: 5200, end: 5299, targetField: 'cogsContractors', confidence: 'high', category: 'COGS Contractors' },
  { start: 5300, end: 5999, targetField: 'cogsOther', confidence: 'medium', category: 'COGS Other' },
  
  // Operating Expenses (6000-6999)
  { start: 6000, end: 6099, targetField: 'autoTravel', confidence: 'high', category: 'Auto & Travel' },
  { start: 6100, end: 6199, targetField: 'insurance', confidence: 'high', category: 'Insurance' },
  { start: 6200, end: 6299, targetField: 'professionalFees', confidence: 'high', category: 'Professional Fees' },
  { start: 6300, end: 6399, targetField: 'payroll', confidence: 'high', category: 'Payroll' },
  { start: 6400, end: 6499, targetField: 'rent', confidence: 'high', category: 'Rent' },
  { start: 6500, end: 6599, targetField: 'infrastructure', confidence: 'high', category: 'Utilities' },
  { start: 6600, end: 6699, targetField: 'salesExpense', confidence: 'high', category: 'Marketing' },
  { start: 6700, end: 6799, targetField: 'depreciationAmortization', confidence: 'high', category: 'Depreciation' },
  { start: 6800, end: 6899, targetField: 'interestExpense', confidence: 'high', category: 'Interest' },
  { start: 6900, end: 6999, targetField: 'otherExpense', confidence: 'medium', category: 'Other Expense' },
];

function extractNumericCode(accountCode: string): number | null {
  if (!accountCode) return null;
  
  // Handle formats like "1-1005", "1005", "1-1005 JBP", etc.
  // Extract the main account number (ignore prefix like "1-" or "2-")
  const match = accountCode.match(/(\d+)-?(\d+)/);
  if (match) {
    // If format is "1-1005", use the second part "1005"
    // If format is just "1005", use that
    const num = match[2] ? parseInt(match[2]) : parseInt(match[1]);
    return isNaN(num) ? null : num;
  }
  
  // Try simple numeric extraction
  const simpleMatch = accountCode.match(/(\d+)/);
  if (simpleMatch) {
    return parseInt(simpleMatch[1]);
  }
  
  return null;
}

function mapAccountByCode(accountCode: string): { targetField: string; confidence: string; reasoning: string } | null {
  const numericCode = extractNumericCode(accountCode);
  if (numericCode === null) return null;
  
  for (const range of accountCodeRanges) {
    if (numericCode >= range.start && numericCode <= range.end) {
      return {
        targetField: range.targetField,
        confidence: range.confidence,
        reasoning: `Account code ${accountCode} (${numericCode}) falls in ${range.category} range (${range.start}-${range.end})`
      };
    }
  }
  
  return null;
}

function mapAccountToFieldKeyword(accountName: string): { targetField: string; confidence: string; reasoning: string } | null {
  const lowerAccount = accountName.toLowerCase();
  
  for (const rule of mappingRules) {
    for (const keyword of rule.keywords) {
      if (lowerAccount.includes(keyword.toLowerCase())) {
        return {
          targetField: rule.targetField,
          confidence: rule.confidence,
          reasoning: `Matched keyword "${keyword}" in account name`
        };
      }
    }
  }
  
  return null;
}

function confidenceToNumeric(conf: string): number {
  switch (conf) {
    case 'high': return 90;
    case 'medium': return 70;
    case 'low': return 50;
    default: return 0;
  }
}

/**
 * Enhanced AI Mapping API
 * Combines keyword matching with machine learning from historical data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { qbAccountsWithClass, companyId } = body;

    if (!qbAccountsWithClass || !Array.isArray(qbAccountsWithClass)) {
      return NextResponse.json(
        { error: 'Missing required field: qbAccountsWithClass (array)' },
        { status: 400 }
      );
    }

    if (qbAccountsWithClass.length === 0) {
      return NextResponse.json({ mappings: [] });
    }

    console.log('[Enhanced AI Mapping] Processing', qbAccountsWithClass.length, 'accounts');

    const mappings: Array<{
      qbAccount: string;
      qbAccountClassification: string;
      targetField: string;
      confidence: string;
      reasoning: string;
      source: 'keyword' | 'learned' | 'similar' | 'accountCode';
    }> = [];

    // Process each account
    for (const account of qbAccountsWithClass) {
      const accountName = typeof account === 'string' ? account : account.name;
      const classification = typeof account === 'string' ? '' : (account.classification || '');
      const accountCode = typeof account === 'string' ? '' : (account.accountCode || '');
      const accountType = typeof account === 'string' ? '' : (account.accountType || '');

      let bestMapping = null;
      let bestConfidence = 0;
      let source: 'keyword' | 'learned' | 'similar' | 'accountCode' = 'keyword';

      // 1. Try account code-based mapping first (most reliable for standard COA)
      if (accountCode) {
        const codeMatch = mapAccountByCode(accountCode);
        if (codeMatch) {
          bestMapping = codeMatch;
          bestConfidence = confidenceToNumeric(codeMatch.confidence);
          source = 'accountCode';
        }
      }

      // 2. Try keyword matching if no code match or lower confidence
      const keywordMatch = mapAccountToFieldKeyword(accountName);
      if (keywordMatch && confidenceToNumeric(keywordMatch.confidence) > bestConfidence) {
        bestMapping = keywordMatch;
        bestConfidence = confidenceToNumeric(keywordMatch.confidence);
        source = 'keyword';
      }

      // 2. Try machine learning suggestion
      try {
        const mlSuggestion = await mappingLearner.getSuggestion(accountName, classification);
        if (mlSuggestion && mlSuggestion.confidence > bestConfidence) {
          bestMapping = {
            targetField: mlSuggestion.targetField,
            confidence: mlSuggestion.confidence >= 90 ? 'high' : mlSuggestion.confidence >= 70 ? 'medium' : 'low',
            reasoning: mlSuggestion.reasoning
          };
          bestConfidence = mlSuggestion.confidence;
          source = mlSuggestion.source;
        }
      } catch (mlError) {
        console.warn('[ML] Error getting suggestion:', mlError);
        // Continue with keyword match if ML fails
      }

      if (bestMapping) {
        mappings.push({
          qbAccount: accountName,
          qbAccountClassification: classification,
          targetField: bestMapping.targetField,
          confidence: bestMapping.confidence,
          reasoning: bestMapping.reasoning,
          source
        });
      } else {
        // No match found
        mappings.push({
          qbAccount: accountName,
          qbAccountClassification: classification,
          targetField: '',
          confidence: 'low',
          reasoning: 'No keyword or learned match found - please select manually',
          source: 'keyword'
        });
      }
    }

    const accountCodeCount = mappings.filter(m => m.source === 'accountCode').length;
    const keywordCount = mappings.filter(m => m.source === 'keyword').length;
    const learnedCount = mappings.filter(m => m.source === 'learned').length;
    const similarCount = mappings.filter(m => m.source === 'similar').length;

    console.log(`[Enhanced AI Mapping] Generated ${mappings.length} mappings: ${accountCodeCount} by account code, ${keywordCount} keyword, ${learnedCount} learned, ${similarCount} similar`);

    return NextResponse.json({ 
      mappings,
      stats: {
        total: mappings.length,
        accountCode: accountCodeCount,
        keyword: keywordCount,
        learned: learnedCount,
        similar: similarCount
      }
    });
  } catch (error: any) {
    console.error('[Enhanced AI Mapping] Error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      { 
        error: 'Failed to generate mappings', 
        details: error.message,
        errorType: error.name 
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve ML statistics
 */
export async function GET(request: NextRequest) {
  try {
    const stats = await mappingLearner.getStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('[Enhanced AI Mapping] Error getting stats:', error);
    return NextResponse.json(
      { error: 'Failed to get statistics', details: error.message },
      { status: 500 }
    );
  }
}

