'use client';

import dynamic from 'next/dynamic';

// Dynamic imports for charts
const LineChart = dynamic(() => import('./charts/Charts').then(mod => mod.LineChart), { ssr: false });

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
  cogsTotal?: number;
  netProfit?: number;
  depreciationAmortization?: number;
  fixedAssets?: number;
}

interface TrendDataPoint {
  month: string;
  revenue: number;
  expense: number;
  financialScore: number;
  profitabilityScore: number;
  rgs: number;
  rgsAdj: number;
  expenseAdj: number;
  adsScore: number;
  alr1: number;
  alrGrowth: number;
}

interface FinancialScoreViewProps {
  monthly: MonthlyData[];
  trendData: TrendDataPoint[];
  companyName: string | null;
  finalScore: number;
  profitabilityScore: number;
  assetDevScore: number;
  baseRGS: number;
  adjustedRGS: number;
  growth_24mo: number;
  growth_6mo: number;
  expenseAdjustment: number;
  alr1: number | string;
  alrGrowth: number;
}

export default function FinancialScoreView({
  monthly,
  trendData,
  companyName,
  finalScore,
  profitabilityScore,
  assetDevScore,
  baseRGS,
  adjustedRGS,
  growth_24mo,
  growth_6mo,
  expenseAdjustment,
  alr1,
  alrGrowth
}: FinancialScoreViewProps) {

  if (!monthly || monthly.length === 0 || !trendData || trendData.length === 0) {
    return (
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '48px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#64748b', marginBottom: '16px' }}>
            No Financial Data Available
          </h2>
          <p style={{ fontSize: '16px', color: '#94a3b8' }}>
            Please upload financial data to view your Financial Score analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
      <style>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.3in;
          }
          
          /* Hide navigation and UI elements */
          .no-print,
          header,
          nav,
          aside,
          [role="navigation"],
          button {
            display: none !important;
          }
          
          /* Remove backgrounds and shadows for print */
          * {
            box-shadow: none !important;
          }
          
          /* Compress title and header */
          .fs-header h1 {
            font-size: 18px !important;
            margin-bottom: 8px !important;
          }
          
          .fs-header > div {
            font-size: 16px !important;
          }
          
          /* Compress main score cards */
          .fs-score-cards {
            margin-bottom: 12px !important;
            gap: 10px !important;
          }
          
          .fs-score-cards > div {
            padding: 10px !important;
            border-radius: 6px !important;
          }
          
          .fs-score-cards > div > div:first-child {
            font-size: 9px !important;
            margin-bottom: 4px !important;
          }
          
          .fs-score-cards > div > div:nth-child(2) {
            font-size: 22px !important;
          }
          
          /* Compress detail cards */
          .fs-detail-cards {
            gap: 8px !important;
            margin-bottom: 12px !important;
          }
          
          .fs-detail-cards > div {
            padding: 8px !important;
          }
          
          .fs-detail-cards > div > div:first-child {
            font-size: 8px !important;
          }
          
          .fs-detail-cards > div > div:nth-child(2) {
            font-size: 14px !important;
          }
          
          .fs-detail-cards > div > div:last-child {
            font-size: 7px !important;
          }
          
          /* Compress chart grid */
          .fs-charts-grid {
            gap: 8px !important;
          }
          
          .fs-charts-grid > div {
            transform: scale(0.65);
            transform-origin: top left;
            width: 153.85%;
            height: 250px;
            margin-bottom: -69px;
          }
          
          /* Force page break after row 2 (after 4th chart) */
          .fs-charts-grid > div:nth-child(4) {
            page-break-after: always;
            break-after: page;
          }
          
          /* Show page 2 header only on print */
          .page-2-header {
            display: block !important;
            margin-top: 72px !important;
          }
          
          h2 {
            font-size: 12px !important;
            margin-bottom: 8px !important;
          }
        }
      `}</style>
      
      <div className="fs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Financial Score Trends</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {companyName && <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
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
            }}>
            🖨️ Print
          </button>
        </div>
      </div>
      
      {monthly.length >= 24 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>Financial Score Analysis</h2>
          
          <div className="fs-score-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '32px', maxWidth: '900px' }}>
            <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '12px', padding: '20px', color: 'white', boxShadow: '0 4px 12px rgba(102,126,234,0.3)' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', opacity: 0.9 }}>Corelytics Financial Score</div>
              <div style={{ fontSize: '42px', fontWeight: '700' }}>{finalScore.toFixed(2)}</div>
            </div>
            <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '20px', border: '2px solid #86efac' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>Profitability Score</div>
              <div style={{ fontSize: '42px', fontWeight: '700', color: '#10b981' }}>{profitabilityScore.toFixed(2)}</div>
            </div>
            <div style={{ background: '#ede9fe', borderRadius: '12px', padding: '20px', border: '2px solid #c4b5fd' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#5b21b6', marginBottom: '8px' }}>Asset Development Score</div>
              <div style={{ fontSize: '42px', fontWeight: '700', color: '#8b5cf6' }}>{assetDevScore.toFixed(2)}</div>
            </div>
          </div>

          <div className="fs-detail-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Base RGS (24mo)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{baseRGS.toFixed(0)}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Growth: {growth_24mo.toFixed(1)}%</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Adjusted RGS (6mo)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{adjustedRGS.toFixed(1)}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Growth: {growth_6mo.toFixed(1)}%</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Expense Adjustment</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: expenseAdjustment >= 0 ? '#10b981' : '#ef4444' }}>
                {expenseAdjustment >= 0 ? '+' : ''}{expenseAdjustment}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                {expenseAdjustment > 0 ? '✓ BONUS' : expenseAdjustment < 0 ? '✗ PENALTY' : 'NEUTRAL'}
              </div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>ALR-1 (Current)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{typeof alr1 === 'number' ? alr1.toFixed(2) : alr1}</div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>ALR Growth %</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: alrGrowth >= 0 ? '#10b981' : '#ef4444' }}>
                {alrGrowth >= 0 ? '+' : ''}{alrGrowth.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="fs-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
        <LineChart title="Financial Score Trend" data={trendData} valueKey="financialScore" color="#667eea" compact />
        <LineChart title="Profitability Score Trend" data={trendData} valueKey="profitabilityScore" color="#10b981" compact />
        <LineChart title="Revenue Growth Score (RGS)" data={trendData} valueKey="rgs" color="#f59e0b" compact />
        <LineChart title="RGS with 6-Month Adjustment" data={trendData} valueKey="rgsAdj" color="#3b82f6" compact />
        
        {/* Page 2 Header - only visible in print */}
        <div className="page-2-header" style={{ display: 'none', gridColumn: '1 / -1', paddingBottom: '72px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Financial Score Trends (cont)</h1>
            {companyName && <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{companyName}</div>}
          </div>
        </div>
        
        <LineChart title="Expense Adjustment" data={trendData} valueKey="expenseAdj" color="#8b5cf6" compact />
        <LineChart title="Asset Development Score (ADS)" data={trendData} valueKey="adsScore" color="#ec4899" compact />
        <LineChart title="ALR-1 (Asset-Liability Ratio)" data={trendData} valueKey="alr1" color="#14b8a6" compact />
        <LineChart title="ALR Growth %" data={trendData} valueKey="alrGrowth" color="#f97316" compact />
      </div>
    </div>
  );
}

