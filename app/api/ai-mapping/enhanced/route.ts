import { NextRequest, NextResponse } from 'next/server';
import { mappingLearner } from '@/lib/ai-learning/MappingLearner';

// Import existing keyword rules
const keywordRulesPath = '../route';

// Keyword-based mapping rules (same as current system)
const mappingRules = [
  // Non-operating income/expense (must be evaluated before generic revenue/expense keywords)
  { keywords: ['non-operating income', 'non operating income', 'other income', 'interest income', 'dividend income', 'gain on sale', 'gain on disposal', 'discount income', 'grant income', 'apprenticeship grant'], targetField: 'nonOperatingIncome', confidence: 'high' },
  { keywords: ['non-operating expense', 'non operating expense', 'other non-operating expense', 'covid expense', 'overhead allocation', 'overhead alocation'], targetField: 'nonOperatingExpense', confidence: 'high' },

  // Equity earnings (must run before generic "income" keyword rule)
  { keywords: ['net income', 'current year earnings', 'current earnings'], targetField: 'retainedEarnings', confidence: 'high' },

  // Income/Revenue Categories
  // Intentionally avoid generic "income"/"sales" tokens because they misclassify
  // accounts like "State Income Tax" and "Sales Commissions".
  { keywords: ['service revenue', 'product sales', 'sales revenue', 'consulting income', 'service income', 'gross revenue', 'operating revenue', 'revenue'], targetField: 'revenue', confidence: 'high' },

  // Cost of Goods Sold
  { keywords: ['cogs payroll', 'cost of sales payroll', 'production payroll', 'direct labor', 'employees wages', 'employee wages', 'wages'], targetField: 'cogsPayroll', confidence: 'high' },
  { keywords: ['cogs owner', 'owner draw cogs'], targetField: 'cogsOwnerPay', confidence: 'medium' },
  { keywords: ['cogs contractor', 'subcontractor cogs', 'job cost contractor'], targetField: 'cogsContractors', confidence: 'high' },
  { keywords: ["worker's compensation insurance", 'workers compensation insurance', "workers' compensation insurance", "worker's compensation", 'workers compensation', "workers' compensation", 'work comp'], targetField: 'cogsOther', confidence: 'high' },
  { keywords: ['materials', 'supplies', 'cogs materials', 'job materials', 'raw materials'], targetField: 'cogsMaterials', confidence: 'high' },
  { keywords: ['cogs commission', 'sales commission cogs', 'commission cost'], targetField: 'cogsCommissions', confidence: 'medium' },
  { keywords: ['cost of goods', 'cost of sales', 'direct cost'], targetField: 'cogsOther', confidence: 'medium' },
  { keywords: ['total cogs', 'total cost of goods sold', 'total cost of sales'], targetField: 'cogsTotal', confidence: 'high' },

  // Operating Expenses
  { keywords: ['payroll expense', 'wages', 'salary', 'salaries', 'employee compensation', 'payroll'], targetField: 'payroll', confidence: 'high' },
  { keywords: ['owner compensation', 'owner salary', 'owner wage', 'guaranteed payment', 'owner base'], targetField: 'ownerBasePay', confidence: 'high' },
  { keywords: ['benefits', 'health insurance employee', 'employee benefits'], targetField: 'benefits', confidence: 'high' },
  { keywords: ['insurance', 'liability insurance', 'general insurance', 'business insurance'], targetField: 'insurance', confidence: 'high' },
  { keywords: ['ask my accountant'], targetField: 'otherExpense', confidence: 'high' },
  { keywords: ['professional', 'legal', 'accounting', 'consulting', 'attorney', 'professional fees', 'professional services'], targetField: 'professionalFees', confidence: 'high' },
  { keywords: ['subcontractors', 'subcontractor', 'sub-contractor', 'independent contractors', 'contract labor'], targetField: 'subcontractors', confidence: 'high' },
  { keywords: ['rent', 'lease', 'office rent', 'facility'], targetField: 'rent', confidence: 'high' },
  // Income taxes (NOT Tax & License)
  { keywords: ['state income tax', 'state income taxes', 'ptet', 'pass-through entity tax', 'pass through entity tax'], targetField: 'stateIncomeTaxes', confidence: 'high' },
  { keywords: ['federal income tax', 'federal income taxes'], targetField: 'federalIncomeTaxes', confidence: 'high' },
  { keywords: ['income tax', 'income taxes'], targetField: 'federalIncomeTaxes', confidence: 'medium' },
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

  // Handle formats like "1-1005" by using the account family after the hyphen.
  const hyphenMatch = accountCode.match(/(\d+)\s*-\s*(\d+)/);
  if (hyphenMatch) {
    const num = parseInt(hyphenMatch[2], 10);
    return isNaN(num) ? null : num;
  }

  // For plain codes (e.g. "70200"), use the first numeric token as-is.
  const simpleMatch = accountCode.match(/(\d{3,})/);
  if (simpleMatch) {
    const num = parseInt(simpleMatch[1], 10);
    return isNaN(num) ? null : num;
  }
  
  return null;
}

function mapAccountByCode(accountCode: string): { targetField: string; confidence: string; reasoning: string } | null {
  const numericCode = extractNumericCode(accountCode);
  if (numericCode === null) return null;

  // Some COAs export 4-digit families as 5-digit values ending in zero
  // (e.g., 45000 instead of 4500, 50700 instead of 5070).
  const normalizedCandidates = new Set<number>([numericCode]);
  if (numericCode >= 10000 && numericCode % 10 === 0) {
    normalizedCandidates.add(Math.floor(numericCode / 10));
  }
  if (numericCode >= 10000) {
    const firstFourDigits = parseInt(String(numericCode).slice(0, 4), 10);
    if (!isNaN(firstFourDigits)) {
      normalizedCandidates.add(firstFourDigits);
    }
  }

  for (const candidateCode of normalizedCandidates) {
    for (const range of accountCodeRanges) {
      if (candidateCode >= range.start && candidateCode <= range.end) {
        const usedNormalization = candidateCode !== numericCode;
        return {
          targetField: range.targetField,
          confidence: range.confidence,
          reasoning: usedNormalization
            ? `Account code ${accountCode} normalized to ${candidateCode} for ${range.category} range (${range.start}-${range.end})`
            : `Account code ${accountCode} (${candidateCode}) falls in ${range.category} range (${range.start}-${range.end})`
        };
      }
    }
  }
  
  return null;
}

function forceNonOperatingOverride(
  accountName: string,
  classification: string,
  accountCodeOrName: string,
): { targetField: string; confidence: string; reasoning: string } | null {
  const name = (accountName || '').toLowerCase();
  const cls = (classification || '').toLowerCase();
  const rawCode = (accountCodeOrName || '').trim();
  const codeMatch = rawCode.match(/^(\d{4,})/);
  const code = codeMatch ? Number(codeMatch[1]) : NaN;

  // Cross-platform convention: 8010 is Non-Operating Income.
  if (code === 8010) {
    return {
      targetField: 'nonOperatingIncome',
      confidence: 'high',
      reasoning: 'Forced mapping: account code 8010 is reserved for Non-Operating Income',
    };
  }

  const hasIncomeSignal =
    name.includes('interest income') ||
    name.includes('discount income') ||
    name.includes('gain on sale') ||
    name.includes('gain on disposal') ||
    name.includes('grant') ||
    name.includes('non-operating income') ||
    name.includes('non operating income') ||
    name.includes('other income');

  const hasExpenseSignal =
    name.includes('non-operating expense') ||
    name.includes('non operating expense') ||
    name.includes('other non-operating expense');

  // User convention: 9000-series used for non-operating; split by signal.
  if (Number.isFinite(code) && code >= 9000 && code < 10000) {
    return {
      targetField: hasIncomeSignal ? 'nonOperatingIncome' : 'nonOperatingExpense',
      confidence: 'high',
      reasoning: hasIncomeSignal
        ? `Forced mapping: account code ${code} in 9000-series with income signal`
        : `Forced mapping: account code ${code} in 9000-series defaults to non-operating expense`,
    };
  }

  // Only force non-operating outside 9000-series when there is explicit keyword evidence.
  // Do NOT force based on classification alone, which can be overly broad/noisy.
  if (hasIncomeSignal || hasExpenseSignal) {
    return {
      targetField: hasIncomeSignal && !hasExpenseSignal ? 'nonOperatingIncome' : 'nonOperatingExpense',
      confidence: 'high',
      reasoning: 'Forced mapping from explicit non-operating keyword signal',
    };
  }

  return null;
}

function forceEquityOverride(
  accountName: string,
  classification: string,
  accountCodeOrName: string,
): { targetField: string; confidence: string; reasoning: string } | null {
  const name = (accountName || '').toLowerCase();
  const cls = (classification || '').toLowerCase();
  const code = extractNumericCode(accountCodeOrName || accountName || '');

  const isEquityCode = Number.isFinite(code) && (code as number) >= 3000 && (code as number) < 4000;
  const isEquitySignal =
    cls.includes('equity') ||
    name.includes('retained earnings') ||
    name.includes('opening balance equity') ||
    name.includes('owners equity') ||
    name.includes("owner's equity") ||
    name.includes('current year earnings') ||
    name.includes('net income');

  if (isEquityCode || isEquitySignal) {
    return {
      targetField: 'unmapped',
      confidence: 'high',
      reasoning: 'Forced mapping: equity account excluded from revenue/COGS account mapping',
    };
  }
  return null;
}

function forceCogsOverride(
  accountName: string,
  accountCodeOrName: string,
): { targetField: string; confidence: string; reasoning: string } | null {
  const name = (accountName || '').toLowerCase();
  const code = extractNumericCode(accountCodeOrName || accountName || '');
  const isCogsCode = Number.isFinite(code) && (code as number) >= 5000 && (code as number) < 6000;
  if (!isCogsCode) return null;

  if (
    name.includes('subcontractor') ||
    name.includes('sub-contractor') ||
    name.includes('contract labor') ||
    name.includes('independent contractor')
  ) {
    return {
      targetField: 'cogsContractors',
      confidence: 'high',
      reasoning: 'Forced mapping: 5000-series subcontractor account treated as COGS contractor cost',
    };
  }

  if (
    name.includes("worker's compensation") ||
    name.includes("workers' compensation") ||
    name.includes('workers compensation') ||
    name.includes('work comp')
  ) {
    return {
      targetField: 'cogsOther',
      confidence: 'high',
      reasoning: 'Forced mapping: 5000-series workers compensation account treated as COGS',
    };
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

function resolveClassificationFromAccountType(classification: string, accountType: string): string {
  const rawType = String(accountType || '').trim().toLowerCase();
  const rawClassification = String(classification || '').trim();
  if (!rawType) return rawClassification;

  if (rawType.includes('cost of sales') || rawType.includes('cost of goods sold') || rawType.includes('cogs')) {
    return 'Cost of Goods Sold';
  }
  if (rawType.includes('expense')) return 'Expense';
  if (rawType.includes('asset')) return 'Asset';
  if (rawType.includes('liabil')) return 'Liability';
  if (rawType.includes('equity')) return 'Equity';
  if (rawType.includes('income') || rawType.includes('revenue') || rawType.includes('sales')) return 'Income';
  return rawClassification;
}

function classifyTargetFieldFamily(targetField: string): 'revenue' | 'cogs' | 'expense' | 'asset' | 'liability' | 'equity' | 'other' {
  const normalized = String(targetField || '').trim().toLowerCase();
  if (!normalized || normalized === 'unmapped') return 'other';
  if (
    normalized === 'revenue' ||
    normalized === 'nonoperatingincome' ||
    normalized.startsWith('rev_')
  ) {
    return 'revenue';
  }
  if (normalized.startsWith('cogs') || normalized.startsWith('cogs_') || normalized === 'costofgoodssold') return 'cogs';
  if (
    [
      'payroll',
      'ownerbasepay',
      'benefits',
      'insurance',
      'professionalfees',
      'subcontractors',
      'rent',
      'taxlicense',
      'stateincometaxes',
      'federalincometaxes',
      'phonecomm',
      'infrastructure',
      'autotravel',
      'salesexpense',
      'marketing',
      'trainingcert',
      'mealsentertainment',
      'interestexpense',
      'depreciationamortization',
      'otherexpense',
      'expense',
      'extraordinaryitems',
      'nonoperatingexpense',
    ].includes(normalized)
  ) {
    return 'expense';
  }
  if (['cash', 'ar', 'inventory', 'otherca', 'tca', 'fixedassets', 'otherassets', 'totalassets'].includes(normalized)) return 'asset';
  if (['ap', 'othercl', 'tcl', 'ltd', 'totalliab', 'loc'].includes(normalized)) return 'liability';
  if (
    [
      'ownerscapital',
      'ownersdraw',
      'commonstock',
      'preferredstock',
      'retainedearnings',
      'additionalpaidincapital',
      'treasurystock',
      'totalequity',
      'totallande',
    ].includes(normalized)
  ) {
    return 'equity';
  }
  return 'other';
}

function shouldRejectTargetFieldForClassification(classification: string, targetField: string): boolean {
  const normalizedClassification = String(classification || '').trim().toLowerCase();
  const family = classifyTargetFieldFamily(targetField);
  if (family === 'other') return false;

  if (normalizedClassification.includes('cost of goods') || normalizedClassification === 'cogs') {
    return family !== 'cogs';
  }
  if (normalizedClassification.includes('expense')) {
    // Some ledgers classify COGS under Expense; allow explicit COGS targets.
    if (family === 'cogs') return false;
    return family !== 'expense';
  }
  if (normalizedClassification.includes('income') || normalizedClassification.includes('revenue') || normalizedClassification === 'r') {
    return family !== 'revenue';
  }
  if (normalizedClassification.includes('asset') || normalizedClassification === 'a') {
    return family !== 'asset';
  }
  if (normalizedClassification.includes('liabil') || normalizedClassification === 'l') {
    return family !== 'liability';
  }
  if (normalizedClassification.includes('equity') || normalizedClassification === 'q') {
    return family !== 'equity';
  }
  return false;
}

type TargetFieldCandidate = { value: string; label: string };

function normalizeTargetFieldCandidates(raw: any): TargetFieldCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') return { value: item, label: item };
      if (typeof item === 'object' && typeof item.value === 'string') {
        return { value: item.value, label: typeof item.label === 'string' ? item.label : item.value };
      }
      return null;
    })
    .filter((item): item is TargetFieldCandidate => item !== null);
}

function pickBestSectorTargetField(
  accountName: string,
  candidates: TargetFieldCandidate[],
  prefix: 'rev_' | 'cogs_',
): string | null {
  const options = candidates.filter((c) => c.value.startsWith(prefix));
  if (options.length === 0) return null;

  const name = accountName.toLowerCase();

  const scoreOption = (label: string) => {
    const normalized = label.toLowerCase();
    const tokens = normalized
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !['and', 'the', 'for', 'with', 'other', 'revenue', 'cogs', 'cost'].includes(t));

    // Expand label intent with practical synonyms so account names can match sector categories.
    const synonyms = new Set<string>(tokens);
    if (/\bsubscription\b/.test(normalized)) {
      ['subscription', 'recurring', 'mrr', 'annual', 'monthly', 'plan', 'seat', 'user'].forEach((s) => synonyms.add(s));
    }
    if (/\bsupport\b|\bmaintenance\b/.test(normalized)) {
      ['support', 'maintenance', 'managed', 'care', 'backup', 'hosted', 'security', 'monitoring', 'helpdesk', 'voice'].forEach((s) =>
        synonyms.add(s),
      );
    }
    if (/\bimplementation\b|\bsetup\b/.test(normalized)) {
      ['implementation', 'setup', 'onboarding', 'migration', 'deployment', 'install', 'project', 'tm', 't&m', 'time', 'materials'].forEach(
        (s) => synonyms.add(s),
      );
    }
    if (/\blicensing\b/.test(normalized)) {
      ['license', 'licensing', 'software', 'hardware', 'saas', 'seat', 'subscription'].forEach((s) => synonyms.add(s));
    }
    if (/\bdata\b|\banalytics\b/.test(normalized)) {
      ['data', 'analytics', 'reporting', 'insight', 'bi', 'labtech'].forEach((s) => synonyms.add(s));
    }
    if (/\badvertising\b/.test(normalized)) {
      ['ad', 'ads', 'advertising', 'sponsor', 'sponsorship'].forEach((s) => synonyms.add(s));
    }
    if (/\bother\b/.test(normalized)) {
      ['other', 'misc', 'miscellaneous', 'reimbursed', 'reimbursement', 'referral'].forEach((s) => synonyms.add(s));
    }

    let score = 0;
    for (const token of synonyms) {
      if (name.includes(token)) score += 3;
    }
    if (name.includes(normalized)) score += 10;
    if (normalized.includes('other') || normalized.includes('misc')) score += 0.5;
    return score;
  };

  let best = options[0];
  let bestScore = -1;
  for (const option of options) {
    const score = scoreOption(option.label || option.value);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }

  if (bestScore <= 0) {
    // If no direct signal, avoid overusing "Other" unless account name explicitly suggests it.
    const explicitOther = /\b(other|misc|miscellaneous|reimbursed|referral)\b/.test(name);
    if (explicitOther) {
      const other = options.find((o) => (o.label || o.value).toLowerCase().includes('other'));
      return (other || best).value;
    }
    const nonOther = options.find((o) => !(o.label || o.value).toLowerCase().includes('other'));
    return (nonOther || best).value;
  }
  return best.value;
}

function remapLegacyToSectorField(
  accountName: string,
  classification: string,
  targetField: string,
  candidates: TargetFieldCandidate[],
): string {
  // Only remap legacy generic revenue targets to sector-specific revenue fields.
  // Do not infer by classification alone (e.g., "Net Income"), which can override valid equity mappings.
  if (targetField === 'revenue' || targetField.startsWith('rev_')) {
    const picked = pickBestSectorTargetField(accountName, candidates, 'rev_');
    if (picked) return picked;
  }

  if (
    ['cogsPayroll', 'cogsOwnerPay', 'cogsContractors', 'cogsMaterials', 'cogsCommissions', 'cogsOther', 'cogsTotal'].includes(targetField) ||
    targetField.startsWith('cogs_')
  ) {
    const picked = pickBestSectorTargetField(accountName, candidates, 'cogs_');
    if (picked) return picked;
  }

  return targetField;
}

/**
 * Enhanced AI Mapping API
 * Combines keyword matching with machine learning from historical data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { qbAccountsWithClass, companyId, targetFields } = body;
    const targetFieldCandidates = normalizeTargetFieldCandidates(targetFields);

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
      accountName: string;
      accountClassification: string;
      targetField: string;
      confidence: string;
      reasoning: string;
      source: 'keyword' | 'learned' | 'similar' | 'accountCode' | 'none';
    }> = [];

    // Process each account
    for (const account of qbAccountsWithClass) {
      const accountName = typeof account === 'string' ? account : account.name;
      const sourceClassification = typeof account === 'string' ? '' : (account.classification || '');
      const accountCode = typeof account === 'string' ? '' : (account.accountCode || '');
      const accountType = typeof account === 'string' ? '' : (account.accountType || '');
      const classification = resolveClassificationFromAccountType(sourceClassification, accountType);
      const codeSource = (accountCode && String(accountCode).trim()) ? String(accountCode).trim() : accountName;

      let bestMapping = null;
      let bestConfidence = 0;
      let source: 'keyword' | 'learned' | 'similar' | 'accountCode' | 'none' = 'keyword';
      let hardLocked = false;

      // 0. Hard overrides to prevent bad learned/history matches.
      const forcedEquity = forceEquityOverride(accountName, classification, codeSource);
      if (forcedEquity) {
        bestMapping = forcedEquity;
        bestConfidence = 100;
        source = 'accountCode';
        hardLocked = true;
      } else {
        const forcedCogs = forceCogsOverride(accountName, codeSource);
        if (forcedCogs) {
          bestMapping = forcedCogs;
          bestConfidence = 100;
          source = 'accountCode';
          hardLocked = true;
        } else {
          const forcedOverride = forceNonOperatingOverride(accountName, classification, codeSource);
          if (forcedOverride) {
            bestMapping = forcedOverride;
            bestConfidence = 100;
            source = 'accountCode';
            hardLocked = true;
          }
        }
      }

      // 0.5 If code strongly indicates COGS, do not let keyword/ML move it to OPEX.
      if (!hardLocked && codeSource) {
        const codeMatch = mapAccountByCode(codeSource);
        if (codeMatch) {
          bestMapping = codeMatch;
          bestConfidence = confidenceToNumeric(codeMatch.confidence);
          source = 'accountCode';
          if (
            codeMatch.targetField === 'cogsTotal' ||
            codeMatch.targetField.startsWith('cogs')
          ) {
            hardLocked = true;
          }
        }
      }

      // 1. Try account code-based mapping first (most reliable for standard COA)
      if (!hardLocked && codeSource) {
        const codeMatch = mapAccountByCode(codeSource);
        if (codeMatch) {
          bestMapping = codeMatch;
          bestConfidence = confidenceToNumeric(codeMatch.confidence);
          source = 'accountCode';
        }
      }

      // 2. Try keyword matching if no code match or lower confidence
      const keywordMatch = hardLocked ? null : mapAccountToFieldKeyword(accountName);
      if (keywordMatch && confidenceToNumeric(keywordMatch.confidence) > bestConfidence) {
        bestMapping = keywordMatch;
        bestConfidence = confidenceToNumeric(keywordMatch.confidence);
        source = 'keyword';
      }

      // 3. Try machine learning suggestion (only if available and valid)
      try {
        if (!hardLocked) {
          const mlSuggestion = await mappingLearner.getSuggestion(accountName, classification);
          // Only use ML if it has a valid targetField (not empty, not unmapped)
          if (mlSuggestion &&
              mlSuggestion.targetField &&
              mlSuggestion.targetField !== 'unmapped' &&
              mlSuggestion.targetField !== '' &&
              mlSuggestion.confidence > bestConfidence) {
            bestMapping = {
              targetField: mlSuggestion.targetField,
              confidence: mlSuggestion.confidence >= 90 ? 'high' : mlSuggestion.confidence >= 70 ? 'medium' : 'low',
              reasoning: mlSuggestion.reasoning
            };
            bestConfidence = mlSuggestion.confidence;
            source = mlSuggestion.source;
          }
        }
      } catch (mlError) {
        // ML system not available - continue with keyword match
        // This is expected if LearnedMapping table doesn't exist yet
      }

      if (bestMapping && bestMapping.targetField) {
        const remappedTargetField = remapLegacyToSectorField(
          accountName,
          classification,
          bestMapping.targetField,
          targetFieldCandidates,
        );
        const rejectForClassification = shouldRejectTargetFieldForClassification(classification, remappedTargetField);
        if (rejectForClassification) {
          mappings.push({
            accountName: accountName,
            accountClassification: classification,
            targetField: 'unmapped',
            confidence: 'low',
            reasoning: `Rejected incompatible mapping "${remappedTargetField}" for account classification "${classification || accountType || 'unknown'}"`,
            source: 'none',
          });
          continue;
        }
        mappings.push({
          accountName: accountName,
          accountClassification: classification,
          targetField: remappedTargetField,
          confidence: bestMapping.confidence,
          reasoning: bestMapping.reasoning,
          source
        });
      } else {
        // No match found - mark as unmapped
        mappings.push({
          accountName: accountName,
          accountClassification: classification,
          targetField: 'unmapped',
          confidence: 'low',
          reasoning: 'No keyword or learned match found - please select manually',
          source: 'none'
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

