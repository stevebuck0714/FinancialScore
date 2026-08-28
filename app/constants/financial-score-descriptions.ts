export type FinancialScoreTerm = {
  acronym?: string;
  fullName: string;
  definition: string;
};

export const FINANCIAL_SCORE_TERMS: Record<string, FinancialScoreTerm> = {
  'Corelytics Financial Score': {
    fullName: 'Corelytics Financial Score',
    definition:
      'The overall company score on a 10 to 100 scale. It is the average of Profitability Score and Asset Development Score (ADS). Higher scores indicate stronger growth, cost control, and balance-sheet strength.',
  },
  'Financial Score Trend': {
    fullName: 'Financial Score Trend',
    definition:
      'The overall Corelytics Financial Score plotted month by month. Each point is the average of that month’s Profitability Score and Asset Development Score (ADS).',
  },
  'Profitability Score': {
    fullName: 'Profitability Score',
    definition:
      'Measures whether the company is growing profitably. It starts with Adjusted RGS (Revenue Growth Score with the 6-month adjustment) and then adds the Expense Adjustment. The result is capped between 10 and 100.',
  },
  'Profitability Score Trend': {
    fullName: 'Profitability Score Trend',
    definition:
      'The Profitability Score plotted month by month. Use it to see whether revenue growth and expense control are improving or deteriorating over time.',
  },
  'RGS': {
    acronym: 'RGS',
    fullName: 'Revenue Growth Score',
    definition:
      'Scores 24-month revenue growth from 10 to 100. It compares trailing 12-month revenue with the prior 12 months. Faster long-term revenue growth produces a higher RGS.',
  },
  'Base RGS (24mo)': {
    acronym: 'RGS',
    fullName: 'Base Revenue Growth Score (24-month)',
    definition:
      'The Revenue Growth Score (RGS) from 24-month revenue growth, before the 6-month adjustment. Trailing 12-month revenue is compared with the prior 12 months.',
  },
  'Adjusted RGS (6mo)': {
    acronym: 'RGS',
    fullName: 'Adjusted Revenue Growth Score (6-month)',
    definition:
      'The 24-month Revenue Growth Score (RGS) raised or lowered using revenue growth in the latest 6 months versus the prior 6 months. Recent acceleration increases the score; a recent slowdown reduces it.',
  },
  'Revenue Growth Score (RGS)': {
    acronym: 'RGS',
    fullName: 'Revenue Growth Score',
    definition:
      'Scores 24-month revenue growth from 10 to 100. It compares trailing 12-month revenue with the prior 12 months. Faster long-term revenue growth produces a higher RGS.',
  },
  'RGS with 6-Month Adjustment': {
    acronym: 'RGS',
    fullName: 'Revenue Growth Score with 6-month adjustment',
    definition:
      'The 24-month Revenue Growth Score (RGS) after applying the 6-month adjustment. Recent 6-month revenue growth versus the prior 6 months raises or lowers the longer-term RGS so current momentum is visible.',
  },
  'Expense Adjustment': {
    fullName: 'Expense Adjustment',
    definition:
      'A bonus or penalty added to Adjusted RGS. It compares 24-month revenue growth with 24-month operating-expense growth. Revenue growing faster than expenses is a bonus; expenses growing faster than revenue is a penalty.',
  },
  'ADS': {
    acronym: 'ADS',
    fullName: 'Asset Development Score',
    definition:
      'Scores how the balance sheet is developing. It starts with the current Asset-Liability Ratio (ALR) and then adjusts for ALR Growth %. The result is capped between 10 and 100.',
  },
  'Asset Development Score': {
    acronym: 'ADS',
    fullName: 'Asset Development Score',
    definition:
      'Scores how the balance sheet is developing. It starts with the current Asset-Liability Ratio (ALR) and then adjusts for ALR Growth %. The result is capped between 10 and 100.',
  },
  'Asset Development Score (ADS)': {
    acronym: 'ADS',
    fullName: 'Asset Development Score',
    definition:
      'Scores how the balance sheet is developing. It starts with the current Asset-Liability Ratio (ALR) and then adjusts for ALR Growth %. The result is capped between 10 and 100.',
  },
  'ALR': {
    acronym: 'ALR',
    fullName: 'Asset-Liability Ratio',
    definition:
      'Total assets divided by total liabilities. ALR-1 is the current month’s ratio. A value above 1 means assets exceed liabilities.',
  },
  'ALR-1 (Current)': {
    acronym: 'ALR',
    fullName: 'Asset-Liability Ratio (current)',
    definition:
      'ALR is the Asset-Liability Ratio: total assets divided by total liabilities. ALR-1 is the current month’s ratio. A value above 1 means assets exceed liabilities.',
  },
  'ALR-1 (Asset-Liability Ratio)': {
    acronym: 'ALR',
    fullName: 'Asset-Liability Ratio (current)',
    definition:
      'ALR is the Asset-Liability Ratio: total assets divided by total liabilities. ALR-1 is the current month’s ratio. A value above 1 means assets exceed liabilities.',
  },
  'ALR Growth %': {
    acronym: 'ALR',
    fullName: 'Asset-Liability Ratio growth',
    definition:
      'The percent change in the Asset-Liability Ratio (ALR) from 13 months ago to the current month. A rising ALR means the company is building assets relative to liabilities.',
  },
};

export const FINANCIAL_SCORE_GLOSSARY: Array<{ term: string; definition: string }> = [
  {
    term: 'RGS — Revenue Growth Score',
    definition: FINANCIAL_SCORE_TERMS.RGS.definition,
  },
  {
    term: 'RGS 6-month adjustment',
    definition: FINANCIAL_SCORE_TERMS['RGS with 6-Month Adjustment'].definition,
  },
  {
    term: 'Expense Adjustment',
    definition: FINANCIAL_SCORE_TERMS['Expense Adjustment'].definition,
  },
  {
    term: 'Profitability Score / Profitability Score Trend',
    definition:
      'Profitability Score is Adjusted RGS plus the Expense Adjustment. The trend chart plots that score month by month.',
  },
  {
    term: 'ALR — Asset-Liability Ratio',
    definition: FINANCIAL_SCORE_TERMS.ALR.definition,
  },
  {
    term: 'ALR Growth %',
    definition: FINANCIAL_SCORE_TERMS['ALR Growth %'].definition,
  },
  {
    term: 'ADS — Asset Development Score',
    definition: FINANCIAL_SCORE_TERMS.ADS.definition,
  },
  {
    term: 'Financial Score Trend',
    definition: FINANCIAL_SCORE_TERMS['Financial Score Trend'].definition,
  },
];
