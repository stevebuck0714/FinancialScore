// KPI Formula Definitions

export const KPI_FORMULAS: Record<string, { formula: string; period: string; description: string }> = {
  'Current Ratio': {
    formula: 'Current Assets ÷ Current Liabilities',
    period: 'Point in Time (End of Month)',
    description: 'Measures the company\'s ability to pay short-term obligations. Current Assets include Cash, AR, Inventory, and Other Current Assets. Current Liabilities include AP and Other Current Liabilities.'
  },
  'Quick Ratio': {
    formula: '(Current Assets - Inventory) ÷ Current Liabilities',
    period: 'Point in Time (End of Month)',
    description: 'Measures the company\'s ability to meet short-term obligations without relying on inventory sales. Also known as the Acid Test Ratio.'
  },
  'Inventory Turnover': {
    formula: 'Cost of Goods Sold (LTM) ÷ Average Inventory',
    period: 'Last Twelve Months (LTM)',
    description: 'Measures how many times inventory is sold and replaced over the period. Higher values indicate efficient inventory management.'
  },
  'Receivables Turnover': {
    formula: 'Revenue (LTM) ÷ Average Accounts Receivable',
    period: 'Last Twelve Months (LTM)',
    description: 'Measures how efficiently a company collects revenue from its credit customers. Higher values indicate faster collection.'
  },
  'Payables Turnover': {
    formula: 'Cost of Goods Sold (LTM) ÷ Average Accounts Payable',
    period: 'Last Twelve Months (LTM)',
    description: 'Measures how quickly a company pays off its suppliers. Lower values may indicate better use of supplier financing.'
  },
  'Days\' Inventory': {
    formula: '365 ÷ Inventory Turnover',
    period: 'Last Twelve Months (LTM)',
    description: 'Average number of days it takes to sell inventory. Lower values indicate faster inventory movement.'
  },
  'Days\' Receivables': {
    formula: '365 ÷ Receivables Turnover',
    period: 'Last Twelve Months (LTM)',
    description: 'Average number of days to collect payment after a sale. Also known as Days Sales Outstanding (DSO).'
  },
  'Days\' Payables': {
    formula: '365 ÷ Payables Turnover',
    period: 'Last Twelve Months (LTM)',
    description: 'Average number of days a company takes to pay its suppliers. Also known as Days Payable Outstanding (DPO).'
  },
  'Sales/Working Capital': {
    formula: 'Monthly Revenue ÷ Average Working Capital (Current + Prior Month)',
    period: 'Monthly',
    description: 'Measures how efficiently a company uses working capital to generate sales. Higher values indicate more efficient use of working capital.'
  },
  'Interest Coverage': {
    formula: 'EBIT (LTM) ÷ Interest Expense (LTM)',
    period: 'Last Twelve Months (LTM)',
    description: 'Measures the company\'s ability to pay interest on outstanding debt. Values above 2.5 are generally considered healthy.'
  },
  'Debt Service Coverage': {
    formula: 'Net Income (LTM) ÷ (Principal Payments + Interest Expense)',
    period: 'Last Twelve Months (LTM)',
    description: 'Measures ability to service total debt obligations. Values above 1.25 indicate sufficient cash flow to cover debt payments.'
  },
  'Cash Flow to Debt': {
    formula: 'Operating Cash Flow (LTM) ÷ Total Debt',
    period: 'Last Twelve Months (LTM)',
    description: 'Measures the company\'s ability to cover total debt with its operating cash flow. Higher values indicate better debt coverage.'
  },
  'Debt/Net Worth': {
    formula: 'Total Liabilities ÷ Total Equity',
    period: 'Point in Time (End of Month)',
    description: 'Measures financial leverage. Also known as Debt-to-Equity ratio. Lower values indicate less leverage and lower financial risk.'
  },
  'Fixed Assets/Net Worth': {
    formula: 'Fixed Assets ÷ Total Equity',
    period: 'Point in Time (End of Month)',
    description: 'Indicates the proportion of equity invested in fixed assets. Shows how much of the company\'s equity is tied up in long-term assets.'
  },
  'Leverage Ratio': {
    formula: 'Total Assets ÷ Total Equity',
    period: 'Point in Time (End of Month)',
    description: 'Measures the degree to which a company is utilizing borrowed money. Higher values indicate higher financial leverage.'
  },
  'Total Asset Turnover': {
    formula: 'Revenue (Current Month × 12) ÷ Average Total Assets (Current & Prior Month)',
    period: 'Current Month Annualized',
    description: 'Measures how efficiently a company uses its assets to generate sales. Higher values indicate better asset utilization.'
  },
  'Return on Equity (ROE)': {
    formula: 'Net Income (Current Month × 12) ÷ Average Total Equity (Current & Prior Month)',
    period: 'Current Month Annualized',
    description: 'Measures profitability relative to shareholders\' equity. Indicates how effectively management is using equity to generate profits.'
  },
  'Return on Assets (ROA)': {
    formula: 'Net Income (Current Month × 12) ÷ Average Total Assets (Current & Prior Month)',
    period: 'Current Month Annualized',
    description: 'Measures how profitable a company is relative to its total assets. Indicates how efficiently management uses assets to generate earnings.'
  },
  'EBITDA Margin': {
    formula: 'EBITDA (Current Month) ÷ Revenue (Current Month)',
    period: 'Current Month',
    description: 'Measures operating profitability before interest, taxes, depreciation, and amortization. EBITDA = Revenue - COGS - Operating Expenses + Interest Expense + Depreciation & Amortization.'
  },
  'EBIT Margin': {
    formula: 'EBIT (Current Month) ÷ Revenue (Current Month)',
    period: 'Current Month',
    description: 'Measures operating profitability before interest and taxes. EBIT = Revenue - COGS - Operating Expenses + Interest Expense.'
  }
};

