// Excel export utilities

import * as XLSX from 'xlsx';

export function exportDataReviewToExcel(monthly: any[], companyName: string) {
  if (!monthly || monthly.length === 0) {
    alert('No data to export');
    return;
  }

  const ws = XLSX.utils.json_to_sheet(monthly);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Review');
  XLSX.writeFile(wb, `${companyName || 'Company'}_DataReview_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportMonthlyRatiosToExcel(trendData: any[], companyName: string) {
  if (!trendData || trendData.length === 0) {
    alert('No ratios to export');
    return;
  }

  // Get last 12 months
  const last12 = trendData.slice(-12);
  const months = last12.map(d => d.month.substring(0, d.month.lastIndexOf('/')));

  // Create data arrays with ratios as rows
  const exportData: any[] = [];

  // Liquidity Ratios
  exportData.push({ 'Ratio': 'LIQUIDITY RATIOS', ...Object.fromEntries(months.map(m => [m, ''])) });
  exportData.push({ 'Ratio': 'Current Ratio', ...Object.fromEntries(last12.map((d, i) => [months[i], d.currentRatio?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Quick Ratio', ...Object.fromEntries(last12.map((d, i) => [months[i], d.quickRatio?.toFixed(2) || 'N/A'])) });

  // Activity Ratios
  exportData.push({ 'Ratio': 'ACTIVITY RATIOS', ...Object.fromEntries(months.map(m => [m, ''])) });
  exportData.push({ 'Ratio': 'Inventory Turnover', ...Object.fromEntries(last12.map((d, i) => [months[i], d.inventoryTO?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Receivables Turnover', ...Object.fromEntries(last12.map((d, i) => [months[i], d.receivablesTO?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Payables Turnover', ...Object.fromEntries(last12.map((d, i) => [months[i], d.payablesTO?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Days\' Inventory', ...Object.fromEntries(last12.map((d, i) => [months[i], d.daysInventory?.toFixed(0) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Days\' Receivables', ...Object.fromEntries(last12.map((d, i) => [months[i], d.daysReceivables?.toFixed(0) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Days\' Payables', ...Object.fromEntries(last12.map((d, i) => [months[i], d.daysPayables?.toFixed(0) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Sales/Working Capital', ...Object.fromEntries(last12.map((d, i) => [months[i], d.salesWC?.toFixed(2) || 'N/A'])) });

  // Leverage Ratios
  exportData.push({ 'Ratio': 'LEVERAGE RATIOS', ...Object.fromEntries(months.map(m => [m, ''])) });
  exportData.push({ 'Ratio': 'Interest Coverage', ...Object.fromEntries(last12.map((d, i) => [months[i], d.interestCoverage?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Debt Service Coverage', ...Object.fromEntries(last12.map((d, i) => [months[i], d.debtServiceCoverage?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Cash Flow to Debt', ...Object.fromEntries(last12.map((d, i) => [months[i], d.cashFlowToDebt?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Debt/Net Worth', ...Object.fromEntries(last12.map((d, i) => [months[i], d.debtToEquity?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Fixed Assets/Net Worth', ...Object.fromEntries(last12.map((d, i) => [months[i], d.fixedAssetsToEquity?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'Leverage Ratio', ...Object.fromEntries(last12.map((d, i) => [months[i], d.leverageRatio?.toFixed(2) || 'N/A'])) });

  // Operating Ratios
  exportData.push({ 'Ratio': 'OPERATING RATIOS', ...Object.fromEntries(months.map(m => [m, ''])) });
  exportData.push({ 'Ratio': 'Total Asset Turnover', ...Object.fromEntries(last12.map((d, i) => [months[i], d.totalAssetTO?.toFixed(2) || 'N/A'])) });
  exportData.push({ 'Ratio': 'ROE', ...Object.fromEntries(last12.map((d, i) => [months[i], d.roe !== undefined ? (d.roe * 100).toFixed(1) + '%' : 'N/A'])) });
  exportData.push({ 'Ratio': 'ROA', ...Object.fromEntries(last12.map((d, i) => [months[i], d.roa !== undefined ? (d.roa * 100).toFixed(1) + '%' : 'N/A'])) });
  exportData.push({ 'Ratio': 'EBITDA Margin', ...Object.fromEntries(last12.map((d, i) => [months[i], d.ebitdaMargin !== undefined ? (d.ebitdaMargin * 100).toFixed(1) + '%' : 'N/A'])) });
  exportData.push({ 'Ratio': 'EBIT Margin', ...Object.fromEntries(last12.map((d, i) => [months[i], d.ebitMargin !== undefined ? (d.ebitMargin * 100).toFixed(1) + '%' : 'N/A'])) });

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Ratios');
  XLSX.writeFile(wb, `${companyName || 'Company'}_MonthlyRatios_${new Date().toISOString().split('T')[0]}.xlsx`);
}

