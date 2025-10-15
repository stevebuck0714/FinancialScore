import { NextRequest, NextResponse } from 'next/server';

// Keyword-based mapping rules
// Target fields MUST match the database schema MonthlyFinancial fields exactly
const mappingRules = [
  // Income/Revenue Categories
  { keywords: ['sales', 'service revenue', 'product sales', 'consulting income', 'service income', 'gross revenue', 'operating revenue', 'income', 'revenue'], targetField: 'revenue', confidence: 'high' },
  { keywords: ['non-operating income', 'other income', 'interest income', 'dividend income'], targetField: 'nonOperatingIncome', confidence: 'high' },

  // Cost of Goods Sold
  { keywords: ['cogs payroll', 'cost of sales payroll', 'production payroll', 'direct labor'], targetField: 'cogsPayroll', confidence: 'high' },
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
  { keywords: ['tax', 'license', 'permit', 'business license'], targetField: 'taxLicense', confidence: 'high' },
  { keywords: ['phone', 'telephone', 'communication', 'internet', 'cell phone'], targetField: 'phoneComm', confidence: 'high' },
  { keywords: ['utilities', 'electric', 'water', 'gas bill'], targetField: 'infrastructure', confidence: 'high' },
  { keywords: ['auto', 'vehicle', 'travel', 'mileage', 'fuel', 'gas', 'transportation'], targetField: 'autoTravel', confidence: 'high' },
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

  // Balance Sheet - Equity (Sub-accounts)
  { keywords: ["owner's capital", 'owners capital', 'owner capital', 'capital account', 'owner investment'], targetField: 'ownersCapital', confidence: 'high' },
  { keywords: ["owner's draw", 'owners draw', 'owner draw', 'draws', 'owner distribution'], targetField: 'ownersDraw', confidence: 'high' },
  { keywords: ['common stock', 'common shares', 'ordinary shares', 'common equity'], targetField: 'commonStock', confidence: 'high' },
  { keywords: ['preferred stock', 'preferred shares', 'pref stock', 'preferred equity'], targetField: 'preferredStock', confidence: 'high' },
  { keywords: ['retained earnings', 'retained profit', 'accumulated earnings', 'earnings retained'], targetField: 'retainedEarnings', confidence: 'high' },
  { keywords: ['additional paid-in capital', 'paid in capital', 'capital surplus', 'additional capital'], targetField: 'additionalPaidInCapital', confidence: 'high' },
  { keywords: ['treasury stock', 'treasury shares', 'treasury common stock'], targetField: 'treasuryStock', confidence: 'high' },

  // Balance Sheet - Equity (Total)
  { keywords: ['total equity', 'total shareholder equity', 'total owner equity', 'equity total'], targetField: 'totalEquity', confidence: 'high' },
  { keywords: ['total liab and equity', 'total liabilities and equity'], targetField: 'totalLAndE', confidence: 'high' },
];

function mapAccountToField(accountName: string): { targetField: string; confidence: string; reasoning: string } | null {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { qbAccounts, qbAccountsWithClass, targetFields } = body;

    // Support both old format (qbAccounts array of strings) and new format (qbAccountsWithClass array of objects)
    const accountsToMap = qbAccountsWithClass || (qbAccounts ? qbAccounts.map((name: string) => ({ name, classification: '' })) : []);

    console.log('Keyword Mapping Request received:', { 
      accountCount: accountsToMap?.length
    });

    if (!accountsToMap || !Array.isArray(accountsToMap)) {
      console.error('Invalid request: accounts data is missing or not an array');
      return NextResponse.json(
        { error: 'Missing required field: qbAccountsWithClass or qbAccounts (array)' },
        { status: 400 }
      );
    }

    if (accountsToMap.length === 0) {
      console.log('No accounts to map');
      return NextResponse.json({ mappings: [] });
    }

    // Map each account using keyword rules
    const mappings: Array<{
      qbAccount: string;
      qbAccountClassification: string;
      targetField: string;
      confidence: string;
      reasoning: string;
    }> = [];

    for (const account of accountsToMap) {
      const accountName = typeof account === 'string' ? account : account.name;
      const classification = typeof account === 'string' ? '' : (account.classification || '');
      const mapping = mapAccountToField(accountName);
      
      if (mapping) {
        mappings.push({
          qbAccount: accountName,
          qbAccountClassification: classification,
          targetField: mapping.targetField,
          confidence: mapping.confidence,
          reasoning: mapping.reasoning
        });
      } else {
        // If no keyword match, leave blank with low confidence for manual selection
        mappings.push({
          qbAccount: accountName,
          qbAccountClassification: classification,
          targetField: '',
          confidence: 'low',
          reasoning: 'No keyword match found - please select manually'
        });
      }
    }

    console.log(`Successfully generated ${mappings.length} keyword-based mappings`);
    return NextResponse.json({ mappings });
  } catch (error: any) {
    console.error('Keyword mapping error:', {
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
