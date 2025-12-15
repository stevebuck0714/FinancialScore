'use client';

import { useMemo, useState } from 'react';
import TextToSpeech from './common/TextToSpeech';

interface MonthlyData {
  date: Date;
  month: string;
  revenue: number;
  expense: number;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  ap: number;
  otherCL: number;
  tcl: number;
  totalAssets: number;
  totalLiab: number;
  totalEquity: number;
  totalLAndE: number;
  fixedAssets?: number;
  otherAssets?: number;
  ltd?: number;
}

interface TrendDataPoint {
  month: string;
  revenue: number;
  expense: number;
  rgs: number; // Revenue Growth Score
  currentRatio: number;
  quickRatio: number;
  debtToNW: number;
  roe: number;
  roa: number;
  interestCov: number;
  daysAR: number;
  daysInv: number;
  daysAP: number;
  totalAssetTO: number;
  ebitdaMargin: number;
}

interface Benchmark {
  metricName: string;
  fiveYearValue: number;
}

interface MDAAnalysis {
  strengths: string[];
  weaknesses: string[];
  insights: string[];
}

interface MDAViewProps {
  monthly: MonthlyData[];
  trendData: TrendDataPoint[];
  companyName: string;
  finalScore: number;
  profitabilityScore: number;
  growth_24mo: number;
  expenseAdjustment: number;
  revExpSpread: number;
  assetDevScore: number;
  ltmRev: number;
  benchmarks: Benchmark[];
  expenseGoals: {[key: string]: number};
  sdeMultiplier: number;
  ebitdaMultiplier: number;
  dcfDiscountRate: number;
  dcfTerminalGrowth: number;
  bestCaseRevMultiplier: number;
  bestCaseExpMultiplier: number;
  worstCaseRevMultiplier: number;
  worstCaseExpMultiplier: number;
  onExportToWord?: (executiveSummaryText: string, mdaAnalysis: MDAAnalysis) => void;
}

export default function MDAView({
  monthly,
  trendData,
  companyName,
  finalScore,
  profitabilityScore,
  growth_24mo,
  expenseAdjustment,
  revExpSpread,
  assetDevScore,
  ltmRev,
  benchmarks,
  expenseGoals,
  sdeMultiplier,
  ebitdaMultiplier,
  dcfDiscountRate,
  dcfTerminalGrowth,
  bestCaseRevMultiplier,
  bestCaseExpMultiplier,
  worstCaseRevMultiplier,
  worstCaseExpMultiplier,
  onExportToWord
}: MDAViewProps) {
  const [mdaTab, setMdaTab] = useState<'executive-summary' | 'strengths-insights' | 'key-metrics'>('executive-summary');

  // Helper function to format currency
  const formatDollar = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // MD&A Analysis - comprehensive analysis based on financial data
  const mdaAnalysis: MDAAnalysis = useMemo(() => {
    if (!trendData || trendData.length === 0) return { strengths: [], weaknesses: [], insights: [] };
    
    const last = trendData[trendData.length - 1];
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const insights: string[] = [];
    
    if (finalScore >= 70) strengths.push(`Strong overall financial score of ${finalScore.toFixed(1)}, indicating robust financial health.`);
    else if (finalScore < 50) weaknesses.push(`Financial score of ${finalScore.toFixed(1)} suggests significant areas for improvement.`);
    
    if (profitabilityScore >= 70) strengths.push(`Profitability score of ${profitabilityScore.toFixed(1)} demonstrates solid revenue growth and expense management.`);
    else if (profitabilityScore < 50) weaknesses.push(`Profitability score of ${profitabilityScore.toFixed(1)} indicates challenges in revenue growth or expense control.`);
    
    if (growth_24mo > 10) strengths.push(`24-month revenue growth of ${growth_24mo.toFixed(1)}% shows strong market expansion.`);
    else if (growth_24mo < 0) weaknesses.push(`Negative 24-month revenue growth of ${growth_24mo.toFixed(1)}% requires immediate strategic attention.`);
    
    if (expenseAdjustment > 0) strengths.push(`Expense management is outperforming revenue growth by ${revExpSpread.toFixed(1)}%, adding ${expenseAdjustment} points to profitability.`);
    else if (expenseAdjustment < 0) weaknesses.push(`Expenses are growing faster than revenue by ${Math.abs(revExpSpread).toFixed(1)}%, reducing profitability by ${Math.abs(expenseAdjustment)} points.`);
    
    if (assetDevScore >= 70) strengths.push(`Asset Development Score of ${assetDevScore.toFixed(1)} reflects a healthy asset-to-liability ratio and positive asset growth.`);
    else if (assetDevScore < 50) weaknesses.push(`Asset Development Score of ${assetDevScore.toFixed(1)} suggests concerning leverage and asset composition.`);
    
    if (last.currentRatio >= 1.5) strengths.push(`Current ratio of ${last.currentRatio.toFixed(1)} indicates strong short-term liquidity.`);
    else if (last.currentRatio < 1.0) weaknesses.push(`Current ratio of ${last.currentRatio.toFixed(1)} may indicate potential liquidity challenges.`);
    
    if (last.roe > 0.15) strengths.push(`Return on Equity of ${(last.roe * 100).toFixed(1)}% demonstrates efficient use of shareholder capital.`);
    else if (last.roe < 0) weaknesses.push(`Negative Return on Equity of ${(last.roe * 100).toFixed(1)}% indicates losses relative to equity.`);
    
    // KPI Analysis
    if (last.quickRatio >= 1.0) strengths.push(`Quick ratio of ${last.quickRatio.toFixed(1)} shows strong ability to meet short-term obligations without relying on inventory.`);
    else if (last.quickRatio < 0.5) weaknesses.push(`Quick ratio of ${last.quickRatio.toFixed(1)} suggests potential cash flow challenges.`);
    
    if (last.debtToNW < 1.0) strengths.push(`Debt-to-Net Worth ratio of ${last.debtToNW.toFixed(1)} indicates conservative leverage and strong equity position.`);
    else if (last.debtToNW > 2.0) weaknesses.push(`Debt-to-Net Worth ratio of ${last.debtToNW.toFixed(1)} suggests high leverage that may limit financial flexibility.`);
    
    if (last.interestCov > 3.0) strengths.push(`Interest coverage ratio of ${last.interestCov.toFixed(1)} demonstrates strong ability to service debt obligations.`);
    else if (last.interestCov < 1.5) weaknesses.push(`Interest coverage of ${last.interestCov.toFixed(1)} indicates potential difficulty meeting interest payments.`);
    
    // Projection Analysis
    if (monthly.length >= 24) {
      const last12Months = monthly.slice(-12);
      const prior12Months = monthly.slice(-24, -12);
      const recentRevGrowth = ((last12Months.reduce((s, m) => s + m.revenue, 0) - prior12Months.reduce((s, m) => s + m.revenue, 0)) / prior12Months.reduce((s, m) => s + m.revenue, 0)) * 100;
      
      if (recentRevGrowth > 10) insights.push(`Based on 12-month trends, revenue shows ${recentRevGrowth.toFixed(1)}% growth trajectory with strong expansion potential.`);
      else if (recentRevGrowth < -5) insights.push(`Revenue trends indicate ${Math.abs(recentRevGrowth).toFixed(1)}% decline trajectory - proactive measures recommended.`);
      
      const avgMonthlyRev = last12Months.reduce((s, m) => s + m.revenue, 0) / 12;
      const projectedAnnualRev = avgMonthlyRev * 12;
      
      if (recentRevGrowth > 15) insights.push(`Strong growth trajectory projects annual revenue of approximately $${(projectedAnnualRev / 1000).toFixed(0)}K with continued momentum.`);
      else if (recentRevGrowth < 0) insights.push(`Declining revenue trend requires strategic intervention to stabilize and restore growth.`);
      
      // Equity trend analysis
      const currentEquity = monthly[monthly.length - 1].totalEquity;
      const priorEquity = monthly[monthly.length - 13] ? monthly[monthly.length - 13].totalEquity : currentEquity;
      const equityChange = ((currentEquity - priorEquity) / Math.abs(priorEquity)) * 100;
      
      if (equityChange > 10) insights.push(`Equity has strengthened by ${equityChange.toFixed(1)}% over the past year, improving financial stability.`);
      else if (equityChange < -10) weaknesses.push(`Equity has declined by ${Math.abs(equityChange).toFixed(1)}% - monitor profitability and cash management closely.`);
    }
    
    // Trend Analysis Insights
    if (monthly.length >= 24) {
      const recentRevTrend = trendData.slice(-6).map(t => t.rgs).reduce((a, b) => a + b, 0) / 6;
      const priorRevTrend = trendData.slice(-12, -6).map(t => t.rgs).reduce((a, b) => a + b, 0) / 6;
      
      if (recentRevTrend > priorRevTrend + 10) strengths.push(`Revenue growth momentum is accelerating in recent months, indicating improving market position.`);
      else if (recentRevTrend < priorRevTrend - 10) weaknesses.push(`Revenue growth momentum is decelerating - review sales strategies and market positioning.`);
    }
    
    // Working Capital Analysis
    const lastMonth = monthly[monthly.length - 1];
    const currentAssets = lastMonth.tca || ((lastMonth.cash || 0) + (lastMonth.ar || 0) + (lastMonth.inventory || 0) + (lastMonth.otherCA || 0));
    const currentLiab = Math.abs(lastMonth.tcl || ((lastMonth.ap || 0) + (lastMonth.otherCL || 0)));
    const workingCapital = currentAssets - currentLiab;
    const wcRatioMDA = currentLiab > 0 ? currentAssets / currentLiab : 0;
    
    if (workingCapital > 0 && wcRatioMDA >= 1.5) {
      strengths.push(`Positive working capital of $${(workingCapital / 1000).toFixed(1)}K with strong WC ratio of ${wcRatioMDA.toFixed(1)} supports operational flexibility.`);
    } else if (workingCapital < 0) {
      weaknesses.push(`Negative working capital of $${(Math.abs(workingCapital) / 1000).toFixed(1)}K indicates potential short-term funding challenges.`);
    } else if (wcRatioMDA < 1.0) {
      weaknesses.push(`Working capital ratio of ${wcRatioMDA.toFixed(1)} is below optimal levels - consider improving liquidity.`);
    }
    
    // Activity Ratios (Days metrics)
    if (last.daysAR > 0) {
      if (last.daysAR < 45) strengths.push(`Days' receivables of ${last.daysAR.toFixed(0)} days reflects efficient collection practices.`);
      else if (last.daysAR > 90) weaknesses.push(`Days' receivables of ${last.daysAR.toFixed(0)} days suggests slow collection - review credit policies and collection procedures.`);
    }
    
    if (last.daysInv > 0) {
      if (last.daysInv < 60) insights.push(`Inventory turnover of ${last.daysInv.toFixed(0)} days indicates efficient inventory management.`);
      else if (last.daysInv > 120) weaknesses.push(`Days' inventory of ${last.daysInv.toFixed(0)} days may indicate slow-moving stock - consider inventory optimization.`);
    }
    
    if (last.daysAP > 0) {
      if (last.daysAP > 45) insights.push(`Days' payables of ${last.daysAP.toFixed(0)} days provides beneficial supplier financing.`);
      else if (last.daysAP < 20) insights.push(`Days' payables of ${last.daysAP.toFixed(0)} days - consider extending payment terms to improve cash flow.`);
    }
    
    // Cash Conversion Cycle
    const cashConversionCycle = last.daysInv + last.daysAR - last.daysAP;
    if (cashConversionCycle < 30) strengths.push(`Cash conversion cycle of ${cashConversionCycle.toFixed(0)} days demonstrates excellent working capital efficiency.`);
    else if (cashConversionCycle > 90) weaknesses.push(`Cash conversion cycle of ${cashConversionCycle.toFixed(0)} days suggests opportunities to accelerate cash generation.`);
    
    // Asset Efficiency
    if (last.totalAssetTO > 1.5) strengths.push(`Total asset turnover of ${last.totalAssetTO.toFixed(1)} shows effective asset utilization in generating sales.`);
    else if (last.totalAssetTO < 0.5) weaknesses.push(`Total asset turnover of ${last.totalAssetTO.toFixed(1)} indicates underutilized assets - review asset productivity.`);
    
    // Profitability Margins
    if (last.ebitdaMargin > 0.15) strengths.push(`EBITDA margin of ${(last.ebitdaMargin * 100).toFixed(1)}% demonstrates strong operational profitability.`);
    else if (last.ebitdaMargin < 0.05) weaknesses.push(`EBITDA margin of ${(last.ebitdaMargin * 100).toFixed(1)}% requires operational cost optimization.`);
    
    // Cash Flow Analysis
    if (monthly.length >= 13) {
      const currentCash = monthly[monthly.length - 1].cash;
      const priorYearCash = monthly[monthly.length - 13].cash;
      const cashChange = currentCash - priorYearCash;
      
      if (cashChange > ltmRev * 0.1) strengths.push(`Cash position improved by $${(cashChange / 1000).toFixed(1)}K over the past year, strengthening financial resilience.`);
      else if (cashChange < -ltmRev * 0.05) weaknesses.push(`Cash declined by $${(Math.abs(cashChange) / 1000).toFixed(1)}K - monitor cash flow and consider working capital improvements.`);
    }
    
    // Benchmark Comparison
    if (benchmarks && benchmarks.length > 0) {
      const getBenchmark = (metricName: string) => {
        const bm = benchmarks.find(b => b.metricName === metricName);
        return bm ? bm.fiveYearValue : null;
      };
      
      // Current Ratio Benchmark
      const currentRatioBM = getBenchmark('Current Ratio');
      if (currentRatioBM !== null && last.currentRatio) {
        if (last.currentRatio > currentRatioBM * 1.2) {
          strengths.push(`Current ratio of ${last.currentRatio.toFixed(1)} is ${((last.currentRatio / currentRatioBM - 1) * 100).toFixed(0)}% above industry average (${currentRatioBM.toFixed(1)}), demonstrating superior liquidity management.`);
        } else if (last.currentRatio < currentRatioBM * 0.8) {
          weaknesses.push(`Current ratio of ${last.currentRatio.toFixed(1)} is ${((1 - last.currentRatio / currentRatioBM) * 100).toFixed(0)}% below industry average (${currentRatioBM.toFixed(1)}), indicating potential liquidity concerns relative to peers.`);
        }
      }
      
      // Quick Ratio Benchmark
      const quickRatioBM = getBenchmark('Quick Ratio');
      if (quickRatioBM !== null && last.quickRatio) {
        if (last.quickRatio > quickRatioBM * 1.2) {
          strengths.push(`Quick ratio of ${last.quickRatio.toFixed(1)} exceeds industry average (${quickRatioBM.toFixed(1)}) by ${((last.quickRatio / quickRatioBM - 1) * 100).toFixed(0)}%, showing exceptional liquid asset management.`);
        } else if (last.quickRatio < quickRatioBM * 0.8) {
          weaknesses.push(`Quick ratio of ${last.quickRatio.toFixed(1)} trails industry average (${quickRatioBM.toFixed(1)}) by ${((1 - last.quickRatio / quickRatioBM) * 100).toFixed(0)}%, suggesting need for improved liquid asset positioning.`);
        }
      }
      
      // Debt to Net Worth Benchmark
      const debtToNWBM = getBenchmark('Total Debt to Net Worth Ratio');
      if (debtToNWBM !== null && last.debtToNW) {
        if (last.debtToNW < debtToNWBM * 0.7) {
          strengths.push(`Debt-to-Net Worth of ${last.debtToNW.toFixed(1)} is well below industry average (${debtToNWBM.toFixed(1)}), indicating conservative capital structure.`);
        } else if (last.debtToNW > debtToNWBM * 1.3) {
          weaknesses.push(`Debt-to-Net Worth of ${last.debtToNW.toFixed(1)} exceeds industry average (${debtToNWBM.toFixed(1)}), suggesting elevated financial leverage.`);
        }
      }
      
      // ROE Benchmark
      const roeBM = getBenchmark('Return on Net Worth %');
      if (roeBM !== null && last.roe) {
        const actualROE = last.roe * 100;
        if (actualROE > roeBM * 1.2) {
          strengths.push(`Return on Equity of ${actualROE.toFixed(1)}% exceeds industry benchmark (${roeBM.toFixed(1)}%) by ${((actualROE / roeBM - 1) * 100).toFixed(0)}%, demonstrating superior capital efficiency.`);
        } else if (actualROE < roeBM * 0.8) {
          weaknesses.push(`Return on Equity of ${actualROE.toFixed(1)}% lags industry benchmark (${roeBM.toFixed(1)}%) by ${((1 - actualROE / roeBM) * 100).toFixed(0)}%, indicating opportunities for improved profitability.`);
        }
      }
      
      // ROA Benchmark
      const roaBM = getBenchmark('Return on Total Assets %');
      if (roaBM !== null && last.roa) {
        const actualROA = last.roa * 100;
        if (actualROA > roaBM * 1.2) {
          strengths.push(`Return on Assets of ${actualROA.toFixed(1)}% exceeds industry norm (${roaBM.toFixed(1)}%) by ${((actualROA / roaBM - 1) * 100).toFixed(0)}%, reflecting superior asset productivity.`);
        } else if (actualROA < roaBM * 0.8) {
          weaknesses.push(`Return on Assets of ${actualROA.toFixed(1)}% trails industry norm (${roaBM.toFixed(1)}%) by ${((1 - actualROA / roaBM) * 100).toFixed(0)}%, suggesting asset utilization improvements needed.`);
        }
      }
    }
    
    return { strengths, weaknesses, insights };
  }, [trendData, monthly, finalScore, profitabilityScore, growth_24mo, expenseAdjustment, revExpSpread, assetDevScore, ltmRev, benchmarks]);

  const handleExportToWord = () => {
    if (onExportToWord) {
      // Get the executive summary text from the DOM
      const executiveSummaryElement = document.getElementById('mda-executive-summary-text');
      const executiveSummaryText = executiveSummaryElement?.innerText || '';
      onExportToWord(executiveSummaryText, mdaAnalysis);
    }
  };

  if (!monthly || monthly.length === 0 || !trendData || trendData.length === 0) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>
            No Financial Data Available
          </h2>
          <p style={{ fontSize: '16px', color: '#94a3b8' }}>
            Please upload financial data to generate the Management Discussion & Analysis report.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mda-container" style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <div className="mda-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: '0 0 8px 0' }}>
            Management Discussion & Analysis
          </h1>
          {companyName && (
            <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>
              {companyName}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onExportToWord && (
            <button
              className="no-print"
              onClick={handleExportToWord}
              style={{
                padding: '12px 24px',
                background: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)',
              }}
            >
              📄 Export to Word
            </button>
          )}
          <button 
            className="no-print"
            onClick={() => window.print()} 
            style={{ 
              padding: '12px 24px', 
              background: '#667eea', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              fontSize: '14px', 
              fontWeight: '600', 
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}
          >
            🖨️ Print
          </button>
          <TextToSpeech 
            targetElementId={
              mdaTab === 'executive-summary' ? 'mda-executive-summary-container' :
              mdaTab === 'strengths-insights' ? 'mda-strengths-insights-container' :
              'mda-key-metrics-container'
            }
            buttonLabel="Listen"
            variant="primary"
            style={{
              padding: '12px 24px',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
            }}
          />
        </div>
      </div>
      
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.5in;
          }
          
          .no-print,
          header,
          nav,
          aside,
          [role="navigation"] {
            display: none !important;
          }
          
          button[onclick*="setMdaTab"] {
            display: none !important;
          }
          
          * {
            box-shadow: none !important;
          }
          
          body, p, li, div {
            color: #000 !important;
          }
          
          h1, h2, h3 {
            page-break-after: avoid;
          }
          
          div[style*="background: white"] {
            page-break-inside: avoid;
          }
        }
      `}</style>
      
      {/* Tab Navigation */}
      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '12px', borderBottom: '2px solid #e2e8f0' }}>
        <button
          onClick={() => setMdaTab('executive-summary')}
          style={{
            padding: '12px 24px',
            background: mdaTab === 'executive-summary' ? '#667eea' : 'transparent',
            color: mdaTab === 'executive-summary' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: mdaTab === 'executive-summary' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Executive Summary
        </button>
        <button
          onClick={() => setMdaTab('strengths-insights')}
          style={{
            padding: '12px 24px',
            background: mdaTab === 'strengths-insights' ? '#667eea' : 'transparent',
            color: mdaTab === 'strengths-insights' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: mdaTab === 'strengths-insights' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Strengths and Insights
        </button>
        <button
          onClick={() => setMdaTab('key-metrics')}
          style={{
            padding: '12px 24px',
            background: mdaTab === 'key-metrics' ? '#667eea' : 'transparent',
            color: mdaTab === 'key-metrics' ? 'white' : '#64748b',
            border: 'none',
            borderBottom: mdaTab === 'key-metrics' ? '3px solid #667eea' : '3px solid transparent',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.2s'
          }}
        >
          Critical Review Items
        </button>
      </div>

      {/* Executive Summary Tab */}
      {mdaTab === 'executive-summary' && (
        <ExecutiveSummaryTab
          monthly={monthly}
          trendData={trendData}
          benchmarks={benchmarks}
          formatDollar={formatDollar}
          mdaAnalysis={mdaAnalysis}
          expenseGoals={expenseGoals}
          sdeMultiplier={sdeMultiplier}
          ebitdaMultiplier={ebitdaMultiplier}
          dcfDiscountRate={dcfDiscountRate}
          dcfTerminalGrowth={dcfTerminalGrowth}
          bestCaseRevMultiplier={bestCaseRevMultiplier}
          bestCaseExpMultiplier={bestCaseExpMultiplier}
          worstCaseRevMultiplier={worstCaseRevMultiplier}
          worstCaseExpMultiplier={worstCaseExpMultiplier}
          finalScore={finalScore}
          growth_24mo={growth_24mo}
          ltmRev={ltmRev}
        />
      )}

      {/* Strengths and Insights Tab */}
      {mdaTab === 'strengths-insights' && (
        <StrengthsInsightsTab mdaAnalysis={mdaAnalysis} />
      )}

      {/* Critical Review Items Tab */}
      {mdaTab === 'key-metrics' && monthly.length >= 12 && (
        <CriticalReviewTab monthly={monthly} formatDollar={formatDollar} />
      )}
    </div>
  );
}

// Executive Summary Tab Component - FULL COMPREHENSIVE VERSION
function ExecutiveSummaryTab({
  monthly,
  trendData,
  benchmarks,
  formatDollar,
  mdaAnalysis,
  expenseGoals,
  sdeMultiplier,
  ebitdaMultiplier,
  dcfDiscountRate,
  dcfTerminalGrowth,
  bestCaseRevMultiplier,
  bestCaseExpMultiplier,
  worstCaseRevMultiplier,
  worstCaseExpMultiplier,
  finalScore,
  growth_24mo,
  ltmRev
}: {
  monthly: MonthlyData[];
  trendData: TrendDataPoint[];
  benchmarks: Benchmark[];
  formatDollar: (value: number) => string;
  mdaAnalysis: MDAAnalysis;
  expenseGoals: {[key: string]: number};
  sdeMultiplier: number;
  ebitdaMultiplier: number;
  dcfDiscountRate: number;
  dcfTerminalGrowth: number;
  bestCaseRevMultiplier: number;
  bestCaseExpMultiplier: number;
  worstCaseRevMultiplier: number;
  worstCaseExpMultiplier: number;
  finalScore: number;
  growth_24mo: number;
  ltmRev: number;
}) {
  return (
    <div
      id="mda-executive-summary-container"
      style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
    >
      <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '12px' }}>
        Executive Summary
      </h2>

      {/* Comprehensive Analysis Narrative */}
      <div style={{ marginBottom: '28px' }}>
        <div id="mda-executive-summary-text" style={{ fontSize: '15px', lineHeight: '1.8', color: '#475569', background: '#f8fafc', padding: '20px', borderRadius: '8px', borderLeft: '4px solid #667eea' }}>
          <p style={{ margin: '0 0 12px 0' }}>
            {(() => {
              if (monthly.length < 12) return 'Requires 12+ months of data for year-over-year comparisons.';
              
              const currentQ = monthly.slice(-3);
              const fourQAgo = monthly.length >= 15 ? monthly.slice(-15, -12) : monthly.slice(-6, -3);
              const currentQRev = currentQ.reduce((sum, m) => sum + m.revenue, 0);
              const currentQExp = currentQ.reduce((sum, m) => sum + m.expense, 0);
              const fourQAgoRev = fourQAgo.reduce((sum, m) => sum + m.revenue, 0);
              const fourQAgoExp = fourQAgo.reduce((sum, m) => sum + m.expense, 0);
              const qRevChange = fourQAgoRev > 0 ? ((currentQRev - fourQAgoRev) / fourQAgoRev * 100) : 0;
              const qExpChange = fourQAgoExp > 0 ? ((currentQExp - fourQAgoExp) / fourQAgoExp * 100) : 0;
              const currentQMargin = currentQRev > 0 ? ((currentQRev - currentQExp) / currentQRev * 100) : 0;
              const fourQAgoMargin = fourQAgoRev > 0 ? ((fourQAgoRev - fourQAgoExp) / fourQAgoRev * 100) : 0;
              const qMarginChange = currentQMargin - fourQAgoMargin;
              
              const last12 = monthly.slice(-12);
              const prior12 = monthly.length >= 24 ? monthly.slice(-24, -12) : monthly.slice(0, 12);
              const ttmRev = last12.reduce((sum, m) => sum + m.revenue, 0);
              const ttmExp = last12.reduce((sum, m) => sum + m.expense, 0);
              const priorTTMRev = prior12.reduce((sum, m) => sum + m.revenue, 0);
              const priorTTMExp = prior12.reduce((sum, m) => sum + m.expense, 0);
              const ttmRevChange = priorTTMRev > 0 ? ((ttmRev - priorTTMRev) / priorTTMRev * 100) : 0;
              const ttmExpChange = priorTTMExp > 0 ? ((ttmExp - priorTTMExp) / priorTTMExp * 100) : 0;
              const ttmMargin = ttmRev > 0 ? ((ttmRev - ttmExp) / ttmRev * 100) : 0;
              const priorTTMMargin = priorTTMRev > 0 ? ((priorTTMRev - priorTTMExp) / priorTTMRev * 100) : 0;
              const ttmMarginChange = ttmMargin - priorTTMMargin;
              
              return (
                <>
                  <strong>Current quarter</strong> revenue of <strong>{formatDollar(currentQRev)}</strong> represents a {qRevChange > 0 ? 'increase' : 'decrease'} of <strong style={{ color: qRevChange > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(qRevChange).toFixed(1)}%</strong> compared to four quarters ago ({formatDollar(fourQAgoRev)}), 
                  while total expenses of <strong>{formatDollar(currentQExp)}</strong> {qExpChange > 0 ? 'increased' : 'decreased'} by <strong style={{ color: Math.abs(qExpChange) < Math.abs(qRevChange) ? '#10b981' : '#ef4444' }}>{Math.abs(qExpChange).toFixed(1)}%</strong> from {formatDollar(fourQAgoExp)}.
                  Quarterly profit margin {qMarginChange > 0 ? 'expanded' : 'contracted'} by <strong style={{ color: qMarginChange > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(qMarginChange).toFixed(1)}</strong> percentage points to <strong>{currentQMargin.toFixed(1)}%</strong>
                  {qMarginChange > 5 ? <span style={{ color: '#10b981' }}>, reflecting significant margin expansion and improving profitability</span> :
                   qMarginChange > 0 ? <span style={{ color: '#10b981' }}>, indicating positive margin trajectory</span> :
                   qMarginChange > -5 ? <span style={{ color: '#64748b' }}>, maintaining relatively stable profitability</span> :
                   <span style={{ color: '#ef4444' }}>, signaling substantial margin pressure requiring immediate management attention</span>}.
                  {' '}<strong>Trailing twelve months (TTM)</strong> revenue of <strong>{formatDollar(ttmRev)}</strong> shows {ttmRevChange > 0 ? 'growth' : 'decline'} of <strong style={{ color: ttmRevChange > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(ttmRevChange).toFixed(1)}%</strong> compared to the prior twelve-month period ({formatDollar(priorTTMRev)}), 
                  with total expenses of <strong>{formatDollar(ttmExp)}</strong> {ttmExpChange > 0 ? 'growing' : 'declining'} by <strong style={{ color: Math.abs(ttmExpChange) < Math.abs(ttmRevChange) ? '#10b981' : '#ef4444' }}>{Math.abs(ttmExpChange).toFixed(1)}%</strong> from {formatDollar(priorTTMExp)}.
                  Annual profit margin {ttmMarginChange > 0 ? 'improved' : 'deteriorated'} by <strong style={{ color: ttmMarginChange > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(ttmMarginChange).toFixed(1)}</strong> percentage points to <strong>{ttmMargin.toFixed(1)}%</strong>
                  {ttmExpChange < ttmRevChange ? <span style={{ color: '#10b981' }}>, with excellent operational leverage as expense growth is controlled relative to revenue expansion</span> :
                   ttmExpChange > ttmRevChange + 5 ? <span style={{ color: '#ef4444' }}>, indicating concerning expense growth outpacing revenue that requires cost management initiatives</span> :
                   ', maintaining operational efficiency'}.
                </>
              );
            })()}
          </p>
          
          {/* Financial Ratios Analysis */}
          <p style={{ margin: '12px 0' }}>
            <strong style={{ color: '#667eea' }}>Financial Ratios</strong> analysis provides insight into operational performance and financial health:
            {(() => {
              const ratioAnalysis = [];
              
              // Current Ratio
              const currentRatioBM = benchmarks.find(b => b.metricName === 'Current Ratio')?.fiveYearValue;
              if (currentRatioBM && trendData[trendData.length - 1]?.currentRatio) {
                const actual = trendData[trendData.length - 1].currentRatio;
                const diff = ((actual / currentRatioBM - 1) * 100);
                if (Math.abs(diff) > 20) {
                  ratioAnalysis.push(
                    <span key="current-ratio">
                      <strong> Current Ratio</strong> of {actual.toFixed(2)} is <strong style={{ color: diff > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(diff).toFixed(0)}% {diff > 0 ? 'above' : 'below'}</strong> the industry average of {currentRatioBM.toFixed(2)}
                      {diff > 0 ? ', indicating strong short-term liquidity with ample current assets to cover current liabilities, providing cushion for operational needs' : 
                       ', suggesting potential liquidity constraints that may limit flexibility in meeting short-term obligations'}.
                    </span>
                  );
                }
              }
              
              // Quick Ratio
              const quickRatioBM = benchmarks.find(b => b.metricName === 'Quick Ratio')?.fiveYearValue;
              if (quickRatioBM && trendData[trendData.length - 1]?.quickRatio) {
                const actual = trendData[trendData.length - 1].quickRatio;
                const diff = ((actual / quickRatioBM - 1) * 100);
                if (Math.abs(diff) > 20) {
                  ratioAnalysis.push(
                    <span key="quick-ratio">
                      <strong> Quick Ratio</strong> of {actual.toFixed(2)} stands <strong style={{ color: diff > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(diff).toFixed(0)}% {diff > 0 ? 'above' : 'below'}</strong> industry norms of {quickRatioBM.toFixed(2)}
                      {diff > 0 ? ', demonstrating excellent immediate liquidity with liquid assets readily available to meet urgent obligations without relying on inventory conversion' :
                       ', indicating the company may face challenges meeting immediate obligations from liquid assets alone, potentially requiring inventory liquidation or external financing'}.
                    </span>
                  );
                }
              }
              
              // Debt to Net Worth
              const debtToNWBM = benchmarks.find(b => b.metricName === 'Total Debt to Net Worth Ratio')?.fiveYearValue;
              if (debtToNWBM && trendData[trendData.length - 1]?.debtToNW) {
                const actual = trendData[trendData.length - 1].debtToNW;
                const diff = ((actual / debtToNWBM - 1) * 100);
                if (Math.abs(diff) > 30) {
                  ratioAnalysis.push(
                    <span key="debt-nw">
                      <strong> Debt-to-Net Worth</strong> ratio of {actual.toFixed(2)} is <strong style={{ color: diff < 0 ? '#10b981' : '#ef4444' }}>{Math.abs(diff).toFixed(0)}% {diff > 0 ? 'above' : 'below'}</strong> industry average of {debtToNWBM.toFixed(2)}
                      {diff < 0 ? ', reflecting conservative capital structure with lower financial leverage, which reduces financial risk but may indicate underutilization of debt financing opportunities' :
                       ', indicating aggressive leverage that increases financial risk, amplifies return volatility, and may constrain future borrowing capacity or increase financing costs'}.
                    </span>
                  );
                }
              }
              
              // ROE
              const roeBM = benchmarks.find(b => b.metricName === 'Return on Net Worth %')?.fiveYearValue;
              if (roeBM && trendData[trendData.length - 1]?.roe) {
                const actualROE = trendData[trendData.length - 1].roe * 100;
                const diff = ((actualROE / roeBM - 1) * 100);
                if (Math.abs(diff) > 20) {
                  ratioAnalysis.push(
                    <span key="roe">
                      <strong> Return on Equity</strong> of {actualROE.toFixed(1)}% is <strong style={{ color: diff > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(diff).toFixed(0)}% {diff > 0 ? 'above' : 'below'}</strong> industry benchmark of {roeBM.toFixed(1)}%
                      {diff > 0 ? ', demonstrating superior profitability and efficient use of shareholder capital, suggesting strong competitive positioning and effective management execution' :
                       ', indicating below-average returns on equity investment, which may signal operational inefficiencies, margin pressures, or suboptimal capital deployment'}.
                    </span>
                  );
                }
              }
              
              // ROA
              const roaBM = benchmarks.find(b => b.metricName === 'Return on Total Assets %')?.fiveYearValue;
              if (roaBM && trendData[trendData.length - 1]?.roa) {
                const actualROA = trendData[trendData.length - 1].roa * 100;
                const diff = ((actualROA / roaBM - 1) * 100);
                if (Math.abs(diff) > 20) {
                  ratioAnalysis.push(
                    <span key="roa">
                      <strong> Return on Assets</strong> of {actualROA.toFixed(1)}% is <strong style={{ color: diff > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(diff).toFixed(0)}% {diff > 0 ? 'above' : 'below'}</strong> industry norm of {roaBM.toFixed(1)}%
                      {diff > 0 ? ', reflecting efficient asset utilization and strong operational performance in converting invested capital into profits' :
                       ', suggesting assets are generating below-average returns, potentially indicating overcapitalization, underutilized capacity, or operational inefficiencies'}.
                    </span>
                  );
                }
              }
              
              // Asset Turnover
              const assetTOBM = benchmarks.find(b => b.metricName === 'Total Asset Turnover')?.fiveYearValue;
              if (assetTOBM && trendData[trendData.length - 1]?.totalAssetTO) {
                const actual = trendData[trendData.length - 1].totalAssetTO;
                const diff = ((actual / assetTOBM - 1) * 100);
                if (Math.abs(diff) > 20) {
                  ratioAnalysis.push(
                    <span key="asset-to">
                      <strong> Asset Turnover</strong> of {actual.toFixed(2)} is <strong style={{ color: diff > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(diff).toFixed(0)}% {diff > 0 ? 'higher than' : 'lower than'}</strong> industry average of {assetTOBM.toFixed(2)}
                      {diff > 0 ? ', indicating efficient revenue generation per dollar of assets, suggesting effective asset management and strong sales productivity' :
                       ', reflecting lower revenue generation efficiency, which may indicate excess asset investments, idle capacity, or need for improved asset utilization strategies'}.
                    </span>
                  );
                }
              }
              
              // Days Receivables
              const daysARBM = benchmarks.find(b => b.metricName === "Days' Receivables")?.fiveYearValue;
              if (daysARBM && trendData[trendData.length - 1]?.daysAR > 0) {
                const actual = trendData[trendData.length - 1].daysAR;
                const diff = ((actual / daysARBM - 1) * 100);
                if (Math.abs(diff) > 20) {
                  ratioAnalysis.push(
                    <span key="days-ar">
                      <strong> Days Receivables</strong> of {actual.toFixed(0)} days is <strong style={{ color: diff < 0 ? '#10b981' : '#ef4444' }}>{Math.abs(diff).toFixed(0)}% {diff > 0 ? 'slower' : 'faster'}</strong> than industry average of {daysARBM.toFixed(0)} days
                      {diff < 0 ? ', demonstrating strong collections processes and efficient working capital management, freeing up cash for operations' :
                       ', indicating collection challenges that tie up working capital, potentially reflecting lenient credit terms, weak collection procedures, or customer payment difficulties'}.
                    </span>
                  );
                }
              }
              
              if (ratioAnalysis.length === 0) {
                return <span> The company's key financial ratios are generally in line with industry benchmarks, indicating balanced financial performance across liquidity, leverage, profitability, and efficiency metrics.</span>;
              }
              
              return ratioAnalysis;
            })()}.
            {benchmarks.length > 0 ? (() => {
              const comparisons = [];
              let aboveCount = 0;
              let belowCount = 0;
              
              const currentRatioBM = benchmarks.find(b => b.metricName === 'Current Ratio')?.fiveYearValue;
              if (currentRatioBM && trendData[trendData.length - 1]?.currentRatio) {
                if (trendData[trendData.length - 1].currentRatio > currentRatioBM * 1.2) aboveCount++;
                else if (trendData[trendData.length - 1].currentRatio < currentRatioBM * 0.8) belowCount++;
              }
              
              const quickRatioBM = benchmarks.find(b => b.metricName === 'Quick Ratio')?.fiveYearValue;
              if (quickRatioBM && trendData[trendData.length - 1]?.quickRatio) {
                if (trendData[trendData.length - 1].quickRatio > quickRatioBM * 1.2) aboveCount++;
                else if (trendData[trendData.length - 1].quickRatio < quickRatioBM * 0.8) belowCount++;
              }
              
              const debtToNWBM = benchmarks.find(b => b.metricName === 'Total Debt to Net Worth Ratio')?.fiveYearValue;
              if (debtToNWBM && trendData[trendData.length - 1]?.debtToNW) {
                if (trendData[trendData.length - 1].debtToNW < debtToNWBM * 0.7) aboveCount++;
                else if (trendData[trendData.length - 1].debtToNW > debtToNWBM * 1.3) belowCount++;
              }
              
              const roeBM = benchmarks.find(b => b.metricName === 'Return on Net Worth %')?.fiveYearValue;
              if (roeBM && trendData[trendData.length - 1]?.roe) {
                if ((trendData[trendData.length - 1].roe * 100) > roeBM * 1.2) aboveCount++;
                else if ((trendData[trendData.length - 1].roe * 100) < roeBM * 0.8) belowCount++;
              }
              
              const roaBM = benchmarks.find(b => b.metricName === 'Return on Total Assets %')?.fiveYearValue;
              if (roaBM && trendData[trendData.length - 1]?.roa) {
                if ((trendData[trendData.length - 1].roa * 100) > roaBM * 1.2) aboveCount++;
                else if ((trendData[trendData.length - 1].roa * 100) < roaBM * 0.8) belowCount++;
              }
              
              const totalCompared = aboveCount + belowCount;
              if (totalCompared > 0) {
                return <span> Overall, the company {aboveCount > belowCount ? <strong style={{ color: '#10b981' }}>outperforms</strong> : aboveCount < belowCount ? <strong style={{ color: '#ef4444' }}>underperforms</strong> : 'performs comparably to'} industry benchmarks in {aboveCount} of the key ratios shown above{belowCount > 0 ? `, with ${belowCount} areas below industry standards requiring attention` : ', demonstrating strong financial management'}.</span>;
              }
              return ` Industry benchmarks from ${benchmarks.length} metrics provide context for performance assessment.`;
            })() : ''}
          </p>

          {/* Trend Analysis */}
          <p style={{ margin: '12px 0' }}>
            <strong style={{ color: '#667eea' }}>Trend Analysis</strong> tracking {monthly.length} months reveals:
            {(() => {
              const last6Mo = monthly.slice(-6);
              const prev6Mo = monthly.slice(-12, -6);
              const revRecent = last6Mo.reduce((s, m) => s + m.revenue, 0);
              const revPrior = prev6Mo.reduce((s, m) => s + m.revenue, 0);
              const revTrend = prev6Mo.length > 0 ? ((revRecent - revPrior) / revPrior * 100) : 0;
              
              const expRecent = last6Mo.reduce((s, m) => s + m.expense, 0);
              const expPrior = prev6Mo.reduce((s, m) => s + m.expense, 0);
              const expTrend = prev6Mo.length > 0 ? ((expRecent - expPrior) / expPrior * 100) : 0;
              
              const recentMargin = revRecent > 0 ? ((revRecent - expRecent) / revRecent * 100) : 0;
              const priorMargin = revPrior > 0 ? ((revPrior - expPrior) / revPrior * 100) : 0;
              const marginChange = recentMargin - priorMargin;
              
              const currentAssets = monthly[monthly.length - 1]?.totalAssets || 0;
              const priorAssets = monthly[monthly.length - 13] ? monthly[monthly.length - 13].totalAssets : currentAssets;
              const assetGrowth = priorAssets > 0 ? ((currentAssets - priorAssets) / priorAssets * 100) : 0;
              
              return (
                <span>
                  {' '}Recent six-month period shows revenue <strong style={{ color: revTrend > 0 ? '#10b981' : '#ef4444' }}>{revTrend > 0 ? 'growth' : 'decline'}</strong> of <strong style={{ color: revTrend > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(revTrend).toFixed(1)}%</strong> compared to the prior six months{revTrend > 10 ? <span style={{ color: '#10b981' }}>, indicating accelerating momentum</span> : revTrend < -10 ? <span style={{ color: '#ef4444' }}>, suggesting declining trajectory</span> : ', showing moderate movement'}, 
                  while expenses <strong style={{ color: Math.abs(expTrend) < Math.abs(revTrend) ? '#10b981' : '#ef4444' }}>{expTrend > 0 ? 'increased' : 'decreased'}</strong> by <strong style={{ color: Math.abs(expTrend) < Math.abs(revTrend) ? '#10b981' : '#ef4444' }}>{Math.abs(expTrend).toFixed(1)}%</strong>.
                  Profit margin {marginChange > 0 ? <strong style={{ color: '#10b981' }}>expanded</strong> : marginChange < 0 ? <strong style={{ color: '#ef4444' }}>contracted</strong> : 'remained stable'} by {Math.abs(marginChange).toFixed(1)} percentage points to {recentMargin.toFixed(1)}%{marginChange > 5 ? <span style={{ color: '#10b981' }}>, demonstrating strong margin improvement</span> : marginChange < -5 ? <span style={{ color: '#ef4444' }}>, indicating margin pressure requiring attention</span> : ''}.
                  {' '}Total assets {assetGrowth > 0 ? 'grew' : 'declined'} by <strong style={{ color: assetGrowth > 0 ? '#10b981' : '#ef4444' }}>{Math.abs(assetGrowth).toFixed(1)}%</strong> year-over-year{assetGrowth > 15 ? <span style={{ color: '#10b981' }}>, reflecting significant asset expansion</span> : assetGrowth < -10 ? <span style={{ color: '#ef4444' }}>, indicating asset contraction</span> : ''}.
                </span>
              );
            })()}
          </p>
          
          {/* Projections Section */}
          <p style={{ margin: '12px 0' }}>
            <strong style={{ color: '#667eea' }}>Projections</strong> based on historical patterns forecast {monthly.length >= 24 ? (() => {
              const last12 = monthly.slice(-12);
              const prev12 = monthly.slice(-24, -12);
              const annualRevGrowth = ((last12.reduce((s, m) => s + m.revenue, 0) - prev12.reduce((s, m) => s + m.revenue, 0)) / prev12.reduce((s, m) => s + m.revenue, 0)) * 100;
              const annualExpGrowth = ((last12.reduce((s, m) => s + m.expense, 0) - prev12.reduce((s, m) => s + m.expense, 0)) / prev12.reduce((s, m) => s + m.expense, 0)) * 100;
              
              const mostLikelyRevGrowth = annualRevGrowth;
              const mostLikelyExpGrowth = annualExpGrowth;
              const bestCaseRevGrowth = annualRevGrowth * bestCaseRevMultiplier;
              const bestCaseExpGrowth = annualExpGrowth * bestCaseExpMultiplier;
              const worstCaseRevGrowth = annualRevGrowth * worstCaseRevMultiplier;
              const worstCaseExpGrowth = annualExpGrowth * worstCaseExpMultiplier;
              
              return (
                <span>
                  three scenarios for the next 12 months: <strong>Most Likely</strong> projects revenue growing at <strong style={{ color: '#667eea' }}>{mostLikelyRevGrowth.toFixed(1)}%</strong> annually 
                  with expenses at <strong style={{ color: '#667eea' }}>{mostLikelyExpGrowth.toFixed(1)}%</strong> (continuing historical trends); 
                  <strong> Best Case</strong> models revenue accelerating to <strong style={{ color: '#10b981' }}>{bestCaseRevGrowth.toFixed(1)}%</strong> growth 
                  while controlling expenses to <strong style={{ color: '#10b981' }}>{bestCaseExpGrowth.toFixed(1)}%</strong> growth 
                  {bestCaseRevGrowth > bestCaseExpGrowth + 10 ? ', creating significant margin expansion potential' : 
                   bestCaseRevGrowth > bestCaseExpGrowth ? ', supporting improved profitability' : ''};
                  <strong> Worst Case</strong> assumes revenue slowing to <strong style={{ color: '#ef4444' }}>{worstCaseRevGrowth.toFixed(1)}%</strong> 
                  with expenses rising to <strong style={{ color: '#ef4444' }}>{worstCaseExpGrowth.toFixed(1)}%</strong>
                  {worstCaseExpGrowth > worstCaseRevGrowth ? ', potentially compressing margins and requiring cost management focus' : ''}.
                  These scenarios model corresponding balance sheet evolution with sensitivity analysis for asset deployment, working capital needs, and capital structure implications.
                </span>
              );
            })() : 'forward-looking scenarios once sufficient historical data (24+ months) is available'}.
          </p>

          {/* Working Capital Section */}
          <p style={{ margin: '12px 0' }}>
            <strong style={{ color: '#667eea' }}>Working Capital</strong> analysis reveals critical insights into liquidity management:
            {(() => {
              const current = monthly[monthly.length - 1];
              const currentCash = current?.cash || 0;
              const currentAR = current?.ar || 0;
              const currentInv = current?.inventory || 0;
              const currentOtherCA = current?.otherCA || 0;
              const currentAP = current?.ap || 0;
              const currentOtherCL = current?.otherCL || 0;
              
              const totalCA = current?.tca || (currentCash + currentAR + currentInv + currentOtherCA);
              const totalCL = current?.tcl || (currentAP + currentOtherCL);
              const currentWC = totalCA - totalCL;
              
              const last12Revenue = monthly.slice(-12).reduce((sum, m) => sum + (m.revenue || 0), 0);
              const wcPctRevenue = last12Revenue > 0 ? (currentWC / last12Revenue) * 100 : 0;
              const wcRatio = totalCL > 0 ? totalCA / totalCL : 0;
              
              const ccc = (trendData[trendData.length - 1]?.daysInv || 0) + (trendData[trendData.length - 1]?.daysAR || 0) - (trendData[trendData.length - 1]?.daysAP || 0);
              
              return (
                <span>
                  <strong> Current position</strong> shows working capital of <strong style={{ color: currentWC > 0 ? '#10b981' : '#ef4444' }}>{formatDollar(currentWC)}</strong> ({currentWC > 0 ? 'positive' : 'negative'}), 
                  representing <strong>{wcPctRevenue.toFixed(1)}%</strong> of trailing twelve-month revenue
                  {wcPctRevenue > 20 ? <span style={{ color: '#10b981' }}>, indicating strong liquidity cushion</span> :
                   wcPctRevenue > 10 ? ', providing adequate working capital' :
                   wcPctRevenue > 0 ? <span style={{ color: '#f59e0b' }}>, suggesting limited liquidity buffer</span> :
                   <span style={{ color: '#ef4444' }}>, indicating negative working capital requiring attention</span>}.
                  The working capital ratio of <strong>{wcRatio.toFixed(2)}</strong>
                  {wcRatio < 1.0 ? <span style={{ color: '#ef4444' }}> indicates current liabilities exceed current assets</span> :
                   wcRatio < 1.5 ? <span style={{ color: '#f59e0b' }}> suggests tight liquidity</span> :
                   wcRatio > 3.0 ? <span style={{ color: '#10b981' }}> reflects exceptionally strong liquidity</span> :
                   ' indicates adequate short-term liquidity'}.
                  <strong> Cash Conversion Cycle</strong> of <strong style={{ color: ccc < 30 ? '#10b981' : ccc < 60 ? '#64748b' : ccc < 90 ? '#f59e0b' : '#ef4444' }}>{ccc.toFixed(0)} days</strong>
                  {ccc < 0 ? <span style={{ color: '#10b981' }}> indicates payment received before paying suppliers - exceptionally favorable</span> :
                   ccc < 30 ? <span style={{ color: '#10b981' }}> demonstrates highly efficient working capital management</span> :
                   ccc < 60 ? ' reflects reasonable efficiency' :
                   ccc < 90 ? <span style={{ color: '#f59e0b' }}> suggests extended cycle tying up cash</span> :
                   <span style={{ color: '#ef4444' }}> indicates excessive working capital requirements</span>}
                  {' '}comprises Days Inventory {(trendData[trendData.length - 1]?.daysInv || 0).toFixed(0)} days, 
                  Days Receivables {(trendData[trendData.length - 1]?.daysAR || 0).toFixed(0)} days, 
                  less Days Payables {(trendData[trendData.length - 1]?.daysAP || 0).toFixed(0)} days.
                </span>
              );
            })()}
          </p>

          {/* Cash Flow Section */}
          <p style={{ margin: '12px 0' }}>
            <strong style={{ color: '#667eea' }}>Cash Flow</strong> analysis across operating, investing, and financing activities:
            {(() => {
              if (monthly.length < 12) return ' (requires 12+ months of data for comprehensive analysis)';
              
              const last12 = monthly.slice(-12);
              const prior = monthly.length > 12 ? monthly[monthly.length - 13] : last12[0];
              
              const ltmNetIncome = last12.reduce((sum, m) => sum + (m.revenue - m.expense), 0);
              const ltmDepreciation = last12.reduce((sum, m) => sum + (m.depreciationAmortization || 0), 0);
              const changeInAR = last12[last12.length - 1].ar - prior.ar;
              const changeInInv = last12[last12.length - 1].inventory - prior.inventory;
              const changeInAP = last12[last12.length - 1].ap - prior.ap;
              const changeInWC = -(changeInAR + changeInInv - changeInAP);
              const operatingCF = ltmNetIncome + ltmDepreciation + changeInWC;
              const opCFMargin = ltmRev > 0 ? (operatingCF / ltmRev * 100) : 0;
              
              const changeInFA = last12[last12.length - 1].fixedAssets - prior.fixedAssets;
              const capEx = changeInFA + ltmDepreciation;
              const investingCF = -capEx;
              
              const changeInDebt = last12[last12.length - 1].ltd - prior.ltd;
              const changeInEquity = last12[last12.length - 1].totalEquity - prior.totalEquity - ltmNetIncome;
              const financingCF = changeInDebt + changeInEquity;
              
              const freeCF = operatingCF - Math.max(0, capEx);
              const cashChange = last12[last12.length - 1].cash - prior.cash;
              
              return (
                <span>
                  <strong> Operating activities</strong> generated <strong style={{ color: operatingCF > 0 ? '#10b981' : '#ef4444' }}>{formatDollar(operatingCF)}</strong>, 
                  representing an operating cash flow margin of <strong>{opCFMargin.toFixed(1)}%</strong>
                  {opCFMargin > 15 ? <span style={{ color: '#10b981' }}>, demonstrating excellent cash conversion</span> :
                   opCFMargin > 5 ? ', indicating healthy cash generation' :
                   opCFMargin > 0 ? <span style={{ color: '#f59e0b' }}>, suggesting opportunities to improve efficiency</span> :
                   <span style={{ color: '#ef4444' }}>, indicating cash outflow requiring attention</span>}.
                  <strong> Investing activities</strong> {investingCF < 0 ? 'deployed' : 'generated'} <strong>{formatDollar(investingCF)}</strong>
                  {capEx > 0 ? ', supporting maintenance and growth of the asset base' : ''}.
                  <strong> Financing activities</strong> {financingCF > 0 ? 'provided' : 'consumed'} <strong>{formatDollar(financingCF)}</strong>.
                  <strong> Free cash flow</strong> of <strong style={{ color: freeCF > 0 ? '#10b981' : '#ef4444' }}>{formatDollar(freeCF)}</strong>
                  {freeCF > ltmNetIncome * 1.2 ? <span style={{ color: '#10b981' }}> (exceeding net income) provides strong financial flexibility</span> :
                   freeCF > 0 ? ' provides resources for strategic initiatives' :
                   <span style={{ color: '#ef4444' }}> indicates operations not generating sufficient cash</span>}.
                  Net cash {cashChange > 0 ? 'increased' : 'decreased'} by <strong style={{ color: cashChange > 0 ? '#10b981' : '#f59e0b' }}>{formatDollar(cashChange)}</strong>.
                </span>
              );
            })()}
          </p>

          {/* Goals Section */}
          <p style={{ margin: '12px 0' }}>
            <strong style={{ color: '#667eea' }}>Goals</strong> tracking enables comparison against management targets:
            {(() => {
              if (monthly.length < 3) return ' (requires at least 3 months of data)';
              
              const majorCategories = [
                { key: 'payroll', label: 'Payroll' },
                { key: 'ownerBasePay', label: 'Owner Compensation' },
                { key: 'rent', label: 'Rent/Lease' },
                { key: 'professionalFees', label: 'Professional Services' }
              ];
              
              const lastQuarter = monthly.slice(-3);
              const categoryAnalysis = majorCategories.map(cat => {
                const totals = lastQuarter.reduce((acc, m) => {
                  acc.totalRevenue += m.revenue || 0;
                  acc.totalExpense += (m as any)[cat.key] || 0;
                  return acc;
                }, { totalRevenue: 0, totalExpense: 0 });
                
                const actualPct = totals.totalRevenue > 0 ? (totals.totalExpense / totals.totalRevenue * 100) : 0;
                const goalPct = expenseGoals[cat.key];
                
                return {
                  label: cat.label,
                  actual: actualPct,
                  goal: goalPct,
                  hasGoal: goalPct && goalPct > 0,
                  variance: goalPct ? actualPct - goalPct : 0,
                  metGoal: goalPct ? actualPct <= goalPct : null
                };
              });
              
              const anyGoalsSet = categoryAnalysis.some(c => c.hasGoal);
              if (!anyGoalsSet) {
                return ' Management has not yet established expense goals for tracking and variance analysis.';
              }
              
              const categoriesWithGoalsAndSpend = categoryAnalysis.filter(c => c.hasGoal && c.actual > 0.5);
              const SIGNIFICANT_THRESHOLD = 1.5;
              const significantlyOver = categoriesWithGoalsAndSpend.filter(c => !c.metGoal && c.variance > SIGNIFICANT_THRESHOLD);
              const onTarget = categoriesWithGoalsAndSpend.filter(c => Math.abs(c.variance) <= SIGNIFICANT_THRESHOLD);
              
              if (significantlyOver.length === 0 && onTarget.length > 0) {
                return ' All tracked expense categories are performing on target, demonstrating effective expense management.';
              }
              
              if (significantlyOver.length > 0) {
                return (
                  <span>
                    <strong style={{ color: '#ef4444' }}> Significant variances:</strong>
                    {significantlyOver.map((cat, idx) => (
                      <span key={idx}>
                        {idx > 0 && (idx === significantlyOver.length - 1 ? ' and ' : ', ')}
                        <strong>{cat.label}</strong> at {cat.actual.toFixed(1)}% (goal: {cat.goal.toFixed(1)}%, <strong>{cat.variance.toFixed(1)}pp over</strong>)
                      </span>
                    ))}
                    , requiring management attention to bring spending in line with targets.
                  </span>
                );
              }
              
              return ' Goals monitoring available in the Goals tab.';
            })()}
          </p>

          {/* Valuation Section */}
          <p style={{ margin: '12px 0' }}>
            <strong style={{ color: '#667eea' }}>Valuation</strong> analysis employs three methodologies:
            {(() => {
              if (monthly.length < 12) return ' (requires 12+ months of data)';
              
              const last12 = monthly.slice(-12);
              const ttmRevenue = last12.reduce((sum, m) => sum + (m.revenue || 0), 0);
              const ttmCOGS = last12.reduce((sum, m) => sum + (m.cogsTotal || 0), 0);
              const ttmExpense = last12.reduce((sum, m) => sum + (m.expense || 0), 0);
              const ttmDepreciation = last12.reduce((sum, m) => sum + (m.depreciationAmortization || 0), 0);
              const ttmInterest = last12.reduce((sum, m) => sum + (m.interestExpense || 0), 0);
              const ttmNetIncome = ttmRevenue - ttmCOGS - ttmExpense;
              const ttmEBITDA = ttmNetIncome + ttmDepreciation + ttmInterest;
              const ttmOwnerBasePay = last12.reduce((sum, m) => sum + (m.ownerBasePay || 0), 0);
              const ttmSDE = ttmEBITDA + ttmOwnerBasePay;
              
              const sdeVal = ttmSDE * sdeMultiplier;
              const ebitdaVal = ttmEBITDA * ebitdaMultiplier;
              
              const currentMonth = monthly[monthly.length - 1];
              const month12Ago = monthly.length >= 13 ? monthly[monthly.length - 13] : monthly[0];
              const currentWC_val = ((currentMonth.cash || 0) + (currentMonth.ar || 0) + (currentMonth.inventory || 0)) - ((currentMonth.ap || 0) + (currentMonth.otherCL || 0));
              const priorWC = ((month12Ago.cash || 0) + (month12Ago.ar || 0) + (month12Ago.inventory || 0)) - ((month12Ago.ap || 0) + (month12Ago.otherCL || 0));
              const changeInWC = currentWC_val - priorWC;
              const changeInFixedAssets = (currentMonth.fixedAssets || 0) - (month12Ago.fixedAssets || 0);
              const ttmCapEx = Math.max(0, changeInFixedAssets + ttmDepreciation);
              const ttmFreeCashFlow = ttmNetIncome + ttmDepreciation - changeInWC - ttmCapEx;
              const growthRate = growth_24mo / 100;
              const discountRate = dcfDiscountRate / 100;
              const terminalGrowthRate = dcfTerminalGrowth / 100;
              let dcfVal = 0;
              for (let year = 1; year <= 5; year++) {
                const projectedFCF = ttmFreeCashFlow * Math.pow(1 + growthRate, year);
                dcfVal += projectedFCF / Math.pow(1 + discountRate, year);
              }
              const terminalValue = (ttmFreeCashFlow * Math.pow(1 + growthRate, 5) * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
              dcfVal += terminalValue / Math.pow(1 + discountRate, 5);
              
              const avgValuation = (sdeVal + ebitdaVal + dcfVal) / 3;
              const minValuation = Math.min(sdeVal, ebitdaVal, dcfVal);
              const maxValuation = Math.max(sdeVal, ebitdaVal, dcfVal);
              
              return (
                <span>
                  <strong> SDE method</strong> values the business at <strong style={{ color: '#10b981' }}>${(sdeVal / 1000000).toFixed(2)}M</strong> 
                  (applying {sdeMultiplier.toFixed(1)}x to TTM SDE of ${(ttmSDE / 1000).toFixed(1)}K).
                  <strong> EBITDA multiple</strong> indicates <strong style={{ color: '#667eea' }}>${(ebitdaVal / 1000000).toFixed(2)}M</strong> 
                  (using {ebitdaMultiplier.toFixed(1)}x on EBITDA of ${(ttmEBITDA / 1000).toFixed(1)}K).
                  <strong> DCF analysis</strong> projects <strong style={{ color: '#8b5cf6' }}>${(dcfVal / 1000000).toFixed(2)}M</strong> 
                  (discounting 5-year projections at {dcfDiscountRate.toFixed(1)}% with {dcfTerminalGrowth.toFixed(1)}% terminal growth).
                  The valuation range of <strong>${(minValuation / 1000000).toFixed(2)}M - ${(maxValuation / 1000000).toFixed(2)}M</strong> (average: ${(avgValuation / 1000000).toFixed(2)}M) provides comprehensive perspective
                  {(maxValuation - minValuation) / avgValuation > 0.5 ? <span style={{ color: '#f59e0b' }}>, though significant variance suggests need for additional validation</span> :
                   ', with reasonable consistency across methodologies'}.
                </span>
              );
            })()}
          </p>

          {/* Overall Financial Score */}
          <p style={{ margin: '12px 0 0 0' }}>
            The overall Financial Score of <strong>{finalScore.toFixed(1)}</strong>
            {finalScore >= 80 ? <span style={{ color: '#10b981' }}> (Strong Financial Performance)</span> :
             finalScore >= 50 ? <span style={{ color: '#3b82f6' }}> (Good Fundamentals)</span> :
             finalScore >= 30 ? <span style={{ color: '#f59e0b' }}> (Financial Stress)</span> :
             <span style={{ color: '#ef4444' }}> (Critical Situation)</span>}.
          </p>
        </div>
      </div>

      {/* Key Highlights Section */}
      <div style={{ display: 'grid', gap: '16px', marginTop: '24px' }}>
        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#10b981', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>✅</span> Key Strengths & Competitive Advantages
          </h3>
          <div style={{ fontSize: '15px', lineHeight: '1.8', color: '#1e293b' }}>
            {mdaAnalysis.strengths.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '24px' }}>
                {mdaAnalysis.strengths.map((str: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>{str}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: '#64748b' }}>
                The company is showing stable financial performance across key metrics. Continued monitoring will help identify emerging strengths.
              </p>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ef4444', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span> Areas Requiring Management Attention
          </h3>
          <div style={{ fontSize: '15px', lineHeight: '1.8', color: '#1e293b' }}>
            {mdaAnalysis.weaknesses.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '24px' }}>
                {mdaAnalysis.weaknesses.map((weak: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>{weak}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: '#64748b' }}>
                Continue monitoring key financial indicators to maintain current performance levels and identify potential challenges early.
              </p>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#667eea', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>💡</span> Strategic Recommendations & Action Items
          </h3>
          <div style={{ fontSize: '15px', lineHeight: '1.8', color: '#1e293b' }}>
            {mdaAnalysis.insights.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '24px' }}>
                {mdaAnalysis.insights.map((ins: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>{ins}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: '#64748b' }}>
                Regular review of financial metrics and strategic planning will support continued growth and financial stability.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Strengths and Insights Tab Component
function StrengthsInsightsTab({ mdaAnalysis }: { mdaAnalysis: MDAAnalysis }) {
  return (
    <div id="mda-strengths-insights-container" style={{ display: 'grid', gap: '24px' }}>
      {mdaAnalysis.strengths.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#10b981', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>✅</span> Strengths
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {mdaAnalysis.strengths.map((str, idx) => (
              <li key={idx} style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', marginBottom: '8px', borderLeft: '4px solid #10b981', fontSize: '14px', color: '#166534' }}>
                {str}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mdaAnalysis.weaknesses.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ef4444', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>⚠️</span> Areas for Improvement
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {mdaAnalysis.weaknesses.map((weak, idx) => (
              <li key={idx} style={{ padding: '12px 16px', background: '#fef2f2', borderRadius: '8px', marginBottom: '8px', borderLeft: '4px solid #ef4444', fontSize: '14px', color: '#991b1b' }}>
                {weak}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mdaAnalysis.insights.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#667eea', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>🔍</span> Strategic Insights
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {mdaAnalysis.insights.map((ins, idx) => (
              <li key={idx} style={{ padding: '12px 16px', background: '#ede9fe', borderRadius: '8px', marginBottom: '8px', borderLeft: '4px solid #667eea', fontSize: '14px', color: '#5b21b6' }}>
                {ins}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Critical Review Tab Component
function CriticalReviewTab({
  monthly,
  formatDollar
}: {
  monthly: MonthlyData[];
  formatDollar: (value: number) => string;
}) {
  const issues = useMemo(() => {
    const issuesList: { category: string; severity: 'high' | 'medium' | 'low'; title: string; description: string; metric?: string }[] = [];
    const last = monthly[monthly.length - 1];
    const prev = monthly.length >= 2 ? monthly[monthly.length - 2] : last;
    const last12 = monthly.slice(-12);
    const prev12 = monthly.length >= 24 ? monthly.slice(-24, -12) : last12;

    // Revenue Trend Analysis
    const revenueGrowth12mo = prev12.length > 0 ? 
      ((last12.reduce((s, m) => s + m.revenue, 0) - prev12.reduce((s, m) => s + m.revenue, 0)) / prev12.reduce((s, m) => s + m.revenue, 0)) * 100 : 0;
    
    if (revenueGrowth12mo < -5) {
      issuesList.push({
        category: 'Revenue Trends',
        severity: 'high',
        title: 'Declining Revenue',
        description: `Revenue has declined by ${Math.abs(revenueGrowth12mo).toFixed(1)}% over the past 12 months. This indicates potential market share loss, pricing pressure, or customer attrition.`,
        metric: `${revenueGrowth12mo.toFixed(1)}%`
      });
    }

    // Revenue Volatility
    const revenueStdDev = (() => {
      const mean = last12.reduce((s, m) => s + m.revenue, 0) / last12.length;
      const variance = last12.reduce((s, m) => s + Math.pow(m.revenue - mean, 2), 0) / last12.length;
      return Math.sqrt(variance);
    })();
    const revenueCV = (revenueStdDev / (last12.reduce((s, m) => s + m.revenue, 0) / last12.length)) * 100;
    
    if (revenueCV > 25) {
      issuesList.push({
        category: 'Revenue Trends',
        severity: 'medium',
        title: 'High Revenue Volatility',
        description: `Revenue shows high volatility (${revenueCV.toFixed(1)}% coefficient of variation). This indicates inconsistent sales performance and unpredictable cash flow.`,
        metric: `${revenueCV.toFixed(1)}% CV`
      });
    }

    // Expense Analysis
    const expenseGrowth12mo = prev12.length > 0 ?
      ((last12.reduce((s, m) => s + m.expense, 0) - prev12.reduce((s, m) => s + m.expense, 0)) / prev12.reduce((s, m) => s + m.expense, 0)) * 100 : 0;
    
    if (expenseGrowth12mo > revenueGrowth12mo + 5) {
      issuesList.push({
        category: 'Expense Control',
        severity: 'high',
        title: 'Expenses Growing Faster Than Revenue',
        description: `Expenses have grown ${expenseGrowth12mo.toFixed(1)}% while revenue grew ${revenueGrowth12mo.toFixed(1)}%. This margin compression threatens profitability and requires immediate cost control measures.`,
        metric: `${(expenseGrowth12mo - revenueGrowth12mo).toFixed(1)}% gap`
      });
    }

    // Expense Ratio
    const expenseRatio = (last.expense / last.revenue) * 100;
    const prevExpenseRatio = prev12.length > 0 ? (prev12.reduce((s, m) => s + m.expense, 0) / prev12.reduce((s, m) => s + m.revenue, 0)) * 100 : expenseRatio;
    
    if (expenseRatio > 90) {
      issuesList.push({
        category: 'Expense Control',
        severity: 'high',
        title: 'Extremely High Expense Ratio',
        description: `Total expenses represent ${expenseRatio.toFixed(1)}% of revenue, leaving minimal profit margin. The business is operating near break-even or at a loss.`,
        metric: `${expenseRatio.toFixed(1)}%`
      });
    } else if (expenseRatio - prevExpenseRatio > 5) {
      issuesList.push({
        category: 'Expense Control',
        severity: 'medium',
        title: 'Rising Expense Ratio',
        description: `Expenses as a percentage of revenue have increased from ${prevExpenseRatio.toFixed(1)}% to ${expenseRatio.toFixed(1)}%, indicating deteriorating operational efficiency.`,
        metric: `+${(expenseRatio - prevExpenseRatio).toFixed(1)}%`
      });
    }

    // Liquidity Issues
    const currentAssets = last.tca || ((last.cash || 0) + (last.ar || 0) + (last.inventory || 0) + (last.otherCA || 0));
    const currentLiab = Math.abs(last.tcl || ((last.ap || 0) + (last.otherCL || 0)));
    const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;

    if (currentRatio < 1.0 && currentRatio > 0) {
      issuesList.push({
        category: 'Liquidity',
        severity: 'high',
        title: 'Critical Liquidity Position',
        description: `Current ratio of ${currentRatio.toFixed(2)} indicates current liabilities exceed current assets. The company may struggle to meet short-term obligations.`,
        metric: `${currentRatio.toFixed(2)}`
      });
    } else if (currentRatio < 1.2 && currentRatio > 0) {
      issuesList.push({
        category: 'Liquidity',
        severity: 'medium',
        title: 'Weak Liquidity Position',
        description: `Current ratio of ${currentRatio.toFixed(2)} is below the healthy threshold of 1.5, indicating potential difficulty covering short-term obligations.`,
        metric: `${currentRatio.toFixed(2)}`
      });
    }

    // Cash Position
    if (monthly.length >= 13) {
      const currentCash = last.cash;
      const priorCash = monthly[monthly.length - 13].cash;
      const cashChange = currentCash - priorCash;
      const cashChangePercent = priorCash > 0 ? (cashChange / priorCash) * 100 : 0;

      if (cashChangePercent < -20) {
        issuesList.push({
          category: 'Liquidity',
          severity: 'high',
          title: 'Significant Cash Decline',
          description: `Cash position has declined ${Math.abs(cashChangePercent).toFixed(1)}% over the past year (${formatDollar(Math.abs(cashChange))}). Monitor cash burn rate and consider capital raising or cost reduction strategies.`,
          metric: `${cashChangePercent.toFixed(1)}%`
        });
      }
    }

    // Negative Equity
    if (last.totalEquity < 0) {
      issuesList.push({
        category: 'Leverage',
        severity: 'high',
        title: 'Negative Equity',
        description: `Total equity is negative (${formatDollar(last.totalEquity)}), indicating liabilities exceed assets. This represents severe financial distress requiring immediate corrective action.`,
        metric: formatDollar(last.totalEquity)
      });
    }

    // Debt Leverage
    const debtToEquity = last.totalEquity > 0 ? last.totalLiab / last.totalEquity : 999;
    if (debtToEquity > 2.0 && last.totalEquity > 0) {
      issuesList.push({
        category: 'Leverage',
        severity: 'high',
        title: 'High Debt Leverage',
        description: `Debt-to-equity ratio of ${debtToEquity.toFixed(2)} indicates the company is heavily leveraged. High debt levels increase financial risk and interest expenses.`,
        metric: `${debtToEquity.toFixed(2)}x`
      });
    }

    return issuesList;
  }, [monthly]);

  return (
    <div id="mda-key-metrics-container" style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <h2 style={{ fontSize: '28px', fontWeight: '700', color: '#1e293b', marginBottom: '12px', borderBottom: '3px solid #ef4444', paddingBottom: '12px' }}>
        ⚠️ Critical Review Items
      </h2>
      
      <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '32px', lineHeight: '1.6' }}>
        This analysis reviews all financial data to identify issues requiring immediate attention.
      </p>

      {issues.length === 0 ? (
        <div style={{ padding: '24px', background: '#f0fdf4', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
          <p style={{ margin: 0, color: '#166534', fontSize: '15px', fontWeight: '500' }}>
            ✅ No critical issues identified. The company's financial metrics are within acceptable ranges.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {issues.map((issue, idx) => (
            <div
              key={idx}
              style={{
                padding: '20px',
                background: issue.severity === 'high' ? '#fef2f2' : issue.severity === 'medium' ? '#fffbeb' : '#f8fafc',
                borderRadius: '8px',
                borderLeft: `4px solid ${issue.severity === 'high' ? '#ef4444' : issue.severity === 'medium' ? '#f59e0b' : '#64748b'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: issue.severity === 'high' ? '#dc2626' : issue.severity === 'medium' ? '#d97706' : '#475569', textTransform: 'uppercase', marginBottom: '4px' }}>
                    {issue.category}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: '0 0 8px 0' }}>
                    {issue.title}
                  </h3>
                </div>
                {issue.metric && (
                  <div style={{ 
                    padding: '6px 12px', 
                    background: 'white', 
                    borderRadius: '6px', 
                    fontSize: '16px', 
                    fontWeight: '700', 
                    color: issue.severity === 'high' ? '#dc2626' : issue.severity === 'medium' ? '#d97706' : '#475569' 
                  }}>
                    {issue.metric}
                  </div>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.6' }}>
                {issue.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

