/**
 * Application constants
 */

// US States for dropdown selections
export const US_STATES = [
  { code: '', name: 'Select State' },
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' }
];

// Map KPI ratio names to benchmark metric names
export const KPI_TO_BENCHMARK_MAP: Record<string, string[]> = {
  // Liquidity
  'Current Ratio': ['Current Ratio'],
  'Quick Ratio': ['Quick Ratio', 'Acid Test Ratio'],
  // Activity
  'Inventory Turnover': ['Inventory Turnover'],
  'Receivables Turnover': ['Sales/Receivables', 'Receivables Turnover', 'Receivable Turnover', 'Accounts Receivable Turnover'],
  'Payables Turnover': ['Payables Turnover', 'Payable Turnover', 'Accounts Payable Turnover'],
  'Days Inventory': ['Days Inventory', 'Days\' Inventory', 'Days Inventory on Hand'],
  'Days Receivables': ['Days Receivables', 'Days\' Receivables', 'Days Receivable', 'Days Sales Outstanding'],
  'Days Payables': ['Days Payables', 'Days\' Payables', 'Days Payable', 'Days Payables Outstanding'],
  'Sales/Working Capital': ['Sales to Working Capital', 'Sales/Working Capital'],
  // Coverage
  'Interest Coverage': ['Times Interest Earned', 'Interest Coverage', 'Interest Coverage Ratio'],
  'Debt Service Coverage': ['Debt Service Coverage Ratio', 'Debt Service Coverage'],
  'Cash Flow to Debt': ['Cash Flow to Total Debt', 'Cash Flow/Total Debt'],
  // Leverage
  'Debt/Net Worth': ['Debt to Net Worth', 'Debt/Net Worth'],
  'Fixed Assets/Net Worth': ['Fixed Assets to Net Worth', 'Fixed Assets/Net Worth'],
  'Leverage Ratio': ['Total Debt to Assets', 'Debt to Assets', 'Leverage Ratio'],
  // Operating
  'Total Asset Turnover': ['Sales/Total Assets', 'Total Asset Turnover', 'Asset Turnover'],
  'ROE': ['Return on Equity', 'Return on Net Worth, %', 'Return on Equity (%)', 'ROE'],
  'ROA': ['Return on Assets', 'Return on Assets, %', 'Return on Assets (%)', 'ROA'],
  'EBITDA/Revenue': ['EBITDA Margin', 'EBITDA Margin (%)', 'EBITDA/Revenue'],
  'EBIT/Revenue': ['EBIT Margin', 'EBIT Margin (%)', 'EBIT/Revenue']
};

